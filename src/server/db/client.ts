/**
 * Conexión a base de datos.
 *
 * - Sin DATABASE_URL: PGlite (PostgreSQL embebido) persistido en disco.
 *   Cero infraestructura para desarrollo; mismo dialecto y migraciones.
 * - Con DATABASE_URL: PostgreSQL real (p. ej. Supabase) vía `postgres`.
 * - Pruebas: PGlite en memoria.
 */
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Db;
  kind: "pglite" | "postgres";
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/** `dataDir` undefined → base en memoria (pruebas). */
export function createPgliteHandle(dataDir?: string): DbHandle {
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  return {
    db: db as unknown as Db,
    kind: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}

export function createPostgresHandle(url: string, opts: { max?: number } = {}): DbHandle {
  // prepare:false → compatible con el pooler de Supabase (Supavisor).
  const client = postgres(url, { max: opts.max ?? (Number(process.env.SOFIA_DB_POOL_MAX) || 5), prepare: false });
  const db = drizzlePostgres(client, { schema });
  return {
    db: db as unknown as Db,
    kind: "postgres",
    migrate: () => migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.end(),
  };
}
