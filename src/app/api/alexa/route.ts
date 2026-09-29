import { processAlexaHttp } from "@/server/alexa/http";
import { getAppContext } from "@/server/app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Alexa Custom Skill → Sofía. Firma y timestamp verificados en cada request. */
export async function POST(req: Request) {
  return processAlexaHttp(await req.text(), req.headers, getAppContext);
}
