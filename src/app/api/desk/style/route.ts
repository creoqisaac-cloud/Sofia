import { z } from "zod";
import { getAppContext } from "@/server/app";
import { loadStyle, saveStyle } from "@/server/desk/style";
import { handle, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const app = await getAppContext();
  return loadStyle(app.db, app.workspaceId);
});

const Style = z.object({
  assistantName: z.string().max(40).optional(),
  advisorName: z.string().max(60).optional(),
  agency: z.string().max(80).optional(),
  tone: z.enum(["cercano", "formal"]).optional(),
  emojis: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  urgency: z.enum(["suave", "normal", "alta"]).optional(),
  signature: z.string().max(120).optional(),
  followupDays: z.array(z.number().int().min(1).max(120)).max(8).optional(),
  healthyDownPct: z.number().min(0.05).max(0.6).optional(),
  dayPhrases: z.record(z.string().regex(/^[0-6]$/), z.string().max(240)).optional(),
  restOnSunday: z.boolean().optional(),
});

export const PUT = handle(async (request: Request) => saveStyle(await getAppContext(), await parseBody(request, Style)));
