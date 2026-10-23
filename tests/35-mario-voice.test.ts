import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeMarioVoice, calibrateMarioVoice, loadMarioVoiceProfile, renderMarioVoiceProfile } from "@/server/agent/mario-voice";
import { buildPrompt } from "@/server/agent/prompt";
import { buildTurnContext } from "@/server/agent/turn-context";
import { makeApp, newProspect, type TestApp } from "./helpers";

const examples = [
  "Qué onda compare, me llegó tu mensaje de la página de Honda. ¿Buscas nueva o seminueva?",
  "Oye compare, mira te mando algunas opciones de la camioneta y lo vemos aquí en la agencia.",
  "Qué onda, claro que sí, te comparto cómo quedarían las mensualidades y me dices.",
  "Mira, para retomar el tema te paso unos ejemplos y nos vemos acá para aterrizarlo.",
  "Qué onda compare, si gustas nos vemos en Honda Valle Oriente y te enseño la CR-V.",
  "Oye, para que conozcas bien la camioneta vente y hacemos una prueba de manejo.",
  "Mira compare, tenemos diferentes versiones y te paso las opciones disponibles.",
  "Qué onda, claro, ¿qué día te queda bien venir para que la veas en persona?",
];

describe("personalidad de Mario: aprendizaje sin filtrar datos privados", () => {
  let app: TestApp;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });

  it("deriva rasgos de estilo, sin guardar textos como prompts", () => {
    const a = analyzeMarioVoice(examples);
    expect(a?.tone).toBe("campechano");
    expect(a?.greeting).toBe("que_onda");
    expect(a?.usesCompare).toBe(true);
    expect(a?.paragraphStyle).toBe("compacto");
    expect(analyzeMarioVoice(examples.slice(0, 3))).toBeNull();
    const privateSample = examples.map(m => m + " Roberto López 8112345678");
    const desc = renderMarioVoiceProfile(analyzeMarioVoice(privateSample));
    expect(desc).toContain("campechano");
    expect(desc).not.toContain("Roberto");
    expect(desc).not.toContain("8112345678");
    expect(desc).not.toContain("me llegó tu mensaje");
  });

  it("calibra con mensajes aprobados y persiste SOLO rasgos agregados", async () => {
    await calibrateMarioVoice(app.db, app.workspaceId, examples);
    const saved = await loadMarioVoiceProfile(app.db, app.workspaceId);
    expect(saved?.usesCompare).toBe(true);
    const p = await newProspect(app, "Cliente Nuevo");
    const result = await p.sayRaw("Me interesa una CR-V");
    expect(result.turn?.reply).toBeTruthy();
    expect(result.turn?.reply).not.toMatch(/soy sofía/i);

    const ctx = await buildTurnContext(app.db, {
      workspaceId: app.workspaceId, conversationId: p.conversation.id,
      newMessageId: result.inboundMessageId, now: app.clock.now(),
    });
    const prompt = buildPrompt(ctx, { marioVoiceProfile: saved });
    expect(prompt.user.some(p => p.name === "mario_voice_patterns")).toBe(true);
    expect(prompt.user.find(p => p.name === "mario_voice_patterns")?.text).toContain("Patrones agregados");
    expect(prompt.system.some(p => p.text.includes("asistente virtual") && p.text.includes("No empieces"))).toBe(true);
  });

  it("prioriza aprendizaje de los mensajes enviados por Mario en Sofía", async () => {
    const p = await newProspect(app, "Mario Entrenamiento");
    for (const m of examples) await p.mario(m);
    const learned = await loadMarioVoiceProfile(app.db, app.workspaceId);
    expect(learned?.sampleCount).toBeGreaterThanOrEqual(6);
    expect(learned?.usesCompare).toBe(true);
  });
});
