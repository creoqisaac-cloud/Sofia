import { getAppContext } from "@/server/app";
import { listMedia, uploadMedia } from "@/server/desk/media";
import { handle } from "@/server/http";
import { ServiceError } from "@/server/services/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handle(async (request: Request) => {
  const vehicleId = new URL(request.url).searchParams.get("vehicleId");
  return { media: await listMedia(await getAppContext(), { vehicleId: vehicleId || undefined }) };
});

const uuid = /^[0-9a-f-]{36}$/i;
const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Subida de fotos, videos, flyers o fichas (multipart). Acepta varios archivos a la vez. */
export const POST = handle(async (request: Request) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ServiceError("No se recibió el archivo.");
  }
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw new ServiceError("Elige al menos un archivo.");
  if (files.length > 12) throw new ServiceError("Sube máximo 12 archivos a la vez.");
  const vehicleId = field(form, "vehicleId");
  if (vehicleId && !uuid.test(vehicleId)) throw new ServiceError("Modelo inválido.");
  const validToRaw = field(form, "validTo");
  const validTo = validToRaw ? new Date(`${validToRaw}T23:59:59-06:00`) : null;
  const app = await getAppContext();
  const created = [];
  for (const file of files) {
    created.push(
      await uploadMedia(app, {
        file,
        vehicleId,
        kind: field(form, "kind"),
        title: files.length === 1 ? field(form, "title") : null,
        caption: field(form, "caption"),
        versionName: field(form, "versionName"),
        unitId: null,
        validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo : null,
        sendOnAsk: field(form, "sendOnAsk") !== "false",
      }),
    );
  }
  return { created: created.map((c) => ({ id: c.id, kind: c.kind, title: c.title })) };
});
