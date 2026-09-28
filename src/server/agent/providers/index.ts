import type { AppConfig } from "../../config";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";
import type { LlmProvider } from "./types";

/**
 * Selección de proveedor:
 * - demo: motor determinista (sin red). Valor por defecto: la app funciona sin credenciales de IA.
 * - anthropic: Claude (usa las credenciales estándar del SDK).
 * - auto: Claude si hay ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN; si no, demo.
 */
export function createProvider(config: AppConfig): LlmProvider {
  const hasCredentials = Boolean(config.ANTHROPIC_API_KEY || config.ANTHROPIC_AUTH_TOKEN);
  if (config.SOFIA_LLM_PROVIDER === "demo" || (config.SOFIA_LLM_PROVIDER === "auto" && !hasCredentials)) {
    return new DemoProvider();
  }
  return new AnthropicProvider({ model: config.SOFIA_MODEL, effort: config.SOFIA_EFFORT });
}

export type { LlmProvider } from "./types";
