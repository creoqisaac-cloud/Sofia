import { getAppContext } from "@/server/app";
import { handle } from "@/server/http";
import { getCommercialOverview } from "@/server/services/commercial";

export const dynamic = "force-dynamic";

export const GET = handle(async () => getCommercialOverview(await getAppContext()));
