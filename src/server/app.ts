/**
 * Contexto de aplicación: base de datos, reloj, workspace y cerebro.
 * En Next.js se usa un singleton; en pruebas se crea uno aislado por caso.
 */
import { eq } from "drizzle-orm";
import { loadConfig, type AppConfig } from "./config";
import { createPgliteHandle, createPostgresHandle, type Db, type DbHandle } from "./db/client";
import * as s from "./db/schema";
import { DEMO_WORKSPACE_SLUG, seedDemo } from "./db/seed";
import { seedDemoSprint2 } from "./db/seed-sprint2";
import { seedDemoSprint3 } from "./db/seed-sprint3";
import { createProvider, type LlmProvider } from "./agent/providers";
import { systemClock, type Clock } from "./lib/clock";
import { logger } from "./lib/logger";
import { LocalPrivateStorage, type DocumentStorage } from "./storage/documents";

export interface AppContext {
  db: Db;
  dbKind: DbHandle["kind"];
  clock: Clock;
  workspaceId: string;
  advisorUserId: string | null;
  provider: LlmProvider;
  storage: DocumentStorage;
  close(): Promise<void>;
}

export async function createAppContext(opts: {
  handle: DbHandle;
  provider: LlmProvider;
  clock?: Clock;
  migrate?: boolean;
  seed?: boolean;
  storage?: DocumentStorage;
}): Promise<AppContext> {
  const clock = opts.clock ?? systemClock;
  if (opts.migrate ?? true) await opts.handle.migrate();
  let workspaceId: string;
  if (opts.seed ?? true) {
    workspaceId = (await seedDemo(opts.handle.db, { now: clock.now() })).workspaceId;
  } else {
    const [ws] = await opts.handle.db.select().from(s.workspaces).where(eq(s.workspaces.slug, DEMO_WORKSPACE_SLUG));
    if (!ws) throw new Error("No existe el workspace. Ejecuta `npm run db:seed` o habilita SOFIA_AUTO_SEED.");
    workspaceId = ws.id;
  }
  const [advisor] = await opts.handle.db.select().from(s.users).where(eq(s.users.workspaceId, workspaceId)).limit(1);
  const app: AppContext = {
    db: opts.handle.db,
    dbKind: opts.handle.kind,
    clock,
    workspaceId,
    advisorUserId: advisor?.id ?? null,
    provider: opts.provider,
    storage: opts.storage ?? new LocalPrivateStorage(".data/private-docs"),
    close: () => opts.handle.close(),
  };
  // Sprint 2: financieras, plantillas sintéticas y clientes DEMO (idempotente).
  if (opts.seed ?? true) {
    await seedDemoSprint2(app);
    // Sprint 3: cotizador V2, placas, seguimiento (idempotente).
    await seedDemoSprint3(app);
  }
  return app;
}

export function createHandleFromConfig(config: AppConfig): DbHandle {
  return config.DATABASE_URL ? createPostgresHandle(config.DATABASE_URL) : createPgliteHandle(config.PGLITE_DATA_DIR);
}

const globalForApp = globalThis as unknown as { __sofiaApp?: Promise<AppContext> };

/** Singleton para el runtime de Next.js (sobrevive a recargas en desarrollo). */
export function getAppContext(): Promise<AppContext> {
  if (!globalForApp.__sofiaApp) {
    const config = loadConfig();
    const handle = createHandleFromConfig(config);
    // Con PGlite local todo es automático; con una base remota (Supabase) migrar/sembrar es explícito,
    // para no meter datos DEMO en una base real por accidente.
    const autoMigrate = config.SOFIA_AUTO_MIGRATE ? config.SOFIA_AUTO_MIGRATE === "true" : handle.kind === "pglite";
    const autoSeed = config.SOFIA_AUTO_SEED ? config.SOFIA_AUTO_SEED === "true" : handle.kind === "pglite";
    globalForApp.__sofiaApp = createAppContext({
      handle,
      provider: createProvider(config),
      migrate: autoMigrate,
      seed: autoSeed,
      storage: new LocalPrivateStorage(config.SOFIA_PRIVATE_STORAGE_DIR),
    }).then((app) => {
      logger.info("sofia.ready", { db: app.dbKind, provider: app.provider.name, model: app.provider.model });
      return app;
    });
    globalForApp.__sofiaApp.catch(() => {
      globalForApp.__sofiaApp = undefined;
    });
  }
  return globalForApp.__sofiaApp;
}
