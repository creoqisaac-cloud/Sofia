import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { calibrateMarioVoice, loadMarioVoiceProfile } from "@/server/agent/mario-voice";

export const dynamic = "force-dynamic";
const Calibration = z.object({
  samples: z.array(z.string().trim().min(12).max(1200)).min(6).max(80),
}).strict();

/** Requires the existing authenticated Sofía management session via proxy. */
export const GET = handle(async () => {
  const app = await getAppContext();
  return { profile: await loadMarioVoiceProfile(app.db, app.workspaceId) };
});

export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const body = await parseBody(request, Calibration);
  return { profile: await calibrateMarioVoice(app.db, app.workspaceId, body.samples) };
});
