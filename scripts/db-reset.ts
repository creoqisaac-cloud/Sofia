/**
 * Borra la base PGlite local y la vuelve a crear con datos DEMO.
 * Solo aplica a PGlite: nunca borra una base remota (DATABASE_URL).
 * Detén la app antes de ejecutarlo.
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/server/config";
import { createHandleFromConfig } from "../src/server/app";
import { seedDemo } from "../src/server/db/seed";

const config = loadConfig();
if (config.DATABASE_URL) {
  console.error("db:reset solo borra la base PGlite local. Con DATABASE_URL, reinicia la base desde Supabase/psql.");
  process.exit(1);
}
const dir = path.resolve(config.PGLITE_DATA_DIR);
fs.rmSync(dir, { recursive: true, force: true });
const handle = createHandleFromConfig(config);
await handle.migrate();
await seedDemo(handle.db, { now: new Date() });
await handle.close();
console.log(`Base local reiniciada con datos DEMO en ${dir}.`);
