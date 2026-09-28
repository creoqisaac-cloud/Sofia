/**
 * Crédito: mapeo del perfil universal a BBVA/Banorte y generación de PDF.
 * Usa las plantillas AcroForm SINTÉTICAS (DEMO); los mismos adaptadores se
 * conectan a los PDF reales vía `field_mapping` de la plantilla.
 */
import { createHash } from "node:crypto";
import { PDFCheckBox, PDFDocument, PDFName, PDFTextField } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeApplication, buildFillPlan, getAdapter, type FieldStates } from "@/domain/credit";
import * as s from "@/server/db/schema";
import { buildDemoTemplate, inspectPdfFields } from "@/server/credit/pdf";
import { createApplication, generateApplicationPdf, getApplicationDetail, getGeneratedPdf, registerTemplate } from "@/server/services/credit";
import { recordFacts, resolveConflict, getProfileState } from "@/server/services/profile";
import { makeApp, newProspect, type TestApp } from "./helpers";

const confirmed = (value: unknown) => ({ status: "confirmed" as const, value, factId: `f-${String(value)}`, sourceLabel: "Captura" });

const FULL: Record<string, string | number> = {
  first_name: "Prueba",
  paternal_last_name: "Sintetica",
  maternal_last_name: "Test",
  birth_date: "1985-05-05",
  nationality: "Mexicana",
  gender: "female",
  marital_status: "single",
  dependents: 0,
  rfc: "TEST850505AB1",
  curp: "TEST850505MDFXXX01",
  mobile_phone: "5550000100",
  email: "prueba@example.com",
  street: "Calle Prueba",
  exterior_number: "10",
  postal_code: "03000",
  neighborhood: "Colonia Prueba",
  municipality: "Municipio Prueba",
  city: "Ciudad Prueba",
  state: "Estado Prueba",
  housing_status: "rented",
  residence_years: 3,
  monthly_fixed_income: 30000,
  company_name: "Empresa Prueba",
  company_activity: "Comercio",
  employment_status: "employed",
  occupation_type: "Empleado",
  job_title: "Analista",
  employment_years: 5,
  work_phone: "5550000200",
  work_street: "Av Prueba",
  work_exterior_number: "20",
  work_postal_code: "04000",
  work_neighborhood: "Col Trabajo",
  work_municipality: "Mun Trabajo",
  work_city: "Ciudad Trabajo",
  work_state: "Estado Trabajo",
  reference_1_name: "Ref Uno",
  reference_1_phone: "5550000301",
  reference_1_relationship: "Hermana",
  reference_2_name: "Ref Dos",
  reference_2_phone: "5550000302",
  reference_2_relationship: "Amigo",
  reference_1_address: "Calle Ref 1",
  reference_2_address: "Calle Ref 2",
  landlord_name: "Arrendador Prueba",
  landlord_phone: "5550000303",
  landlord_address: "Calle Arrendador 3",
  monthly_rent: 8000,
  education_level: "bachelor",
  company_type: "private",
};

/** Nombre REAL del campo AcroForm de un slot (sin sufijo de widget). */
const fieldOf = (code: string, slot: string) => (getAdapter(code)!.slots.find((sl) => sl.slot === slot)!.field ?? slot).replace(/#\d+$/, "");
const slotOfField = (code: string, name: string) => getAdapter(code)!.slots.find((sl) => (sl.field ?? sl.slot).replace(/#\d+$/, "") === name);

describe("adaptadores (dominio)", () => {
  const states: FieldStates = Object.fromEntries(Object.entries(FULL).map(([k, v]) => [k, confirmed(v)]));

  it.each(["BBVA", "BANORTE"])("el perfil común mapea a %s sin faltantes obligatorios", (code) => {
    const analysis = analyzeApplication(getAdapter(code)!, states);
    expect(analysis.totals.missing).toBe(0);
    expect(analysis.totals.conflicts).toBe(0);
    expect(analysis.totals.confirmed).toBeGreaterThan(25);
    expect(analysis.suggestedStatus).toBe("ready_for_review");
  });

  it("Banorte y BBVA concatenan calle y número; BBVA parte la fecha en día/mes/año y marca la opción correcta", () => {
    const banorte = analyzeApplication(getAdapter("BANORTE")!, states).slots.find((x) => x.slot.slot === "banorte.domicilio.calle_numero")!;
    expect(banorte.value).toBe("CALLE PRUEBA 10");
    const bbva = analyzeApplication(getAdapter("BBVA")!, states);
    const v = (slot: string) => bbva.slots.find((x) => x.slot.slot === slot)!;
    expect([v("bbva.cliente.nacimiento_dia").value, v("bbva.cliente.nacimiento_mes").value, v("bbva.cliente.nacimiento_anio").value]).toEqual(["05", "05", "1985"]);
    expect(v("bbva.cliente.genero_f").checked).toBe(true);
    expect(v("bbva.cliente.genero_m").checked).toBe(false);
    expect(v("bbva.cliente.nacionalidad_mexicana").checked).toBe(true); // "Mexicana" ≈ MEXICANA
    expect(v("bbva.domicilio.vivienda_rentada").checked).toBe(true);
  });

  it("faltante queda vacío, conflicto no se autocompleta, observado requiere confirmación", () => {
    const partial: FieldStates = { ...states, curp: { status: "conflicting", value: null, factId: null, sourceLabel: null }, rfc: undefined, email: { status: "observed", value: "x@example.com", factId: "o", sourceLabel: "Conversación" } };
    const analysis = analyzeApplication(getAdapter("BBVA")!, partial);
    const plan = buildFillPlan(analysis, Object.fromEntries(getAdapter("BBVA")!.slots.map((sl) => [sl.slot, sl.slot])));
    const filled = plan.fill.map((f) => f.slot);
    expect(filled).not.toContain("bbva.cliente.curp");
    expect(filled).not.toContain("bbva.cliente.rfc");
    expect(filled).not.toContain("bbva.cliente.email");
    expect(plan.skipped).toEqual(expect.arrayContaining([{ slot: "bbva.cliente.curp", reason: "conflict" }, { slot: "bbva.cliente.rfc", reason: "missing" }, { slot: "bbva.cliente.email", reason: "needs_confirmation" }]));
    expect(analysis.suggestedStatus).toBe("conflict");
  });

  it("firma, PEP y consentimientos nunca entran al plan aunque estén mapeados", () => {
    for (const code of ["BBVA", "BANORTE"]) {
      const adapter = getAdapter(code)!;
      const plan = buildFillPlan(analyzeApplication(adapter, states), Object.fromEntries(adapter.slots.map((sl) => [sl.slot, sl.slot])));
      const humanOrSign = adapter.slots.filter((sl) => sl.class === "HUMAN_CONFIRMATION" || sl.class === "SIGNATURE").map((sl) => sl.slot);
      expect(humanOrSign.length).toBeGreaterThan(5);
      for (const slot of humanOrSign) expect(plan.fill.map((f) => f.slot)).not.toContain(slot);
    }
    expect(getAdapter("BBVA")!.slots.filter((sl) => sl.section === "pep").every((sl) => sl.class === "HUMAN_CONFIRMATION")).toBe(true);
    expect(getAdapter("BANORTE")!.slots.filter((sl) => sl.section === "medico").every((sl) => sl.class === "HUMAN_CONFIRMATION")).toBe(true);
  });

  it("empleo anterior y coacreditado son condicionales", () => {
    const bbva = analyzeApplication(getAdapter("BBVA")!, { ...states, employment_years: confirmed(1) });
    expect(bbva.slots.find((x) => x.slot.slot === "bbva.empleo_anterior.empresa")!.category).toBe("missing");
    const banorte = analyzeApplication(getAdapter("BANORTE")!, states);
    expect(banorte.slots.find((x) => x.slot.slot === "banorte.coacreditado.nombres")!.category).toBe("not_applicable");
    expect(banorte.slots.find((x) => x.slot.slot === "banorte.firmas.coacreditado")!.category).toBe("not_applicable");
  });
});

describe("solicitud y PDF (integración)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  async function prepared(code: string) {
    const p = await newProspect(app, `PDF ${code}`);
    await recordFacts(app, { customerId: p.customer.id, entries: Object.entries(FULL).map(([key, value]) => ({ key, value })), sourceType: "mario_capture", sourceLabel: "Captura de prueba" });
    const application = await createApplication(app, { customerId: p.customer.id, institutionCode: code });
    return { p, application };
  }

  it.each(["BBVA", "BANORTE"])("%s: genera una COPIA nueva, con datos confirmados, sin tocar la plantilla, firmas ni consentimientos", async (code) => {
    const { p, application } = await prepared(code);
    // Un conflicto sin resolver no debe llenarse.
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "curp", value: "TEST850505MDFXXX09" }], sourceType: "document", sourceLabel: "Documento de prueba" });
    const detail = await getApplicationDetail(app, application.id);
    expect(detail.application.status).toBe("conflict");
    const templateBytes = await app.storage.get(detail.template!.sourceDocument);
    const shaBefore = createHash("sha256").update(templateBytes).digest("hex");

    const res = await generateApplicationPdf(app, application.id);
    expect(res.filled).toBeGreaterThan(20);

    const templateAfter = await app.storage.get(detail.template!.sourceDocument);
    expect(createHash("sha256").update(templateAfter).digest("hex")).toBe(shaBefore); // plantilla intacta
    const { bytes, doc } = await getGeneratedPdf(app, res.document.id);
    expect(doc.storage.key).not.toBe(detail.template!.sourceDocument.key); // copia nueva
    expect(createHash("sha256").update(bytes).digest("hex")).not.toBe(shaBefore);

    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    const prefix = code.toLowerCase();
    expect((form.getField(fieldOf(code, `${prefix}.cliente.rfc`)) as PDFTextField).getText()).toBe("TEST850505AB1");
    expect((form.getField(fieldOf(code, `${prefix}.cliente.curp`)) as PDFTextField).getText() ?? "").toBe(""); // conflicto → vacío
    for (const field of form.getFields()) {
      const slot = slotOfField(code, field.getName())!;
      if (slot.class === "SIGNATURE" || slot.class === "HUMAN_CONFIRMATION") {
        if (field instanceof PDFCheckBox) expect(field.isChecked(), slot.slot).toBe(false);
        if (field instanceof PDFTextField) expect(field.getText() ?? "", slot.slot).toBe("");
      }
    }
    // Registro: campos llenados, fuentes, fecha y autor (sin valores).
    expect(doc.fieldsFilled.length).toBe(res.filled);
    expect(doc.sourcesUsed.every((x) => x.status === "confirmed" && x.sourceLabel)).toBe(true);
    expect(doc.generatedBy).toBe(app.advisorUserId);
    expect(doc.generatedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(doc.fieldsFilled)).not.toContain("TEST850505AB1");
    expect(doc.fieldsSkipped).toEqual(expect.arrayContaining([{ slot: `${prefix}.cliente.curp`, reason: "conflict" }]));
  });

  it("al resolver el conflicto la solicitud se recalcula y el dato confirmado sí se llena", async () => {
    const { p, application } = await prepared("BBVA");
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "curp", value: "TEST850505MDFXXX09" }], sourceType: "document", sourceLabel: "Documento" });
    const st = (await getProfileState(app.db, p.customer.id)).fields.curp!.state;
    await resolveConflict(app, { customerId: p.customer.id, key: "curp", chosenFactId: st.candidates.find((c) => c.sourceLabel === "Captura de prueba")!.factId });
    const detail = await getApplicationDetail(app, application.id);
    expect(detail.application.status).toBe("ready_for_review");
    const res = await generateApplicationPdf(app, application.id);
    const pdf = await PDFDocument.load((await getGeneratedPdf(app, res.document.id)).bytes);
    expect((pdf.getForm().getField(fieldOf("BBVA", "bbva.cliente.curp")) as PDFTextField).getText()).toBe("TEST850505MDFXXX01");
    // Historial de estados de la solicitud
    const events = await app.db.select().from(s.creditApplicationEvents).where(eq(s.creditApplicationEvents.applicationId, application.id));
    expect(events.map((e) => e.toStatus)).toEqual(expect.arrayContaining(["draft", "conflict", "ready_for_review"]));
  });

  it("un cliente puede tener varias solicitudes (BBVA rechazada, Banorte aprobada)", async () => {
    const { p, application: bbva } = await prepared("BBVA");
    const banorte = await createApplication(app, { customerId: p.customer.id, institutionCode: "BANORTE" });
    const { setApplicationStatus } = await import("@/server/services/credit");
    for (const [id, final] of [[bbva.id, "rejected"], [banorte.id, "approved"]] as const) {
      await setApplicationStatus(app, id, "ready_for_signature", "revisada");
      await setApplicationStatus(app, id, "submitted", "enviada");
      await setApplicationStatus(app, id, final, "respuesta");
    }
    const rows = await app.db.select().from(s.creditApplications).where(and(eq(s.creditApplications.customerId, p.customer.id)));
    expect(rows.map((r) => r.status).sort()).toEqual(["approved", "rejected"]);
    await expect(setApplicationStatus(app, banorte.id, "draft", "")).rejects.toThrow(); // transición no permitida
  });

  it("registrar una plantilla: se inspeccionan campos AcroForm y se sugiere mapeo", async () => {
    const bytes = await buildDemoTemplate(getAdapter("BANORTE")!);
    const fields = await inspectPdfFields(bytes);
    expect(fields.find((f) => f.name === "Check Box145")?.type).toBe("checkbox"); // mismo nombre que el PDF real
    const res = await registerTemplate(app, { institutionCode: "BANORTE", name: "Prueba", version: "t1", bytes, fileName: "x.pdf" });
    expect(res.unmappedSlots).toEqual([]);
  });
});

describe("importar una solicitud previa llenada (AcroForm, sin OCR)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("los valores del PDF entran como fuente y los choques quedan en conflicto", async () => {
    const { importPreviousApplication } = await import("@/server/services/credit");
    const adapter = getAdapter("BBVA")!;
    const doc = await PDFDocument.load(await buildDemoTemplate(adapter));
    const form = doc.getForm();
    (form.getField("rfc") as PDFTextField).setText("TEST850505AB1");
    (form.getField("curp") as PDFTextField).setText("TEST850505MDFXXX07");
    (form.getField("nacimiento dia") as PDFTextField).setText("05");
    (form.getField("nacimiento mes") as PDFTextField).setText("05");
    (form.getField("nacimiento año") as PDFTextField).setText("1985");
    // Casillas de varias opciones: se marca el widget de "Soltero" y el de "F".
    const pick = (name: string, i: number) => {
      const cb = form.getField(name) as PDFCheckBox;
      const ws = cb.acroField.getWidgets();
      const on = ws[i]!.getOnValue()!;
      cb.acroField.dict.set(PDFName.of("V"), on);
      ws.forEach((w, j) => w.setAppearanceState(j === i ? on : PDFName.of("Off")));
    };
    pick("estado civil", 0);
    pick("gen", 1);
    pick("pep", 1); // PEP nunca se importa
    const p = await newProspect(app, "Importación");
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "curp", value: "TEST850505MDFXXX01" }], sourceType: "mario_capture", sourceLabel: "Captura" });
    const res = await importPreviousApplication(app, { customerId: p.customer.id, institutionCode: "BBVA", bytes: await doc.save() });
    expect(res.conflicts).toEqual(["curp"]);
    expect(res.saved).toEqual(expect.arrayContaining(["rfc", "marital_status", "gender", "birth_date"]));
    const st = await getProfileState(app.db, p.customer.id);
    expect(st.fields.marital_status!.state.value).toBe("single");
    expect(st.fields.gender!.state.value).toBe("female");
    expect(st.fields.birth_date!.state.value).toBe("1985-05-05");
    expect(st.fields.rfc!.state.sourceLabel).toBe("Solicitud BBVA (archivo)");
    expect(st.fields.rfc!.state.status).toBe("observed"); // requiere confirmación antes de autollenar
  });
});
