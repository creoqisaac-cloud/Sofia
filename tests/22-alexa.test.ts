/**
 * Alexa: interfaz de voz sobre el MISMO command router. Firma/timestamp verificados;
 * bypass solo en pruebas (ALEXA_SKIP_VERIFICATION_FOR_TESTS=true + NODE_ENV=test).
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { processAlexaHttp } from "@/server/alexa/http";
import { HELP_SPEECH, LAUNCH_SPEECH, NO_SAVED_QUOTE, type AlexaSession } from "@/server/alexa/skill";
import { scrubForVoice } from "@/server/alexa/speech";
import { makeApp, type TestApp } from "./helpers";

type Json = Record<string, unknown>;
const base = (request: Json, attributes: AlexaSession = {}, isNew = false) => ({
  version: "1.0",
  session: { new: isNew, sessionId: "amzn1.echo-api.session.test", application: { applicationId: "amzn1.ask.skill.test" }, attributes, user: { userId: "amzn1.ask.account.test" } },
  context: { System: { application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: "amzn1.ask.account.test" }, device: { deviceId: "d", supportedInterfaces: {} }, apiEndpoint: "https://api.amazonalexa.com" } },
  request: { requestId: "amzn1.echo-api.request.test", timestamp: new Date().toISOString(), locale: "es-MX", ...request },
});
const launch = () => base({ type: "LaunchRequest" }, {}, true);
const intent = (name: string, query?: string, attributes: AlexaSession = {}) =>
  base({ type: "IntentRequest", dialogState: "COMPLETED", intent: { name, confirmationStatus: "NONE", slots: query === undefined ? {} : { query: { name: "query", value: query, confirmationStatus: "NONE" } } } }, attributes);

describe("Alexa → Sofía", () => {
  let app: TestApp;
  const prev = process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());
  afterEach(() => {
    process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS = prev;
  });

  async function send(envelope: Json) {
    process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS = "true";
    const res = await processAlexaHttp(JSON.stringify(envelope), {}, async () => app);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { response: { outputSpeech?: { ssml: string }; shouldEndSession?: boolean }; sessionAttributes?: AlexaSession };
    const speech = (body.response.outputSpeech?.ssml ?? "").replace(/<\/?speak>/g, "");
    return { speech, end: body.response.shouldEndSession, attrs: body.sessionAttributes ?? {} };
  }

  it("LaunchRequest: saludo corto y sesión abierta", async () => {
    const r = await send(launch());
    expect(r.speech).toBe(LAUNCH_SPEECH);
    expect(r.end).toBe(false);
  });

  it("Help y Stop", async () => {
    expect((await send(intent("AMAZON.HelpIntent"))).speech).toBe(HELP_SPEECH);
    const stop = await send(intent("AMAZON.StopIntent"));
    expect(stop.end).toBe(true);
  });

  it("¿qué tengo pendiente hoy? → resumen corto (máx. 3) y el resto en Sofía", async () => {
    const r = await send(intent("QueIntent", "tengo pendiente hoy"));
    expect(r.speech).toMatch(/^Tienes \d+ pendientes/);
    expect(r.speech).toMatch(/Te dejé el detalle en Sofía/);
    expect(r.speech).not.toMatch(/→|\(DEMO\)/);
  });

  it("flujo de la demo: busca a Juan → ¿qué le falta? → agenda mañana a las cinco → sí → cita guardada", async () => {
    const find = await send(intent("BuscaIntent", "a juan"));
    expect(find.speech).toMatch(/Juan/);
    expect(find.attrs.lastCustomerId).toBeTruthy();
    expect(find.attrs.lastCustomerName).toBe("Juan");
    // Solo IDs y primer nombre en la sesión (sin PII sensible)
    expect(JSON.stringify(find.attrs)).not.toMatch(/@|\d{10}|DEMO\d/);

    const missing = await send(intent("QueIntent", "le falta", find.attrs));
    expect(missing.speech).toMatch(/Juan/);
    expect(missing.speech).toMatch(/Venta|Placas/);

    const before = (await app.db.select().from(s.appointments).where(eq(s.appointments.customerId, find.attrs.lastCustomerId!))).length;
    const ask = await send(intent("AgendaIntent", "a juan mañana a las cinco", missing.attrs));
    expect(ask.speech).toBe("Voy a agendar a Juan mañana a las 5 de la tarde. ¿Confirmas?");
    expect(ask.attrs.pendingConfirmationId).toBeTruthy();
    expect((await app.db.select().from(s.appointments).where(eq(s.appointments.customerId, find.attrs.lastCustomerId!))).length).toBe(before);

    const ok = await send(intent("ConfirmIntent", undefined, ask.attrs));
    expect(ok.speech).toMatch(/Cita agendada/);
    expect(ok.attrs.pendingConfirmationId).toBeUndefined();
    const after = await app.db.select().from(s.appointments).where(eq(s.appointments.customerId, find.attrs.lastCustomerId!));
    expect(after.length).toBe(before + 1);
    // La misma Sofía del iPhone: la cita existe en la BD con su auditoría.
    const audit = await app.db.select().from(s.auditEvents).where(eq(s.auditEvents.eventType, "appointment_scheduled"));
    expect(audit.some((a) => a.entityId === after.at(-1)!.id)).toBe(true);
  });

  it("rechazo: 'no' descarta la acción y no cambia nada; una confirmación no se puede reutilizar", async () => {
    const ask = await send(intent("AgendaIntent", "a carlos mañana a las cinco"));
    const count = async () => (await app.db.select().from(s.appointments)).length;
    const before = await count();
    const no = await send(intent("RejectIntent", undefined, ask.attrs));
    expect(no.speech).toBe("Listo, no hice nada.");
    expect(await count()).toBe(before);
    const replay = await send(intent("ConfirmIntent", undefined, ask.attrs));
    expect(replay.speech).toBe("No tengo nada pendiente por confirmar.");
    expect(await count()).toBe(before);
  });

  it("cotización: lee la corrida validada existente; si no existe, no calcula ni inventa", async () => {
    const runsBefore = (await app.db.select().from(s.quoteRuns)).length;
    const ok = await send(intent("CotizaIntent", "una hr-v touring con 150 mil de enganche a 48 meses"));
    expect(ok.speech).toMatch(/HR-V Touring.*mensuales/);
    const none = await send(intent("CotizaIntent", "una hr-v touring con 170 mil de enganche a 36 meses"));
    expect(none.speech).toBe(NO_SAVED_QUOTE);
    // Alexa no genera corridas nuevas
    expect((await app.db.select().from(s.quoteRuns)).length).toBe(runsBefore);
  });

  it("placas: responde lo que falta sin leer datos sensibles", async () => {
    const r = await send(intent("QueIntent", "le falta para placas a juan"));
    expect(r.speech).toMatch(/placas/i);
    expect(r.speech).not.toMatch(/VIN|DEMO0VIN|@/);
  });

  it("frase libre con carrier genérico pasa tal cual al router", async () => {
    const r = await send(intent("SofiaCommandIntent", "qué tengo pendiente hoy"));
    expect(r.speech).toMatch(/pendiente/);
  });

  it("scrubForVoice nunca lee RFC, CURP, correo, teléfono ni VIN", () => {
    const t = scrubForVoice("RFC DEMO900101AB1 CURP DEMO900101HDFXXX01 correo a@b.com tel 5550000001 VIN 1HGCM82633A004352 total $10,419.40");
    expect(t).not.toMatch(/DEMO9|@|5550000001|1HGCM/);
    expect(t).toMatch(/10,419 pesos con 40 centavos/);
  });

  it("sin bypass: timestamp viejo → rechazado", async () => {
    process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS = "false";
    const env = launch();
    (env.request as Json).timestamp = new Date(Date.now() - 10 * 60_000).toISOString();
    const res = await processAlexaHttp(JSON.stringify(env), { signaturecertchainurl: "https://s3.amazonaws.com/echo.api/echo-api-cert.pem", signature: "abc" }, async () => app);
    expect(res.status).toBe(400);
  });

  it("sin bypass: firma inválida → rechazado (aunque el timestamp sea válido)", async () => {
    process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS = "false";
    const noSig = await processAlexaHttp(JSON.stringify(launch()), {}, async () => app);
    expect(noSig.status).toBe(400);
    const badUrl = await processAlexaHttp(JSON.stringify(launch()), { signaturecertchainurl: "https://evil.example.com/cert.pem", "signature-256": "abc" }, async () => app);
    expect(badUrl.status).toBe(400);
  });

  it("el bypass exige NODE_ENV=test (nunca activo por defecto)", async () => {
    const { verificationBypassed } = await import("@/server/alexa/http");
    process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS = "true";
    const env = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(verificationBypassed()).toBe(false);
    (process.env as Record<string, string>).NODE_ENV = env!;
    delete process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS;
    expect(verificationBypassed()).toBe(false);
  });

  it("modelo de interacción: es-MX, 'asistente sofia', SearchQuery siempre con palabra de arranque", () => {
    const m = JSON.parse(fs.readFileSync("alexa/skill-package/interactionModels/custom/es-MX.json", "utf8")).interactionModel.languageModel;
    expect(m.invocationName).toBe("asistente sofia");
    const names = m.intents.map((i: { name: string }) => i.name);
    for (const n of ["SofiaCommandIntent", "ConfirmIntent", "RejectIntent", "AMAZON.HelpIntent", "AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.FallbackIntent"]) expect(names).toContain(n);
    for (const i of m.intents.filter((x: { slots?: unknown[] }) => x.slots?.length)) {
      for (const sample of i.samples as string[]) expect(sample.replace("{query}", "").trim().length, sample).toBeGreaterThan(0);
    }
  });
});
