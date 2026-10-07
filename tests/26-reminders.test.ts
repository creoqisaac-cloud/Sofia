/**
 * Recordatorios y alarmas: qué se programa en la tablet y cuándo. Datos ficticios.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeFollowup, createFollowup, scheduleAppointment, setAppointmentStatus } from "@/server/services/agenda";
import { createReminder, notificationIdFor, setReminderStatus, upcomingDeviceReminders } from "@/server/services/reminders";
import { makeApp, newProspect, TEST_NOW, type TestApp } from "./helpers";

const NOW = new Date(TEST_NOW).getTime();
const inMin = (m: number) => new Date(NOW + m * 60_000);

describe("recordatorios para la tablet", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("id de notificación: entero positivo de 31 bits y estable por clave", () => {
    const a = notificationIdFor("reminder:x:2026");
    expect(a).toBe(notificationIdFor("reminder:x:2026"));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(0x7fffffff);
    expect(notificationIdFor("reminder:y:2026")).not.toBe(a);
  });

  it("recordatorio libre: no se aceptan horas pasadas; a futuro se programa con su canal", async () => {
    await expect(createReminder(app, { at: inMin(-10), text: "Algo" })).rejects.toThrow(/ya pasó/);
    await expect(createReminder(app, { at: inMin(30), text: "  " })).rejects.toThrow(/qué te recuerdo/);
    const r = await createReminder(app, { at: inMin(90), text: "Llevar expediente al banco", alarm: true });
    const list = await upcomingDeviceReminders(app);
    const item = list.find((x) => x.sourceId === r.id)!;
    expect(item).toMatchObject({ source: "reminder", alarm: true, url: "/followups", at: inMin(90).toISOString() });
    expect(item.title).toMatch(/Llevar expediente/);
    await setReminderStatus(app, r.id, "cancelled");
    expect((await upcomingDeviceReminders(app)).some((x) => x.sourceId === r.id)).toBe(false);
  });

  it("seguimientos: solo los pendientes a futuro (lo vencido vive en Seguimiento)", async () => {
    const p = await newProspect(app, "Cliente Recordatorio");
    const future = await createFollowup(app, { customerId: p.customer.id, dueAt: inMin(120), reason: "Confirmar enganche", action: "Llamar" });
    const past = await createFollowup(app, { customerId: p.customer.id, dueAt: inMin(-120), reason: "Vencido" });
    let list = await upcomingDeviceReminders(app);
    const f = list.find((x) => x.sourceId === future.id)!;
    expect(f).toMatchObject({ source: "followup", url: `/customers/${p.customer.id}`, alarm: false });
    expect(f.title).toMatch(/Cliente Recordatorio/);
    expect(f.body).toMatch(/Llamar — Confirmar enganche/);
    expect(list.some((x) => x.sourceId === past.id)).toBe(false);
    await completeFollowup(app, future.id);
    list = await upcomingDeviceReminders(app);
    expect(list.some((x) => x.sourceId === future.id)).toBe(false);
  });

  it("citas: aviso 1 hora antes y alarma 15 min antes; canceladas no suenan", async () => {
    const p = await newProspect(app, "Cliente Cita");
    const a = await scheduleAppointment(app, { customerId: p.customer.id, at: inMin(180), kind: "test_drive", location: "Agencia" });
    let list = (await upcomingDeviceReminders(app)).filter((x) => x.sourceId === a.id);
    expect(list.map((x) => [x.at, x.alarm])).toEqual([
      [inMin(120).toISOString(), false],
      [inMin(165).toISOString(), true],
    ]);
    expect(list[0]!.title).toMatch(/Prueba de manejo con Cliente Cita/);
    expect(list[0]!.body).toMatch(/Agencia/);
    await setAppointmentStatus(app, a.id, "cancelled");
    list = (await upcomingDeviceReminders(app)).filter((x) => x.sourceId === a.id);
    expect(list).toEqual([]);
  });

  it("lista ordenada por hora y sin duplicados de id", async () => {
    const list = await upcomingDeviceReminders(app);
    const ats = list.map((x) => x.at);
    expect([...ats].sort()).toEqual(ats);
    expect(new Set(list.map((x) => x.notificationId)).size).toBe(list.length);
  });
});
