import { getAppContext } from "@/server/app";
import { handle } from "@/server/http";
import { getCustomerState } from "@/server/services/customers";

export const dynamic = "force-dynamic";

export const GET = handle(async (_request: Request, ctx: RouteContext<"/api/customers/[id]">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  return getCustomerState(app, id);
});
