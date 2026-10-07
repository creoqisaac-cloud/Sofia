import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { EMAIL_PRESETS, getEmailAccountStatus, removeEmailAccount, saveEmailAccount, sendTestEmail } from "@/server/services/email-account";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Estado de la cuenta de correo de Sofía (sin contraseña) y opciones de proveedor. */
export const GET = handle(async () => {
  const app = await getAppContext();
  return { account: await getEmailAccountStatus(app), presets: EMAIL_PRESETS };
});

const SaveSchema = z.object({
  preset: z.string().max(20),
  address: z.string().max(200),
  displayName: z.string().max(80).optional(),
  host: z.string().max(200).optional(),
  port: z.union([z.number(), z.string().max(6)]).optional(),
  secure: z.boolean().optional(),
  user: z.string().max(200).optional(),
  password: z.string().max(300).optional(),
});

/** Asignar la cuenta: se comprueba la conexión antes de guardar; la contraseña se guarda cifrada. */
export const PUT = handle(async (request: Request) => {
  const app = await getAppContext();
  return { account: await saveEmailAccount(app, await parseBody(request, SaveSchema)) };
});

/** Correo de prueba. */
export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const body = await parseBody(request, z.object({ to: z.string().max(200).optional() }));
  return { sentTo: await sendTestEmail(app, body.to) };
});

export const DELETE = handle(async () => {
  await removeEmailAccount(await getAppContext());
  return { ok: true };
});
