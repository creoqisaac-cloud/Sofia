/**
 * Contrato con el LLM: el modelo propone, el backend valida.
 *  - Texto libre / propuestas fuera de reglas no modifican la BD.
 *  - Salida inválida → respuesta segura, sin efectos del modelo.
 *  - Proveedor Claude: bucle de herramientas deterministas + structured outputs (cliente simulado, sin red).
 *  - Prompt por capas: capas estables idénticas para todos los clientes (cacheables).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPrompt } from "@/server/agent/prompt";
import { AnthropicProvider } from "@/server/agent/providers/anthropic";
import { demoBrain } from "@/server/agent/providers/demo";
import { buildTurnContext } from "@/server/agent/turn-context";
import { lastRun, makeApp, newProspect, scripted, type TestApp } from "./helpers";

describe("el modelo propone, el backend decide", () => {
  let app: TestApp;
  afterAll(async () => app?.close());

  it("propuestas fuera de reglas se rechazan o se convierten en aprobación", async () => {
    app = await makeApp(
      scripted(() => ({
        customer_reply: "Déjame revisarlo con Mario.",
        stage_proposal: { stage: "sold", reason: "El modelo cree que ya compró" },
        tags_proposed: [{ tag: "cliente_vip_inventado", reason: "x" }],
        requested_tools: [{ tool: "modify_price", reason: "Bajar precio", arguments: { requested_window: null, document_type: null, amount: 250_000, note: null } }],
      })),
    );
    const p = await newProspect(app);
    const turn = await p.say("Me interesa el City");
    expect(turn.effects.crm.stageTo).not.toBe("sold");
    expect(turn.effects.crm.rejected[0]?.what).toBe("stage");
    expect(turn.effects.tags.rejected.map((t) => t.value)).toContain("cliente_vip_inventado");
    expect(turn.effects.actions).toEqual([expect.objectContaining({ tool: "modify_price", decision: "approval_requested" })]);
    expect(turn.effects.approvals.map((a) => a.actionType)).toEqual(["price_modification"]);
    const state = await p.state();
    expect(state.crm.stage).toBe("profiling");
    expect(state.tags.map((t) => t.tag)).not.toContain("cliente_vip_inventado");
  });

  it("una salida que no cumple el esquema produce respuesta segura y no aplica propuestas del modelo", async () => {
    const app2 = await makeApp(scripted(() => "esto no es JSON del esquema"));
    const p = await newProspect(app2);
    const turn = await p.say("Hola, me interesa el City, tengo 90 mil de enganche");
    expect(turn.status).toBe("fallback");
    expect(turn.output).toBeNull();
    expect(turn.effects.facts.changes).toHaveLength(0);
    const run = await lastRun(app2, p.customer.id);
    expect(run.status).toBe("fallback");
    expect(run.error).toMatch(/Salida inválida/);
    await app2.close();
  });
});

describe("prompt por capas", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("las capas estables son idénticas entre clientes y no contienen datos del cliente", async () => {
    const a = await newProspect(app, "Cliente Uno");
    const b = await newProspect(app, "Cliente Dos");
    const ra = await a.sayRaw("Me interesa el City");
    const rb = await b.sayRaw("¿Cuánto cuesta la CR-V?");
    const pa = buildPrompt(await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: a.conversation.id, newMessageId: ra.inboundMessageId, now: app.clock.now() }));
    const pb = buildPrompt(await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: b.conversation.id, newMessageId: rb.inboundMessageId, now: app.clock.now() }));
    expect(pa.system).toEqual(pb.system);
    expect(pa.system.map((l) => l.name)).toEqual(["core_identity", "communication_style", "behavior_rules", "safety_authorization", "tool_definitions", "output_contract"]);
    expect(JSON.stringify(pa.system)).not.toContain("Cliente Uno");
    expect(pa.user.map((l) => l.name)).toEqual(["customer_context", "memory", "commercial_context", "conversation"]);
  });
});

describe("proveedor Claude (cliente simulado)", () => {
  let app: TestApp;
  afterAll(async () => app?.close());

  it("ejecuta herramientas deterministas, envía structured outputs y valida la respuesta", async () => {
    const requests: Array<Record<string, unknown>> = [];
    let call = 0;
    const fakeClient = {
      beta: {
        messages: {
          create: async (params: Record<string, unknown>) => {
            requests.push(structuredClone(params));
            call++;
            if (call === 1) {
              return {
                model: "claude-opus-5",
                stop_reason: "tool_use",
                usage: { input_tokens: 100, output_tokens: 20 },
                content: [{ type: "tool_use", id: "tu_1", name: "calculate_quote", input: { model: "City", version: "Sport", down_payment: 100_000, term_months: 48, payment_method: "financing" } }],
              };
            }
            // Segunda vuelta: el "modelo" usa la cifra que le devolvió la herramienta.
            const toolResult = JSON.stringify((params.messages as Array<{ content: unknown }>).at(-1)!.content);
            const monthly = toolResult.match(/mensualidad \$([\d,]+(?:\.\d+)?)/)![1]!;
            const base = demoBrain(ctxHolder.ctx!);
            return {
              model: "claude-opus-5",
              stop_reason: "end_turn",
              usage: { input_tokens: 150, output_tokens: 80 },
              content: [{ type: "text", text: JSON.stringify({ ...base, customer_reply: `Con 100 mil de enganche a 48 meses quedaría aprox. en $${monthly} al mes (estimación, dato DEMO).` }) }],
            };
          },
        },
      },
    };
    const ctxHolder: { ctx: Parameters<typeof demoBrain>[0] | null } = { ctx: null };
    const provider = new AnthropicProvider({ model: "claude-opus-5", effort: "medium", client: fakeClient as unknown as Anthropic });
    const original = provider.generate.bind(provider);
    provider.generate = async (req) => {
      ctxHolder.ctx = req.ctx;
      return original(req);
    };

    app = await makeApp(provider);
    const p = await newProspect(app);
    const turn = await p.say("Me interesa el City Sport, ¿cuánto pagaría con 100 mil de enganche?");

    expect(turn.status).toBe("ok");
    expect(turn.reply).toMatch(/aprox\. en \$[\d,]+/);
    expect(requests).toHaveLength(2);
    const first = requests[0]!;
    expect(first.model).toBe("claude-opus-5");
    expect(first.thinking).toEqual({ type: "adaptive" });
    expect(first.fallbacks).toBe("default");
    expect(first.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect((first.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect((first.system as Array<{ cache_control?: unknown }>)[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect((first.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(["get_commercial_info", "calculate_quote"]);

    const run = await lastRun(app, p.customer.id);
    expect(run.toolCalls).toEqual([expect.objectContaining({ name: "calculate_quote", ok: true })]);
    expect(run.usage).toMatchObject({ input_tokens: 250, output_tokens: 100 });
    const state = await p.state();
    expect(state.quotes.some((q) => q.calculationType === "estimate" && q.status === "presented")).toBe(true);
  });
});
