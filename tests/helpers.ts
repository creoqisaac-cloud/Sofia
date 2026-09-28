import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { LocalPrivateStorage } from "@/server/storage/documents";
import { createPgliteHandle } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createAppContext, type AppContext } from "@/server/app";
import { DemoProvider } from "@/server/agent/providers/demo";
import { ScriptedProvider, type Script } from "@/server/agent/providers/scripted";
import type { LlmProvider } from "@/server/agent/providers/types";
import { fixedClock } from "@/server/lib/clock";
import { createCustomer, getCustomerState } from "@/server/services/customers";
import { postCustomerMessage, postMarioMessage, setControlMode } from "@/server/services/conversation";

export const TEST_NOW = "2026-09-27T16:00:00.000Z";

export type TestApp = AppContext & { testClock: ReturnType<typeof fixedClock> };

/** Contexto aislado: PGlite en memoria + migraciones + datos DEMO + reloj fijo. */
export async function makeApp(provider: LlmProvider = new DemoProvider(), dataDir?: string): Promise<TestApp> {
  const clock = fixedClock(TEST_NOW);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "sofia-docs-"));
  const app = await createAppContext({ handle: createPgliteHandle(dataDir), provider, clock, storage: new LocalPrivateStorage(dataDir ? `${dataDir}-docs` : storageDir) });
  return Object.assign(app, { testClock: clock });
}

export function scripted(script: Script) {
  return new ScriptedProvider(script);
}

export async function newProspect(app: AppContext, name = "Prospecto Demo") {
  const { customer, conversation } = await createCustomer(app, { displayName: name });
  return {
    customer,
    conversation,
    say: async (text: string) => {
      const res = await postCustomerMessage(app, conversation.id, text);
      if (!res.turn) throw new Error("Sofía no respondió (Mario tiene el control)");
      return res.turn;
    },
    sayRaw: (text: string) => postCustomerMessage(app, conversation.id, text),
    mario: (text: string) => postMarioMessage(app, conversation.id, text),
    control: (mode: "sofia" | "mario") => setControlMode(app, conversation.id, mode),
    state: () => getCustomerState(app, customer.id),
  };
}

export async function lastRun(app: AppContext, customerId: string) {
  const [run] = await app.db.select().from(s.agentRuns).where(eq(s.agentRuns.customerId, customerId)).orderBy(desc(s.agentRuns.createdAt)).limit(1);
  return run!;
}
