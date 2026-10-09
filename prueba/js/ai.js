// IA OPCIONAL (apagada por defecto). La app funciona completa sin esto.
// Usa la llave propia del asesor/agencia, guardada solo en este dispositivo, y el SDK oficial de
// Anthropic cargado bajo demanda. Nunca envía nada sin que la persona lo revise.
import { state } from "./store.js";

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm";
// Modelos que aceptan el respaldo automático del servidor ante un rechazo.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-fable-5-1", "claude-opus-5", "claude-sonnet-5-5"]);

export const aiEnabled = () => Boolean(state.settings.ai.enabled && state.settings.ai.apiKey);

let clientP;
let clientKey;
async function client() {
  const key = state.settings.ai.apiKey;
  if (!clientP || clientKey !== key) {
    clientKey = key;
    clientP = import(SDK_URL).then(({ default: Anthropic }) => ({ Anthropic, c: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) }));
  }
  return clientP;
}

const SYSTEM = `Eres el asistente de un asesor de ventas de autos en México. Redactas mensajes que el asesor revisará antes de enviarlos.
Reglas:
- Español de México, cálido y profesional, tuteando salvo que el contexto indique usted.
- Breve: máximo 3 oraciones para WhatsApp.
- Nunca inventes precios, tasas, promociones, existencias ni fechas: si hacen falta, pregunta o deja que el asesor los complete.
- Devuelve solo el texto del mensaje, sin comillas ni explicaciones.`;

/** Mejora o redacta un mensaje. kind: "whatsapp" | "correo". */
export async function aiWrite({ kind = "whatsapp", draft = "", incoming = "", customer = {}, goal = "" }) {
  if (!aiEnabled()) throw new Error("La IA está apagada. Actívala en Ajustes con tu propia llave.");
  const { Anthropic, c } = await client();
  const model = state.settings.ai.model || "claude-opus-5-5";
  const s = state.settings;
  const context = [
    `Asesor: ${s.advisorName || "(sin nombre)"}${s.agency ? `, ${s.agency}` : ""}.`,
    customer.name ? `Cliente: ${customer.name}.` : "",
    customer.vehicle ? `Auto de interés: ${customer.vehicle}.` : "",
    customer.stage ? `Etapa: ${customer.stage}.` : "",
    incoming ? `Mensaje que mandó el cliente:\n"""${incoming}"""` : "",
    draft ? `Borrador actual del asesor:\n"""${draft}"""` : "",
    goal ? `Objetivo: ${goal}` : "",
    kind === "correo" ? "Formato: correo formal y breve." : "Formato: mensaje de WhatsApp.",
  ].filter(Boolean).join("\n");
  try {
    const params = {
      model,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `${context}\n\nRedacta la mejor versión del mensaje.` }],
    };
    if (FALLBACK_MODELS.has(model)) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    const res = await c.beta.messages.create(params);
    if (res.stop_reason === "refusal") throw new Error("La IA no quiso redactar este mensaje. Usa la plantilla.");
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) throw new Error("La IA no devolvió texto.");
    return text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("La llave de IA no es válida. Revísala en Ajustes.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Demasiadas solicitudes a la IA. Intenta en un minuto.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Sin conexión con la IA. Revisa internet.");
    if (e instanceof Anthropic.APIError) throw new Error(`La IA respondió con error ${e.status}.`);
    throw e;
  }
}
