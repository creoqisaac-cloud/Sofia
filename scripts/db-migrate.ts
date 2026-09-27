/** Aplica migraciones a la base configurada (PGlite local o DATABASE_URL). */
import { loadConfig } from "../src/server/config";
import { createHandleFromConfig } from "../src/server/app";

const config = loadConfig();
const handle = createHandleFromConfig(config);
await handle.migrate();
console.log(`Migraciones aplicadas (${handle.kind}).`);
await handle.close();
