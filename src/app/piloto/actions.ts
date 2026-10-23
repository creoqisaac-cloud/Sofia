"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { ServiceError } from "@/server/services/errors";
import { registerPilotVisit } from "@/server/services/pilot-delivery";

export type PilotFormState = { ok: false; error: string } | null;

export async function registerPilotAction(_previous: PilotFormState, form: FormData): Promise<PilotFormState> {
  let result: Awaited<ReturnType<typeof registerPilotVisit>>;
  try {
    const kind = String(form.get("kind") ?? "visit");
    if (kind !== "visit" && kind !== "test_drive") throw new ServiceError("Selecciona visita o prueba de manejo.");
    result = await registerPilotVisit(await getAppContext(), {
      name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? ""),
      model: String(form.get("model") ?? ""), date: String(form.get("date") ?? ""),
      time: String(form.get("time") ?? ""), kind,
    });
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: error.message };
    return { ok: false, error: "No fue posible registrar la cita. Vuelve a intentarlo." };
  }
  revalidatePath("/agenda");
  revalidatePath("/piloto");
  redirect(`/piloto?cita=${encodeURIComponent(result.appointmentId)}`);
}
