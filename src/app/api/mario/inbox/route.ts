import { getAppContext } from "@/server/app";
import { handle } from "@/server/http";
import { getInbox } from "@/server/services/mario";

export const dynamic = "force-dynamic";

export const GET = handle(async () => getInbox(await getAppContext()));
