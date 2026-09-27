import { getAppContext } from "@/server/app";
import { handle } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const app = await getAppContext();
  return { provider: app.provider.name, model: app.provider.model, db: app.dbKind };
});
