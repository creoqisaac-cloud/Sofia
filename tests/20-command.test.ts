/**
 * Comando universal: interpretación (texto/voz), confirmación obligatoria para cambios,
 * correos nunca enviados automáticamente, búsqueda global y respaldo de voz.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MUTATING_INTENTS, parseCommand } from "@/domain/command";
import * as s from "@/server/db/schema";
import { executeConfirmed, runCommand } from "@/server/command/router";
import { DemoEmailProvider, sendEmail, setEmailProvider, type EmailProvider } from "@/server/services/email";
import { createVoiceProvider } from "@/components/sofia/voice";
import { makeApp, type TestApp } from "./helpers";

const CATALOG = [
  { model: "City", aliases: [], versions: ["Uniq", "Sport", "Prime"] },
  { model: "HR-V", aliases: ["HRV", "HR V"], versions: ["Uniq", "Touring"] },
  { model: "CR-V", aliases: ["CRV"], versions: ["Turbo Plus", "Hybrid Touring"] },
  { model: "Civic", aliases: [], versions: ["Sport"] },
];
const NOW = new Date(2026, 8, 28, 10, 0, 0);

describe("interpretación de comandos (determinista)", () => {
  it.each([
    ["Cotízame una HR-V Touring con 150 mil de enganche a 48 meses", "quote", { model: "HR-V", version: "Touring", downPayment: 150_000, termMonths: 48 }],
    ["City Touring, 100 de enganche, 48 meses", "quote", { model: "City", version: "Touring", downPayment: 100_000, termMonths: 48 }],
    ["Cotízame una Civic Touring con ciento cincuenta de enganche a sesenta meses.", "quote", { model: "Civic", downPayment: 150_000, termMonths: 60 }],
    ["¿Qué le falta a Juan?", "customer_status", { customerQuery: "juan" }],
    ["Agenda a Carlos mañana a las cinco", "schedule_appointment", { customerQuery: "carlos" }],
    ["Registra que ya me mandó su comprobante", "register_document", { docType: "proof_of_address" }],
    ["Abre la venta de Ana", "sale_status", { customerQuery: "ana", target: "open" }],
    ["¿Qué tengo pendiente hoy?", "today", {}],
    ["¿Qué tengo hoy?", "today", {}],
    ["Hazme el correo de placas de Juan", "draft_email", { target: "plates", customerQuery: "juan" }],
    ["¿Qué le falta para placas a Juan?", "plate_status", { customerQuery: "juan" }],
    ["¿Cuáles placas tengo pendientes?", "plate_status", {}],
    ["Marca el trámite de Carlos como enviado.", "update_plate", { plateStatus: "submitted", customerQuery: "carlos" }],
    ["Busca a Juan", "find_customer", { customerQuery: "juan" }],
    ["¿Qué documentos le faltan?", "documents_status", {}],
    ["Abre ventas", "navigate", { target: "/sales" }],
    ["El pedido de Juan es P-12345", "update_sale", { saleField: "orderNumber", saleValue: "P-12345", customerQuery: "juan" }],
    ["Envía el correo de placas de Juan", "send_email", { customerQuery: "juan" }],
  ])("%s → %s", (text, intent, params) => {
    const r = parseCommand(text, CATALOG, NOW);
    expect(r.intent).toBe(intent);
    expect(r.params).toMatchObject(params);
  });

  it("fechas: 'mañana a las cinco' = mañana 17:00 (horario de agencia); '11 de la mañana' = 11:00", () => {
    const a = parseCommand("Agenda a Carlos mañana a las cinco", CATALOG, NOW).params.when!;
    const d = new Date(a.iso);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([29, 17, 0]);
    const b = new Date(parseCommand("Agenda a Ana mañana a las 11 de la mañana", CATALOG, NOW).params.when!.iso);
    expect(b.getHours()).toBe(11);
    const c = new Date(parseCommand("Recuérdame llamar a Carlos el viernes a las 4 y media", CATALOG, NOW).params.when!.iso);
    expect([c.getDay(), c.getHours(), c.getMinutes()]).toEqual([5, 16, 30]);
  });

  it("el parser no produce cifras comerciales: solo entradas de Mario (enganche, plazo)", () => {
    const r = parseCommand("cotiza HR-V Touring 150 mil 48 meses", CATALOG, NOW);
    expect(Object.entries(r.params).filter(([, v]) => v !== undefined).map(([k]) => k).sort()).toEqual(["downPayment", "model", "termMonths", "version"]);
  });
});

describe("router de comandos (servicio)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());
  afterEach(() => setEmailProvider(new DemoEmailProvider()));

  it("toda acción que modifica pide confirmación y NO cambia nada hasta confirmar", async () => {
    const before = await app.db.select().from(s.appointments);
    const r = await runCommand(app, "Agenda a Juan mañana a las cinco");
    expect(MUTATING_INTENTS.has(r.intent)).toBe(true);
    expect(r.confirm?.action.type).toBe("schedule_appointment");
    expect((await app.db.select().from(s.appointments)).length).toBe(before.length);
    const done = await executeConfirmed(app, r.confirm!.action);
    expect(done.ok).toBe(true);
    expect((await app.db.select().from(s.appointments)).length).toBe(before.length + 1);
  });

  it("registrar documento y actualizar venta: confirmación + auditoría", async () => {
    const doc = await runCommand(app, "Registra que Ana ya me mandó su comprobante");
    expect(doc.confirm?.action.type).toBe("register_document");
    await executeConfirmed(app, doc.confirm!.action);
    const sale = await runCommand(app, "El pedido de Juan es P-12345");
    expect(sale.confirm?.action.type).toBe("update_sale");
    await executeConfirmed(app, sale.confirm!.action);
    const changes = await app.db.select().from(s.saleRecordChanges).where(eq(s.saleRecordChanges.field, "orderNumber"));
    expect(changes.some((c) => c.newValue === "P-12345")).toBe(true);
  });

  it("acciones confirmadas se re-validan en el servidor (no se ejecuta basura)", async () => {
    await expect(executeConfirmed(app, { type: "update_sale", saleId: "no-es-uuid", field: "orderNumber", value: "x", label: "x" })).rejects.toThrow();
    await expect(executeConfirmed(app, { type: "drop_table" })).rejects.toThrow();
  });

  it("cotizar por comando usa el motor (no el texto) y dice qué falta si no hay respaldo", async () => {
    const ok = await runCommand(app, "Cotízame una HR-V Touring con 150 mil de enganche a 48 meses");
    const block = ok.blocks.find((b) => b.type === "quote");
    expect(block && block.type === "quote" && block.quote.result.exactness).toBe("exact");
    expect(ok.say).toMatch(/mensuales/);
    const missing = await runCommand(app, "cotiza una CR-V Turbo Plus con 200 mil a 36 meses");
    expect(missing.say).not.toMatch(/mensuales/);
    const incomplete = await runCommand(app, "cotiza una HR-V Touring a 48 meses");
    expect(incomplete.say).toMatch(/enganche/);
  });

  it("correo: el borrador se genera, pero enviar nunca ocurre sin cuenta configurada y confirmación", async () => {
    const draft = await runCommand(app, "Prepara el correo de placas de Juan");
    const email = draft.blocks.find((b) => b.type === "email");
    expect(email && email.type === "email" && email.email.body).toMatch(/Pendientes:/);
    const [row] = await app.db.select().from(s.emailMessages).where(eq(s.emailMessages.status, "draft"));
    // Sin proveedor configurado: no hay acción de envío, solo la explicación.
    const noProvider = await runCommand(app, "Envía el correo de placas de Juan");
    expect(noProvider.confirm).toBeUndefined();
    expect(noProvider.say).toMatch(/Falta configurar la cuenta/);
    // Con proveedor: pide confirmación; sin confirmed:true el servicio se niega.
    const sent: string[] = [];
    const fake: EmailProvider = { name: "prueba", configured: true, send: async (m) => (sent.push(m.subject), { messageId: "m1" }) };
    setEmailProvider(fake);
    await expect(sendEmail(app, row!.id, { confirmed: false })).rejects.toThrow(/confirmación/);
    const withProvider = await runCommand(app, "Envía el correo de placas de Juan");
    expect(withProvider.confirm?.action.type).toBe("send_email");
    expect(sent).toEqual([]);
    await executeConfirmed(app, withProvider.confirm!.action);
    expect(sent.length).toBe(1);
    const [after] = await app.db.select().from(s.emailMessages).where(eq(s.emailMessages.id, row!.id));
    expect(after!.status).toBe("sent");
  });

  it("búsqueda global: nombre, teléfono, pedido y VIN", async () => {
    for (const q of ["Juan", "5550000001", "DEMO-P-0005", "DEMO0VIN000000001"]) {
      const r = await runCommand(app, q);
      const list = r.blocks.find((b) => b.type === "list");
      expect(list && list.type === "list" && list.items.length, q).toBeGreaterThan(0);
    }
  });

  it("contexto: '¿Qué documentos le faltan?' usa el último cliente mencionado", async () => {
    const [ana] = await app.db.select().from(s.customers).where(and(eq(s.customers.displayName, "Ana López (DEMO)")));
    const r = await runCommand(app, "¿Qué documentos le faltan?", { lastCustomerId: ana!.id });
    expect(r.intent).toBe("documents_status");
    expect(r.customerId).toBe(ana!.id);
  });
});

describe("voz: capa sobre el mismo comando, con respaldo de texto", () => {
  it("sin API de voz o sin HTTPS → proveedor 'none' (la app sigue con texto/dictado del teclado)", () => {
    expect(createVoiceProvider({}).available).toBe(false);
    expect(createVoiceProvider(undefined).available).toBe(false);
    const insecure = createVoiceProvider({ webkitSpeechRecognition: class {}, isSecureContext: false });
    expect(insecure.available).toBe(false);
    expect(insecure.reason).toMatch(/HTTPS/);
  });

  it("con webkitSpeechRecognition entrega la transcripción final al mismo flujo", () => {
    class FakeRec {
      lang = "";
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror = null;
      onend: (() => void) | null = null;
      start() {
        const res = Object.assign([{ transcript: "qué tengo hoy" }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [res] });
        this.onend?.();
      }
      stop() {}
      abort() {}
    }
    const v = createVoiceProvider({ webkitSpeechRecognition: FakeRec, isSecureContext: true });
    expect(v.kind).toBe("web-speech");
    const got: string[] = [];
    v.start({ onPartial: () => {}, onFinal: (t) => got.push(t), onError: () => {}, onEnd: () => {} });
    expect(got).toEqual(["qué tengo hoy"]);
    expect(parseCommand(got[0]!, CATALOG, NOW).intent).toBe("today");
  });
});
