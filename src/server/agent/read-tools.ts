/**
 * Ejecutor de herramientas de SOLO LECTURA. Todo cálculo comercial ocurre
 * aquí (determinista), nunca en el texto del modelo. Lo que devuelven estas
 * herramientas se agrega al contexto del turno para que los guardrails
 * reconozcan esas cifras como respaldadas.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Intent } from "@/domain/intents";
import { computeQuote, type QuoteComputation } from "../commercial/quoting";
import { describeQuote, retrieveCommercialContext, type RetrievedItem } from "../commercial/retrieval";
import type { TurnContext } from "./turn-context";

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;
}

export interface TurnScratch {
  quotes: Array<{ refId: string; computation: QuoteComputation & { ok: true } }>;
  extraItems: RetrievedItem[];
  unknownTopics: string[];
  toolCalls: ToolCallRecord[];
}

export function newScratch(): TurnScratch {
  return { quotes: [], extraItems: [], unknownTopics: [], toolCalls: [] };
}

const GetInfoInput = z.object({
  model: z.string().min(1),
  topic: z.enum(["price", "bonus", "financing", "insurance", "availability", "features", "warranty", "documents", "general"]),
});

const QuoteInput = z.object({
  model: z.string().min(1),
  version: z.string().min(1),
  down_payment: z.number().nonnegative(),
  term_months: z.number().int().positive().nullable(),
  payment_method: z.enum(["financing", "cash"]),
});

const TOPIC_INTENTS: Record<z.infer<typeof GetInfoInput>["topic"], Intent[]> = {
  price: ["ask_price"],
  bonus: ["ask_bonus", "ask_price"],
  financing: ["ask_financing"],
  insurance: ["ask_insurance"],
  availability: ["ask_availability"],
  features: ["ask_features"],
  warranty: ["ask_warranty"],
  documents: ["ask_documents"],
  general: ["ask_price", "ask_features"],
};

const MAX_TOOL_CALLS_PER_TURN = 6;

export class ReadToolExecutor {
  constructor(
    private readonly ctx: TurnContext,
    readonly scratch: TurnScratch,
  ) {}

  async execute(name: string, input: unknown): Promise<{ ok: boolean; content: string }> {
    if (this.scratch.toolCalls.length >= MAX_TOOL_CALLS_PER_TURN) {
      return this.record(name, input, false, "Límite de consultas por turno alcanzado. Responde con lo que ya tienes.");
    }
    switch (name) {
      case "get_commercial_info":
        return this.getCommercialInfo(input);
      case "calculate_quote":
        return this.calculateQuote(input);
      default:
        return this.record(name, input, false, `Herramienta desconocida: ${name}`);
    }
  }

  private record(name: string, input: unknown, ok: boolean, content: string) {
    this.scratch.toolCalls.push({ name, input, ok, summary: content.slice(0, 500) });
    return { ok, content };
  }

  private getCommercialInfo(input: unknown) {
    const parsed = GetInfoInput.safeParse(input);
    if (!parsed.success) return this.record("get_commercial_info", input, false, `Entrada inválida: ${parsed.error.message}`);
    const { model, topic } = parsed.data;
    const result = retrieveCommercialContext(this.ctx.catalog, {
      models: [model],
      versionByModel: {},
      intents: new Set(TOPIC_INTENTS[topic]),
      paymentMethod: typeof this.ctx.provisionalProfile.payment_method === "string" ? this.ctx.provisionalProfile.payment_method : undefined,
      query: topic,
      now: this.ctx.now,
    });
    if (result.modelsInScope.length === 0) {
      return this.record("get_commercial_info", input, false, `No hay registro del modelo "${model}". Catálogo: ${result.catalogOverview.join(" | ")}`);
    }
    for (const item of result.items) {
      if (!this.scratch.extraItems.some((x) => x.refId === item.refId)) this.scratch.extraItems.push(item);
    }
    this.scratch.unknownTopics.push(...result.unknownTopics);
    const lines = result.items.map((i) => `- ${i.line}`).join("\n") || "- (sin información registrada)";
    const unknown = result.unknownTopics.length ? `\nSin información confirmada: ${result.unknownTopics.join("; ")}` : "";
    return this.record("get_commercial_info", input, true, `${lines}${unknown}`);
  }

  private calculateQuote(input: unknown) {
    const parsed = QuoteInput.safeParse(input);
    if (!parsed.success) return this.record("calculate_quote", input, false, `Entrada inválida: ${parsed.error.message}`);
    const q = parsed.data;
    const computation = computeQuote(
      this.ctx.catalog,
      { model: q.model, version: q.version, downPayment: q.down_payment, termMonths: q.term_months, paymentMethod: q.payment_method },
      this.ctx.now,
    );
    if (!computation.ok) {
      return this.record("calculate_quote", input, false, `No se pudo calcular (${computation.reason}): ${computation.message}`);
    }
    const refId = randomUUID();
    this.scratch.quotes.push({ refId, computation });
    return this.record("calculate_quote", input, true, describeQuote(computation, refId));
  }
}
