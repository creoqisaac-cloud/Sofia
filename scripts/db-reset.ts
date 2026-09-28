/**
 * Borra la base PGlite local (y sus documentos privados locales) y la vuelve a crear
 * con datos DEMO. Solo aplica a PGlite: nunca borra una base remota. Detén la app antes.
 */
import fs from "node:fs";
import path from "node:path";
import { createAppContext, createHandleFromConfig } from "../src/server/app";
import { loadConfig } from "../src/server/config";
import { DemoProvider } from "../src/server/agent/providers/demo";
import { LocalPrivateStorage } from "../src/server/storage/documents";

const config = loadConfig();
if (config.DATABASE_URL) {
  console.error("db:reset solo borra la base PGlite local. Con DATABASE_URL, reinicia la base desde Supabase/psql.");
  process.exit(1);
}
const dir = path.resolve(config.PGLITE_DATA_DIR);
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(path.resolve(config.SOFIA_PRIVATE_STORAGE_DIR), { recursive: true, force: true });
const app = await createAppContext({ handle: createHandleFromConfig(config), provider: new DemoProvider(), migrate: true, seed: true, storage: new LocalPrivateStorage(config.SOFIA_PRIVATE_STORAGE_DIR) });
await app.close();
console.log(`Base local reiniciada con datos DEMO en ${dir}.`);
