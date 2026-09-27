import type { BuiltPrompt } from "../prompt";
import type { ReadToolExecutor } from "../read-tools";
import type { TurnContext } from "../turn-context";

export interface ProviderRequest {
  ctx: TurnContext;
  prompt: BuiltPrompt;
  tools: ReadToolExecutor;
}

export interface ProviderResponse {
  /** Salida cruda (sin validar). El orquestador la valida con AgentOutputSchema. */
  raw: unknown;
  model: string | null;
  usage?: Record<string, number>;
}

export interface LlmProvider {
  readonly name: "anthropic" | "demo" | "scripted";
  readonly model: string | null;
  /** ¿Tiene sentido reintentar con retroalimentación de guardrails? */
  readonly supportsCorrection: boolean;
  generate(req: ProviderRequest): Promise<ProviderResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "refusal" | "invalid_output" | "api_error" | "truncated",
  ) {
    super(message);
  }
}
