/**
 * Piloto tablet: bandeja de documentos → extracción (sin IA) → OBSERVADO → revisión de Mario →
 * CONFIRMADO → solicitud/PDF. Cotización registrada por Mario (Sofía no cotiza). Métricas de IA.
 * Todos los datos son ficticios.
 */
import { and, eq } from "drizzle-orm";
import { PDFDocument, PDFTextField, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdapter } from "@/domain/credit";
import { runCommand } from "@/server/command/router";
import { buildDemoTemplate } from "@/server/credit/pdf";
import * as s from "@/server/db/schema";
import { runExtraction, type ExtractionProvider } from "@/server/extraction";
import { isTabletUserAgent } from "@/server/pilot";
import { aiUsageSince } from "@/server/services/ai-usage";
import { createApplication, generateApplicationPdf, getGeneratedPdf } from "@/server/services/credit";
import { captureFromDocument, getInboxDocument, listInbox, readDocumentFile, reviewFact, setInboxStatus, uploadDocument } from "@/server/services/inbox";
import { recordFacts } from "@/server/services/profile";
import { getTabletSummary, listAllApplications, registerMarioQuote } from "@/server/services/tablet";
import { makeApp, newProspect, type TestApp } from "./helpers";

// PNG 1×1 válido
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

async function filledBbva(values: Record<string, string>) {
  const doc = await PDFDocument.load(await buildDemoTemplate(getAdapter("BBVA")!));
  for (const [name, v] of Object.entries(values)) (doc.getForm().getField(name) as PDFTextField).setText(v);
  return new Uint8Array(await doc.save());
}

async function textPdf(text: string) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage().drawText(text, { x: 30, y: 700, size: 10, font: f });
  return new Uint8Array(await d.save());
}

describe("piloto tablet", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("rechaza tipos no permitidos (por contenido, no por extensión)", async () => {
    const p = await newProspect(app, "Doc Inválido");
    await expect(uploadDocument(app, { customerId: p.customer.id, bytes: new TextEncoder().encode("hola"), fileName: "x.pdf", docType: "ine" })).rejects.toThrow(/PDF, JPG o PNG/);
  });

  it("foto sin OCR: se guarda en privado, sin datos inventados y queda para captura manual", async () => {
    const p = await newProspect(app, "Foto INE");
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes: PNG, fileName: "ine.png", docType: "ine" });
    expect(doc.extractionStatus).toBe("needs_review");
    expect(doc.storageKey).not.toMatch(/public/);
    expect((await getInboxDocument(app, doc.id)).facts).toEqual([]);
    const file = await readDocumentFile(app, doc.id);
    expect(file.mime).toBe("image/png");
    // Captura manual desde el documento: Mario escribe → confirmado y ligado al documento
    await captureFromDocument(app, { customerId: p.customer.id, documentId: doc.id, key: "curp", value: "TEST850505MDFXXX01" });
    const facts = (await getInboxDocument(app, doc.id)).facts;
    expect(facts[0]).toMatchObject({ key: "curp", status: "confirmed" });
  });

  it("solicitud BBVA llenada: todo entra OBSERVADO con documento, fuente y confianza; nunca confirmado", async () => {
    const p = await newProspect(app, "Doc BBVA");
    const bytes = await filledBbva({ rfc: "TEST850505AB1", curp: "TEST850505MDFXXX01", "primer nombre": "PRUEBA", "Apellido paterno": "SINTETICO" });
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes, fileName: "solicitud.pdf", docType: "credit_application" });
    expect(doc.extractionStatus).toBe("observed");
    expect(doc.extractionProvider).toBe("acroform");
    const rows = await app.db.select().from(s.customerFacts).where(eq(s.customerFacts.sourceRefId, doc.id));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const r of rows) {
      expect(r.status).toBe("observed");
      expect(r.source).toBe("document");
      expect(r.confidence).toBe("high");
      expect(r.sourceLabel).toMatch(/Solicitud de crédito/);
      expect(r.createdAt).toBeInstanceOf(Date);
    }
  });

  it("contradice un dato confirmado → conflicto (sistema existente)", async () => {
    const p = await newProspect(app, "Doc Conflicto");
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "rfc", value: "TEST850505AB1" }], sourceType: "mario_capture", sourceLabel: "Captura" });
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes: await textPdf("Constancia RFC: TEST850505ZZ9 texto de prueba suficiente"), fileName: "constancia.pdf", docType: "tax_id" });
    const facts = (await getInboxDocument(app, doc.id)).facts;
    expect(facts.find((f) => f.key === "rfc")?.status).toBe("conflicting");
  });

  it("revisión: Confirmar / Corregir / Ignorar; el documento queda 'Revisado' al terminar", async () => {
    const p = await newProspect(app, "Doc Revisión");
    const bytes = await textPdf("RFC TEST850505AB1 CURP TEST850505MDFXXX01 correo prueba@example.com (sintético)");
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes, fileName: "doc.pdf", docType: "tax_id" });
    let { facts } = await getInboxDocument(app, doc.id);
    expect(facts.map((f) => f.key).sort()).toEqual(["curp", "email", "rfc"]);
    expect(facts.every((f) => f.confidence === "medium")).toBe(true);
    const by = (k: string) => facts.find((f) => f.key === k)!;
    await reviewFact(app, { customerId: p.customer.id, documentId: doc.id, factId: by("rfc").id, action: "confirm" });
    await reviewFact(app, { customerId: p.customer.id, documentId: doc.id, factId: by("email").id, action: "ignore" });
    await reviewFact(app, { customerId: p.customer.id, documentId: doc.id, factId: by("curp").id, action: "correct", value: "TEST850505MDFXXX02" });
    ({ facts } = await getInboxDocument(app, doc.id));
    expect(facts.find((f) => f.key === "rfc")!.status).toBe("confirmed");
    expect(facts.find((f) => f.key === "email")!.status).toBe("superseded");
    expect(facts.filter((f) => f.key === "curp").map((f) => f.status).sort()).toEqual(["confirmed", "superseded"]);
    const [row] = await app.db.select().from(s.documents).where(eq(s.documents.id, doc.id));
    expect(row!.extractionStatus).toBe("confirmed");
    const profile = await app.db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, p.customer.id));
    expect((profile[0]!.data as Record<string, unknown>).email).toBeUndefined(); // ignorado no se usa
  });

  it("flujo a la solicitud: lo OBSERVADO no se llena en el PDF; al confirmarlo, sí", async () => {
    const p = await newProspect(app, "Doc a Solicitud");
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes: await filledBbva({ rfc: "TEST850505AB1" }), fileName: "s.pdf", docType: "credit_application" });
    const application = await createApplication(app, { customerId: p.customer.id, institutionCode: "BBVA" });
    const before = await generateApplicationPdf(app, application.id);
    expect(before.skipped).toEqual(expect.arrayContaining([{ slot: "bbva.cliente.rfc", reason: "needs_confirmation" }]));
    const fact = (await getInboxDocument(app, doc.id)).facts.find((f) => f.key === "rfc")!;
    await reviewFact(app, { customerId: p.customer.id, documentId: doc.id, factId: fact.id, action: "confirm" });
    const after = await generateApplicationPdf(app, application.id);
    const filled = await PDFDocument.load((await getGeneratedPdf(app, after.document.id)).bytes);
    expect((filled.getForm().getField("rfc") as PDFTextField).getText()).toBe("TEST850505AB1");
    expect((await listAllApplications(app)).some((a) => a.id === application.id)).toBe(true);
  });

  it("rechazar un documento descarta sus datos observados", async () => {
    const p = await newProspect(app, "Doc Rechazo");
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes: await textPdf("CURP TEST850505MDFXXX01 documento sintético de prueba"), fileName: "d.pdf", docType: "curp" });
    await setInboxStatus(app, doc.id, "rejected");
    const { facts, doc: d } = await getInboxDocument(app, doc.id);
    expect(d.extractionStatus).toBe("rejected");
    expect(facts.every((f) => f.status === "superseded")).toBe(true);
    expect((await listInbox(app, p.customer.id))[0]!.pendingReview).toBe(0);
  });

  it("Sofía no cotiza en tablet: Mario registra su cotización y pasa a seguimiento", async () => {
    const p = await newProspect(app, "Cotización Mario");
    const runs = (await app.db.select().from(s.quoteRuns)).length;
    const q = await registerMarioQuote(app, { customerId: p.customer.id, model: "HR-V", version: "Touring", downPayment: 150_000, termMonths: 48, monthlyPayment: 11_111 });
    expect(q.calculationType).toBe("official");
    expect(q.createdBy).toBe("mario");
    expect((await app.db.select().from(s.quoteRuns)).length).toBe(runs); // no se calculó nada
    const fu = await app.db.select().from(s.followups).where(and(eq(s.followups.customerId, p.customer.id), eq(s.followups.status, "pending")));
    expect(fu.length).toBe(1);
    const t = await getTabletSummary(app, p.customer.id);
    expect(t.quote).toMatch(/HR-V Touring/);
    expect(t.nextAction?.text).toMatch(/cotización/);
    const cmd = await runCommand(app, "Cotízame una HR-V Touring con 150 mil a 48 meses", { tablet: true });
    expect(cmd.blocks.some((b) => b.type === "quote")).toBe(false);
    expect(cmd.say).toMatch(/las haces tú/);
  });

  it("métricas de IA: las funciones normales no llaman IA; un proveedor externo sí queda registrado", async () => {
    const since = new Date(0);
    expect((await aiUsageSince(app, since)).total).toBe(0);
    const fakeVision: ExtractionProvider = { name: "vision-prueba", kind: "external", configured: true, supports: () => true, extract: async () => ({ provider: "vision-prueba", readable: true, note: "prueba", fields: [{ key: "postal_code", value: "01000", confidence: "low", evidence: "prueba" }] }) };
    const p = await newProspect(app, "Doc Visión");
    await uploadDocument(app, { customerId: p.customer.id, bytes: PNG, fileName: "f.png", docType: "proof_of_address" }, [fakeVision]);
    const usage = await aiUsageSince(app, since);
    expect(usage.total).toBe(1);
    expect(usage.rows[0]).toMatchObject({ provider: "vision-prueba", purpose: "extraction" });
  });

  it("sin proveedor externo configurado no se simula extracción", async () => {
    const r = await runExtraction({ bytes: PNG, mime: "image/png", docType: "ine" });
    expect(r.fields).toEqual([]);
    expect(r.note).toMatch(/No hay OCR configurado/);
  });

  it("modo tablet por user-agent de la APK", () => {
    expect(isTabletUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/130 SofiaTablet/1")).toBe(true);
    expect(isTabletUserAgent("Mozilla/5.0 Safari")).toBe(false);
  });
});
