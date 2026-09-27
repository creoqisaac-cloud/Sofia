/**
 * Proveedor Claude (Anthropic API).
 *
 * - Prompt en capas: las capas estables van en `system` con cache_control
 *   (idénticas para todos los clientes → cache hits); lo dinámico en el
 *   mensaje del usuario.
 * - Herramientas de solo lectura deterministas (manual loop).
 * - Structured outputs: la respuesta final debe cumplir AgentOutputSchema.
 * - Fallback de servidor ante rechazos por clasificadores (`fallbacks: "default"`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AgentOutputSchema } from "../output-schema";
import { renderUserContent } from "../prompt";
import { READ_TOOLS } from "../prompt/tools";
import { ProviderError, type LlmProvider, type ProviderRequest, type ProviderResponse } from "./types";

const MAX_ROUNDS = 5;
const OUTPUT_FORMAT = zodOutputFormat(AgentOutputSchema);

export interface AnthropicProviderOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  client?: Anthropic;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly supportsCorrection = true;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: AnthropicProviderOptions["effort"];

  constructor(opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.effort = opts.effort;
    this.client = opts.client ?? new Anthropic();
  }

  async generate({ prompt, tools }: ProviderRequest): Promise<ProviderResponse> {
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: prompt.system.map((l) => l.text).join("\n\n"), cache_control: { type: "ephemeral" } },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: renderUserContent(prompt) }];
    const usage: Record<string, number> = {};
    let model: string | null = this.model;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: this.effort, format: { type: "json_schema", schema: OUTPUT_FORMAT.schema } },
          system,
          tools: READ_TOOLS,
          messages,
        });
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) throw new ProviderError("Límite de uso de la API alcanzado.", "api_error");
        if (error instanceof Anthropic.AuthenticationError) throw new ProviderError("Credenciales de Anthropic inválidas.", "api_error");
        if (error instanceof Anthropic.BadRequestError) throw new ProviderError(`Solicitud inválida: ${error.message}`, "api_error");
        if (error instanceof Anthropic.APIError) throw new ProviderError(`Error de la API (${error.status}): ${error.message}`, "api_error");
        throw error;
      }

      model = response.model;
      for (const [k, v] of Object.entries(response.usage ?? {})) {
        if (typeof v === "number") usage[k] = (usage[k] ?? 0) + v;
      }

      if (response.stop_reason === "refusal") throw new ProviderError("El modelo declinó responder.", "refusal");
      if (response.stop_reason === "max_tokens") throw new ProviderError("Respuesta truncada (max_tokens).", "truncated");

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason === "tool_use" && toolUses.length > 0) {
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const call of toolUses) {
          const result = await tools.execute(call.name, call.input);
          results.push({ type: "tool_result", tool_use_id: call.id, content: result.content, is_error: !result.ok });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      try {
        return { raw: JSON.parse(text), model, usage };
      } catch {
        throw new ProviderError("La salida del modelo no es JSON válido.", "invalid_output");
      }
    }
    throw new ProviderError("Demasiadas rondas de herramientas en un turno.", "invalid_output");
  }
}
