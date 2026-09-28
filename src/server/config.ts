import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),
  SOFIA_AUTO_MIGRATE: z.enum(["true", "false"]).optional(),
  SOFIA_AUTO_SEED: z.enum(["true", "false"]).optional(),
  SOFIA_LLM_PROVIDER: z.enum(["auto", "demo", "anthropic"]).default("demo"),
  SOFIA_MODEL: z.string().default("claude-opus-5"),
  SOFIA_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  SOFIA_PRIVATE_STORAGE_DIR: z.string().default(".data/private-docs"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return EnvSchema.parse(env);
}
