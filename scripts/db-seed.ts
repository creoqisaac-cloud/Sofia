/** Aplica migraciones y siembra los datos DEMO (Sprint 1 y 2) si faltan. Idempotente. */
import { createAppContext, createHandleFromConfig } from "../src/server/app";
import { loadConfig } from "../src/server/config";
import { DemoProvider } from "../src/server/agent/providers/demo";
import { LocalPrivateStorage } from "../src/server/storage/documents";

const config = loadConfig();
const app = await createAppContext({ handle: createHandleFromConfig(config), provider: new DemoProvider(), migrate: true, seed: true, storage: new LocalPrivateStorage(config.SOFIA_PRIVATE_STORAGE_DIR) });
console.log(`Datos DEMO listos (workspace ${app.workspaceId}).`);
await app.close();
