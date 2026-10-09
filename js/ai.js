// IA (Claude) — se conecta en Más → Conexiones con la llave propia del asesor/agencia.
// Sin IA la app funciona completa; con IA: lee INE con visión, aprende el estilo de venta,
// redacta respuestas, personaliza plantillas, extrae datos de prospectos y escribe publicaciones.
// La llave vive solo en este dispositivo (nunca va a respaldos ni al servidor).
import { state, save } from "./store.js";
import { blobToBase64, shrinkImage } from "./util.js";

export const MODELS = [
  ["claude-opus-5-5", "Máxima calidad — Opus 5.5 (recomendado para INE)"],
  ["claude-sonnet-5-5", "Equilibrado — Sonnet 5.5"],
  ["claude-haiku-5-5", "Rápido y económico — Haiku 5.5"],
];
// Modelos que aceptan el respaldo automático del servidor si el modelo rechaza una solicitud.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export const aiReady = () => Boolean(state.settings.ai.enabled && state.settings.ai.apiKey);
export const aiForIne = () => aiReady() && state.settings.ai.ine !== false;

let sdk;
let clientKey;
let clientInst;
async function client() {
  sdk ??= await import("../vendor/anthropic-sdk.mjs");
  const key = state.settings.ai.apiKey;
  if (!clientInst || clientKey !== key) {
    clientKey = key;
    clientInst = new sdk.default({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }
  return { c: clientInst, Anthropic: sdk.default, jsonSchemaOutputFormat: sdk.jsonSchemaOutputFormat };
}

function friendly(e, Anthropic) {
  if (e instanceof Anthropic.AuthenticationError) return new Error("La llave de IA no es válida. Revísala en Conexiones.");
  if (e instanceof Anthropic.PermissionDeniedError) return new Error("Tu cuenta de IA no tiene permiso para este modelo. Elige otro en Conexiones.");
  if (e instanceof Anthropic.NotFoundError) return new Error("Ese modelo no está disponible en tu cuenta. Elige otro en Conexiones.");
  if (e instanceof Anthropic.RateLimitError) return new Error("Demasiadas solicitudes a la IA o falta saldo. Revisa tu cuenta de Anthropic.");
  if (e instanceof Anthropic.APIConnectionError) return new Error("Sin conexión con la IA. Revisa internet.");
  if (e instanceof Anthropic.BadRequestError) return new Error(`La IA rechazó la solicitud: ${e.message}`);
  if (e instanceof Anthropic.APIError) return new Error(`La IA respondió con error ${e.status ?? ""}.`);
  return e;
}

/** Verifica llave y modelo sin gastar: consulta el modelo en la API. */
export async function testConnection(apiKey, model) {
  sdk ??= await import("../vendor/anthropic-sdk.mjs");
  const c = new sdk.default({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const m = await c.models.retrieve(model);
    return { ok: true, name: m.display_name ?? model };
  } catch (e) {
    throw friendly(e, sdk.default);
  }
}

/** Una llamada. Con `schema` devuelve el objeto JSON (salida estructurada); si no, texto. */
async function ask({ system, content, schema, effort = "low" }) {
  if (!aiReady()) throw new Error("Conecta la IA en Más → Conexiones.");
  const { c, Anthropic, jsonSchemaOutputFormat } = await client();
  const model = state.settings.ai.model || MODELS[0][0];
  const params = {
    model,
    max_tokens: 16000,
    output_config: { effort, ...(schema ? { format: jsonSchemaOutputFormat(schema) } : {}) },
    system,
    messages: [{ role: "user", content }],
  };
  if (FALLBACK_MODELS.has(model)) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  let res;
  try {
    res = await c.beta.messages.create(params);
  } catch (e) {
    throw friendly(e, Anthropic);
  }
  if (res.stop_reason === "refusal") throw new Error("La IA no quiso responder esta solicitud.");
  if (res.stop_reason === "max_tokens") throw new Error("La respuesta de la IA quedó incompleta. Intenta de nuevo.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  state.settings.ai.usedAt = new Date().toISOString();
  if (!schema) return text;
  try { return JSON.parse(text); } catch { throw new Error("La IA devolvió un formato inesperado. Intenta de nuevo."); }
}

// ───────── Contexto común: el asesor y su estilo ─────────

function advisorContext() {
  const s = state.settings;
  const st = s.style ?? {};
  const lines = [`Asesor: ${s.advisorName || "(sin nombre)"}${s.agency ? `, ${s.agency}` : ""}.`];
  if (st.profile) lines.push(`Guía de estilo del asesor (imítala):\n${JSON.stringify(st.profile)}`);
  if (st.notes) lines.push(`Lo que el asesor dice de su forma de vender:\n${st.notes}`);
  const ex = (st.examples ?? []).slice(-25);
  if (ex.length) lines.push(`Mensajes reales que el asesor ha enviado (imita su tono, largo, saludos y emojis):\n${ex.map((e) => `- ${e.text}`).join("\n")}`);
  return lines.join("\n\n");
}

const SALES_RULES = `Eres el asistente de un asesor de ventas de autos en México. Escribes COMO el asesor, en primera persona, para que él revise y envíe.
Reglas:
- Español de México. Imita el estilo del asesor (tono, largo, saludos, emojis) si hay guía o ejemplos.
- Nunca inventes precios, tasas, bonos, promociones, existencias ni fechas. Si hacen falta, pregunta o deja [completar].
- Objetivo comercial: avanzar al cliente un paso (resolver duda, conseguir dato, agendar cita o prueba de manejo, cerrar).
- No pidas fotos de INE por WhatsApp sin que el asesor lo decida.`;

function customerContext(c = {}) {
  if (!c) return "";
  const parts = [
    c.name && `Cliente: ${c.name}`,
    c.vehicle && `Auto de interés: ${c.vehicle}`,
    c.stage && `Etapa: ${c.stage}`,
    c.notes && `Notas del asesor: ${c.notes}`,
  ].filter(Boolean);
  return parts.join("\n");
}

const historyText = (history = []) => history.slice(-30).map((m) => `${m.dir === "out" ? "Asesor" : "Cliente"}: ${m.text}`).join("\n");

// ───────── WhatsApp ─────────

/** Borrador de respuesta (o primer mensaje) con el estilo del asesor. */
export async function draftMessage({ customer, history = [], incoming = "", draft = "", goal = "" }) {
  return ask({
    system: SALES_RULES,
    content: [
      advisorContext(),
      customerContext(customer),
      history.length ? `Conversación reciente:\n${historyText(history)}` : "",
      incoming ? `Último mensaje del cliente:\n"""${incoming}"""` : "",
      draft ? `Borrador actual del asesor (mejóralo sin cambiar lo que promete):\n"""${draft}"""` : "",
      goal ? `Objetivo de este mensaje: ${goal}` : "",
      "Escribe SOLO el mensaje de WhatsApp listo para enviar (sin comillas ni explicaciones). Breve y natural.",
    ].filter(Boolean).join("\n\n"),
  });
}

/** Reescribe todas las plantillas para un cliente concreto, con el estilo del asesor. */
export async function personalizeTemplates(customer, templates, history = []) {
  const r = await ask({
    system: SALES_RULES,
    content: [
      advisorContext(),
      customerContext(customer),
      history.length ? `Conversación reciente:\n${historyText(history)}` : "",
      `Reescribe cada plantilla para ESTE cliente (usa su nombre y su situación) con el estilo del asesor. Conserva el propósito de cada una. Plantillas:\n${templates.map((t) => `[${t.id}] ${t.title}: ${t.text}`).join("\n")}`,
    ].filter(Boolean).join("\n\n"),
    schema: {
      type: "object",
      properties: { plantillas: { type: "array", items: { type: "object", properties: { id: { type: "string" }, texto: { type: "string" } }, required: ["id", "texto"], additionalProperties: false } } },
      required: ["plantillas"],
      additionalProperties: false,
    },
  });
  return Object.fromEntries(r.plantillas.map((p) => [p.id, p.texto]));
}

const STAGE_IDS = ["nuevo", "seguimiento", "cotizacion", "credito", "vendido", "entregado", "perdido"];

/** Lee una conversación y saca los datos del prospecto (para crear/actualizar su ficha). */
export async function extractLead(conversationText, known = {}) {
  return ask({
    effort: "medium",
    system: "Extraes datos de prospectos de autos a partir de conversaciones de WhatsApp. Solo lo que el cliente dijo o se deduce claramente; si no se sabe, cadena vacía.",
    content: `${known.name ? `Nombre conocido: ${known.name}\n` : ""}Conversación:\n${conversationText.slice(-12000)}`,
    schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        auto_interes: { type: "string" },
        presupuesto: { type: "string" },
        forma_pago: { type: "string", enum: ["contado", "credito", "desconocido"] },
        enganche: { type: "string" },
        plazo_meses: { type: "string" },
        cuando_compra: { type: "string" },
        etapa: { type: "string", enum: STAGE_IDS },
        resumen: { type: "string", description: "Resumen en 2-3 líneas para la ficha del cliente" },
        siguiente_paso: { type: "string" },
        dias_para_seguimiento: { type: "integer" },
      },
      required: ["nombre", "auto_interes", "presupuesto", "forma_pago", "enganche", "plazo_meses", "cuando_compra", "etapa", "resumen", "siguiente_paso", "dias_para_seguimiento"],
      additionalProperties: false,
    },
  });
}

// ───────── Estilo de venta ─────────

export async function analyzeStyle(examples, notes = "") {
  return ask({
    effort: "medium",
    system: "Analizas cómo vende un asesor de autos a partir de sus mensajes reales de WhatsApp, para que un asistente pueda escribir exactamente como él.",
    content: `Mensajes del asesor (${examples.length}):\n${examples.slice(-300).map((e) => `- ${e.text}`).join("\n")}\n\n${notes ? `Lo que el asesor cuenta de su forma de vender:\n${notes}` : ""}`,
    schema: {
      type: "object",
      properties: {
        resumen: { type: "string" },
        tono: { type: "string" },
        trato: { type: "string", enum: ["tu", "usted", "mixto"] },
        saludo_tipico: { type: "string" },
        despedida_tipica: { type: "string" },
        emojis: { type: "array", items: { type: "string" } },
        longitud: { type: "string", enum: ["muy corta", "corta", "media", "larga"] },
        frases_tipicas: { type: "array", items: { type: "string" } },
        como_abre_conversacion: { type: "string" },
        como_pide_datos: { type: "string" },
        como_maneja_objeciones: { type: "string" },
        como_cierra: { type: "string" },
        evita: { type: "array", items: { type: "string" } },
      },
      required: ["resumen", "tono", "trato", "saludo_tipico", "despedida_tipica", "emojis", "longitud", "frases_tipicas", "como_abre_conversacion", "como_pide_datos", "como_maneja_objeciones", "como_cierra", "evita"],
      additionalProperties: false,
    },
  });
}

// ───────── INE con visión ─────────

const INE_SCHEMA = {
  type: "object",
  properties: {
    es_ine: { type: "boolean" },
    nombres: { type: "string" },
    apellido_paterno: { type: "string" },
    apellido_materno: { type: "string" },
    fecha_nacimiento: { type: "string", description: "AAAA-MM-DD" },
    sexo: { type: "string", enum: ["H", "M", ""] },
    curp: { type: "string" },
    clave_elector: { type: "string" },
    calle: { type: "string" },
    numero_exterior: { type: "string" },
    numero_interior: { type: "string" },
    colonia: { type: "string" },
    codigo_postal: { type: "string" },
    municipio: { type: "string" },
    estado: { type: "string", description: "Nombre completo del estado" },
    vigencia: { type: "string", description: "Año final de vigencia, ej. 2033" },
    ilegibles: { type: "array", items: { type: "string" }, description: "Campos que no se pueden leer con certeza" },
  },
  required: ["es_ine", "nombres", "apellido_paterno", "apellido_materno", "fecha_nacimiento", "sexo", "curp", "clave_elector", "calle", "numero_exterior", "numero_interior", "colonia", "codigo_postal", "municipio", "estado", "vigencia", "ilegibles"],
  additionalProperties: false,
};

/** Lee frente (y reverso) de una INE. Devuelve los datos tal como están impresos. */
export async function readIneWithAi(blobs) {
  const images = [];
  for (const b of blobs.filter(Boolean)) {
    const small = await shrinkImage(b, 2000, 0.9);
    images.push({ type: "image", source: { type: "base64", media_type: small.type === "image/png" ? "image/png" : "image/jpeg", data: await blobToBase64(small) } });
  }
  const r = await ask({
    effort: "medium",
    system: "Transcribes credenciales para votar de México (INE/IFE). Copias EXACTAMENTE lo impreso, carácter por carácter, sin corregir ni inventar. Distingue con cuidado 0/O, 1/I, 5/S, 8/B. Si un dato no se lee con certeza, déjalo vacío y agrégalo a 'ilegibles'.",
    content: [...images, { type: "text", text: "Extrae los datos de esta credencial (la primera imagen es el frente; si hay otra, el reverso). Nombres = nombre(s) de pila. Domicilio separado en sus partes. Vigencia = el año final." }],
    schema: INE_SCHEMA,
  });
  save();
  return r;
}

// ───────── Redes ─────────

export async function socialCopy({ kind = "post", vehicle = "", offer = "", goal = "", extra = "" }) {
  return ask({
    system: `${SALES_RULES}\nAhora escribes publicaciones y anuncios para Facebook/Instagram del asesor.`,
    content: [
      advisorContext(),
      `Tipo: ${kind === "anuncio" ? "anuncio pagado (copy para el Administrador de anuncios)" : "publicación orgánica en la página"}`,
      vehicle && `Auto: ${vehicle}`,
      offer && `Oferta / datos que el asesor confirma: ${offer}`,
      goal && `Objetivo: ${goal}`,
      extra && `Notas: ${extra}`,
      "Invita a escribir por WhatsApp o Messenger. Sin inventar precios ni promociones que no estén arriba.",
    ].filter(Boolean).join("\n\n"),
    schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto principal listo para publicar" },
        titulo: { type: "string", description: "Título corto (anuncios)" },
        descripcion: { type: "string" },
        llamado_accion: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
      },
      required: ["texto", "titulo", "descripcion", "llamado_accion", "hashtags"],
      additionalProperties: false,
    },
  });
}
