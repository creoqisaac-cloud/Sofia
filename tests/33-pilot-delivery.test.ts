import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { makeApp, type TestApp } from "./helpers";
import { normalizePilotPhone, parsePilotDate, pilotConfirmationText, registerPilotVisit } from "@/server/services/pilot-delivery";

describe("Piloto Sofía para Mario", () => {
  let app: TestApp;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });

  it("normaliza el WhatsApp mexicano y valida fecha de Monterrey", () => {
    expect(normalizePilotPhone("(81) 1234-5678")).toBe("528112345678");
    expect(normalizePilotPhone("5218112345678")).toBe("528112345678");
    expect(parsePilotDate("2026-09-28", "17:00").toISOString()).toBe("2026-09-28T23:00:00.000Z");
    expect(() => parsePilotDate("2026-02-31", "17:00")).toThrow("La fecha no existe");
  });

  it("registra una cita real interna, evita duplicados y mantiene confirmación humana", async () => {
    const input = { name: "Pedro Ramírez", phone: "8112345678", model: "CR-V", date: "2026-09-28", time: "17:00", kind: "test_drive" as const };
    const one = await registerPilotVisit(app, input);
    const two = await registerPilotVisit(app, input);
    expect(two.appointmentId).toBe(one.appointmentId);
    const [appt] = await app.db.select().from(s.appointments).where(eq(s.appointments.id, one.appointmentId));
    expect(appt?.status).toBe("scheduled");
    expect(appt?.scheduledAt?.toISOString()).toBe("2026-09-28T23:00:00.000Z");
    expect(appt?.notes).toContain("Honda CR-V");
    const [customer] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, one.customerId), eq(s.customers.workspaceId, app.workspaceId)));
    expect(customer?.phone).toBe("528112345678");
    expect(customer?.source).toBe("manual");
    const copy = pilotConfirmationText({ name: customer!.displayName, model: "CR-V", kind: "test_drive", at: appt!.scheduledAt!, confirmed: false });
    expect(copy).toContain("¿Me confirmas");
    expect(copy).not.toContain("Te confirmo");
  });

  it("protege la agenda de Mario contra otra cita que se empalme", async () => {
    await expect(registerPilotVisit(app, {
      name: "Ana", phone: "8112345679", model: "City", date: "2026-09-28", time: "17:15", kind: "visit",
    })).rejects.toThrow(/ya tiene una cita/);
  });
});
