/**
 * Operación del piloto: citas, seguimiento, HOY, ventas (Excel), placas, devoluciones
 * y borrador PDF sin residuos de la plantilla.
 */
import { and, eq } from "drizzle-orm";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdapter } from "@/domain/credit";
import { EXCEL_COLUMNS, SALE_FIELDS } from "@/domain/sales";
import * as s from "@/server/db/schema";
import { buildDemoTemplate, fillPdf } from "@/server/credit/pdf";
import { DAY_MS } from "@/server/lib/clock";
import { completeFollowup, createFollowup, getFollowupSummary, markContacted, postponeFollowup, scheduleAppointment, setAppointmentStatus } from "@/server/services/agenda";
import { draftPlatesEmail } from "@/server/services/email";
import { addPlateRequirement, ensurePlateCase, NO_PLATE_REQUIREMENTS, removePlateRequirement, setRequirementReceived, listPlateRequirements } from "@/server/services/plates";
import { createReturnCase, listReturnCases, RETURNS_PENDING_DEFINITION } from "@/server/services/returns";
import { createSale, updateSale } from "@/server/services/sales";
import { getTodayItems } from "@/server/services/today";
import { makeApp, newProspect, TEST_NOW, type TestApp } from "./helpers";

describe("operación del piloto", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());
  const now = new Date(TEST_NOW);

  it("HOY: prioridades reales de los datos DEMO (crédito aprobado, documentos, sin respuesta, cita/entrega)", async () => {
    const items = await getTodayItems(app);
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ["credit", "documents", "no_response", "appointment", "delivery"]) expect(kinds, k).toContain(k);
    const juan = items.find((i) => i.title.startsWith("Juan") && i.kind === "credit")!;
    expect(juan.actionLabel).toBe("Continuar venta");
    // una línea principal por cliente (sin duplicar al mismo cliente por la misma razón)
    const main = items.filter((i) => !["appointment", "delivery"].includes(i.kind)).map((i) => i.customerId);
    expect(new Set(main).size).toBe(main.length);
  });

  it("citas: agendar, aparece en HOY si es hoy, cambia de estado con auditoría", async () => {
    const p = await newProspect(app, "Cliente Cita");
    const at = new Date(now);
    at.setHours(23, 30, 0, 0);
    const a = await scheduleAppointment(app, { customerId: p.customer.id, at, kind: "test_drive", location: "Agencia" });
    expect(a.status).toBe("scheduled");
    expect((await getTodayItems(app)).some((i) => i.appointmentId === a.id)).toBe(true);
    await setAppointmentStatus(app, a.id, "confirmed");
    await setAppointmentStatus(app, a.id, "completed");
    const [row] = await app.db.select().from(s.appointments).where(eq(s.appointments.id, a.id));
    expect(row!.status).toBe("completed");
    await expect(setAppointmentStatus(app, a.id, "otro" as never)).rejects.toThrow();
    const audit = await app.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, a.id), eq(s.auditEvents.eventType, "appointment_status")));
    expect(audit.length).toBe(2);
  });

  it("seguimiento: vencido aparece en HOY; posponer mueve un día; completar lo quita; contactar registra último contacto", async () => {
    const p = await newProspect(app, "Cliente Seguimiento");
    const f = await createFollowup(app, { customerId: p.customer.id, dueAt: new Date(now.getTime() - 2 * DAY_MS), reason: "Enviar corrida", promisedByMario: true });
    const today = await getTodayItems(app);
    const item = today.find((i) => i.followupId === f.id)!;
    expect(item.kind).toBe("promise");
    expect(item.detail).toMatch(/Le prometiste/);
    const due = await postponeFollowup(app, f.id, 1);
    expect(due.getTime()).toBe(now.getTime() + DAY_MS);
    await completeFollowup(app, f.id);
    expect((await getTodayItems(app)).some((i) => i.followupId === f.id)).toBe(false);
    await markContacted(app, p.customer.id);
    const sum = await getFollowupSummary(app, p.customer.id);
    expect(sum.lastContactAt?.getTime()).toBe(now.getTime());
    expect(sum.responseStatus).toBe("waiting_customer");
  });

  it("ventas: todas las columnas del Excel real tienen mapeo; VIN interno y auditado", async () => {
    const mapped = SALE_FIELDS.filter((f) => f.column).map((f) => f.column);
    expect(mapped.sort()).toEqual([...EXCEL_COLUMNS].sort());
    expect(EXCEL_COLUMNS.length).toBe(17);
    const p = await newProspect(app, "Cliente Venta");
    const sale = await createSale(app, { customerId: p.customer.id });
    await updateSale(app, sale.id, { vin: "TESTVIN0000000001", orderNumber: "T-1" }, "captura");
    const changes = await app.db.select().from(s.saleRecordChanges).where(eq(s.saleRecordChanges.saleId, sale.id));
    expect(changes.map((c) => c.field).filter((f) => f !== "created").sort()).toEqual(["orderNumber", "vin"]);
  });

  it("placas: requisitos con fuente (nunca inventados), faltantes, 'listo' al completar y correo en borrador", async () => {
    await expect(addPlateRequirement(app, { label: "Algo", sourceLabel: " " })).rejects.toThrow(/fuente/);
    const p = await newProspect(app, "Cliente Placas");
    const pc = await ensurePlateCase(app, p.customer.id);
    expect(pc.requirements.length).toBeGreaterThan(0);
    expect(pc.requirements.every((r) => r.source.length > 0)).toBe(true);
    for (const r of pc.requirements) await setRequirementReceived(app, pc.id, r.id, true);
    const [after] = await app.db.select().from(s.plateCases).where(eq(s.plateCases.id, pc.id));
    expect(after!.status).toBe("ready");
    const email = await draftPlatesEmail(app, p.customer.id);
    expect(email.status).toBe("draft");
    expect(email.sentAt).toBeNull();
    expect(email.body).toMatch(/Documentos que ya tengo/);
    // Sin requisitos capturados, Sofía lo dice en vez de inventarlos.
    for (const r of await listPlateRequirements(app)) await removePlateRequirement(app, r.id);
    const p2 = await newProspect(app, "Cliente Sin Requisitos");
    const pc2 = await ensurePlateCase(app, p2.customer.id);
    expect(pc2.requirements).toEqual([]);
    expect(NO_PLATE_REQUIREMENTS).toMatch(/Mario/);
  });

  it("devoluciones: solo estructura mínima, sin reglas inventadas", async () => {
    const p = await newProspect(app, "Cliente Devolución");
    const r = await createReturnCase(app, { customerId: p.customer.id, reason: "Por definir" });
    expect(r.type).toBe("por_definir");
    expect(r.status).toBe("open");
    expect((await listReturnCases(app)).length).toBeGreaterThan(0);
    expect(RETURNS_PENDING_DEFINITION).toBe("Proceso de devolución pendiente de definición por Mario.");
  });
});

describe("borrador PDF sin residuos de la plantilla", () => {
  it("si la plantilla 'vacía' trae una respuesta PEP marcada o datos de otro cliente, la copia sale limpia", async () => {
    const adapter = getAdapter("BBVA")!;
    const tpl = await PDFDocument.load(await buildDemoTemplate(adapter));
    const form = tpl.getForm();
    (form.getField("relacion pep") as PDFCheckBox).check(); // residuo PEP (como en el PDF real)
    (form.getField("cargo") as PDFTextField).setText("DATO DE OTRO CLIENTE");
    const dirty = await tpl.save();
    const res = await fillPdf(dirty, [{ slot: "bbva.cliente.rfc", pdfField: "rfc", pdfType: "text", value: "TEST850505AB1", checked: null, profileKeys: ["rfc"], factIds: [], sourceLabels: [] }], { title: "t" });
    expect(res.clearedResidue).toBe(2);
    const out = (await PDFDocument.load(res.bytes)).getForm();
    expect((out.getField("relacion pep") as PDFCheckBox).isChecked()).toBe(false);
    expect((out.getField("cargo") as PDFTextField).getText() ?? "").toBe("");
    expect((out.getField("rfc") as PDFTextField).getText()).toBe("TEST850505AB1");
  });
});
