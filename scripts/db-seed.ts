/** Aplica migraciones y siembra los datos DEMO si la base está vacía. */
import { loadConfig } from "../src/server/config";
import { createHandleFromConfig } from "../src/server/app";
import { seedDemo } from "../src/server/db/seed";

const config = loadConfig();
const handle = createHandleFromConfig(config);
await handle.migrate();
const res = await seedDemo(handle.db, { now: new Date() });
console.log(res.created ? `Datos DEMO sembrados (workspace ${res.workspaceId}).` : "Los datos DEMO ya existían; no se modificó nada.");
await handle.close();
