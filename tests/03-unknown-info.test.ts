/**
 * 3. La información desconocida no se inventa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardReply, type GuardContext } from "@/domain/guards";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

const EMPTY: GuardContext = {
  allowedAmounts: [],
  historicalAmounts: [],
  allowedPercents: [],
  historicalPercents: [],
  customerAmounts: [],
  estimateAmounts: [],
  officialQuoteAvailable: false,
  marioEvidence: false,
  knownFactKeys: [],
  confirmedAvailability: false,
  confirmedWarranty: false,
};

describe("guardrails de invención (unidad)", () => {
  it.each([
    ["El seguro te sale en $18,500 al año.", "invented_amount"],
    ["Te lo dejo con tasa de 9.9% anual.", "invented_percentage"],
    ["Tiene garantía de 5 años.", "unverified_warranty"],
    ["Sí tenemos la CR-V Hybrid en existencia, lista para entrega inmediata.", "unverified_availability"],
    ["Mario ya revisó tu caso y aprobó el descuento.", "false_mario_claim"],
    ["Soy Mario, cualquier cosa me dices.", "false_identity"],
  ])("bloquea: %s", (reply, code) => {
    const report = guardReply(reply, EMPTY);
    expect(report.blocked).toBe(true);
    expect(report.violations.map((v) => v.code)).toContain(code);
  });

  it.each([
    "Déjame verificar la garantía con Mario y te confirmo.",
    "No te puedo confirmar si hay en existencia; lo reviso con Mario.",
    "Mario lo va a revisar y te confirma.",
    "El modelo 2026 está muy bonito, ¿quieres agendar una prueba?",
  ])("permite: %s", (reply) => {
    expect(guardReply(reply, EMPTY).blocked).toBe(false);
  });

  it("permite repetir montos que dijo el propio cliente", () => {
    expect(guardReply("Perfecto, con tus $90,000 de enganche lo vemos.", { ...EMPTY, customerAmounts: [90_000] }).blocked).toBe(false);
  });
});

describe("información desconocida en conversación", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("sobre garantía (sin dato registrado) ofrece verificar y crea seguimiento", async () => {
    const p = await newProspect(app, "Ana");
    await p.say("Me interesa el City");
    const turn = await p.say("¿Qué garantía tiene?");
    expect(turn.reply).toMatch(/no tengo el dato confirmado/);
    expect(turn.reply).not.toMatch(/\d+\s*años/);
    const state = await p.state();
    expect(state.followups.some((f) => /garant/i.test(f.reason))).toBe(true);
  });

  it("si el modelo inventa precio de seguro o disponibilidad, se reemplaza por respuesta segura", async () => {
    const app2 = await makeApp(
      scripted((_ctx, attempt) => ({
        customer_reply: attempt === 1 ? "El seguro de la CR-V sale en $18,500 y sí la tenemos en existencia." : "El seguro anda en $17,900 al año.",
      })),
    );
    const p = await newProspect(app2);
    const turn = await p.say("¿Cuánto cuesta el seguro de la CR-V y la tienen disponible?");
    expect(turn.status).toBe("fallback");
    expect(turn.attempts).toBe(2); // se reintentó con retroalimentación
    expect(turn.reply).toMatch(/verificar/);
    expect(turn.reply).not.toMatch(/18,500|17,900|existencia/);
    await app2.close();
  });
});
