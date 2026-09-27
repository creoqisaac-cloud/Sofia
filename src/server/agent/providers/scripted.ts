/**
 * Proveedor guionizado para pruebas: permite simular respuestas de un LLM
 * (incluidas respuestas indebidas) para verificar que el backend las contiene.
 */
import type { AgentOutput } from "../output-schema";
import type { TurnContext } from "../turn-context";
import { demoBrain } from "./demo";
import type { LlmProvider, ProviderRequest, ProviderResponse } from "./types";

export type Script = (ctx: TurnContext, attempt: number, base: AgentOutput) => Partial<AgentOutput> | unknown;

export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted" as const;
  readonly model = "scripted-test";
  readonly supportsCorrection = true;
  attempts = 0;

  constructor(private readonly script: Script) {}

  async generate({ ctx }: ProviderRequest): Promise<ProviderResponse> {
    this.attempts++;
    const base = demoBrain(ctx);
    const patch = this.script(ctx, this.attempts, base);
    const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? { ...base, ...(patch as object) } : patch;
    return { raw, model: this.model };
  }
}
