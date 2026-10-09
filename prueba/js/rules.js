// "Cerebro" SIN IA: reglas claras y predecibles para sugerir mensajes, respuestas y siguientes pasos.
// Todo es editable por el asesor y nada se envía solo.
import { state, plateLabel } from "./store.js";
import { firstName, fmtWhen, money } from "./util.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Rellena {nombre}, {asesor}, {agencia}, {auto}, {fecha}, {estado_placas}. */
export function fillTemplate(text, c = {}, extra = {}) {
  const s = state.settings;
  const vars = {
    nombre: firstName(c.name) || "",
    asesor: s.advisorName || "tu asesor",
    agencia: s.agency || "la agencia",
    auto: c.vehicle || "auto que te interesa",
    fecha: c.nextFollowUp ? fmtWhen(c.nextFollowUp) : "en la fecha acordada",
    estado_placas: c.plates?.status ? plateLabel(c.plates.status).toLowerCase() : "en proceso",
    ...extra,
  };
  return text
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
    .replace(/Hola ,/g, "Hola,")
    .replace(/ {2,}/g, " ");
}

export const template = (id) => state.settings.templates.find((t) => t.id === id) ?? state.settings.templates[0];

/** Qué mensaje conviene mandar hoy a este cliente, según su etapa y su historia. */
export function suggestTemplateId(c, lastContactAt) {
  const daysSince = lastContactAt ? (Date.now() - new Date(lastContactAt).getTime()) / 86400000 : Infinity;
  switch (c.stage) {
    case "nuevo": return "primer";
    case "cotizacion": return "cotizacion";
    case "credito": return c.credit?.status === "enviada" ? "credito" : "documentos";
    case "vendido": return c.plates && c.plates.status !== "entregadas" ? "placas" : "entrega";
    case "entregado": return "gracias";
    case "perdido": return "reactivar";
    default: return daysSince > 14 ? "reactivar" : "seguimiento";
  }
}

// ───────── Responder un mensaje del cliente (clasificador por palabras clave) ─────────

const INTENTS = [
  { id: "no_interes", label: "No le interesa por ahora", words: ["no me interesa", "ya compre", "ya no", "no gracias", "mas adelante", "despues te aviso", "luego te aviso", "no por ahora", "lo voy a pensar"],
    reply: "Entiendo perfecto, {nombre}. Gracias por avisarme. Si más adelante quieres retomar, aquí estoy. ¿Te parece si te escribo en un mes por si hay alguna promoción?",
    action: { label: "Seguimiento en 30 días", days: 30 } },
  { id: "credito", label: "Pregunta por crédito", words: ["credito", "financiamiento", "financiar", "buro", "plazo", "meses", "banco", "requisitos", "enganche", "mensualidad"],
    reply: "Claro, {nombre}. Para el crédito necesitamos INE vigente, comprobante de domicilio reciente y comprobantes de ingresos. Con eso te armo la solicitud y te digo el enganche y la mensualidad estimada. ¿Cuánto te gustaría dar de enganche y a cuántos meses?",
    action: { label: "Pasar a etapa Crédito", stage: "credito" } },
  { id: "precio", label: "Pregunta por precio", words: ["precio", "cuanto cuesta", "cuanto sale", "costo", "cotiza", "cotizacion", "cuanto es", "descuento", "promocion"],
    reply: "Con gusto, {nombre}. Te preparo la cotización del {auto} con la versión que te interese. ¿Lo quieres de contado o a crédito?",
    action: { label: "Pasar a etapa Cotización", stage: "cotizacion" } },
  { id: "cita", label: "Quiere visitar / prueba de manejo", words: ["cita", "visita", "voy a ir", "paso a la agencia", "prueba de manejo", "manejarlo", "horario", "a que hora", "abren", "sabado", "domingo"],
    reply: "¡Perfecto, {nombre}! Te espero en {agencia}. ¿Qué día y hora te acomodan? Así te tengo el {auto} listo para la prueba de manejo.",
    action: { label: "Recordatorio mañana para confirmar", days: 1 } },
  { id: "documentos", label: "Documentos", words: ["documento", "papeles", "ine", "comprobante", "identificacion", "estado de cuenta", "nomina"],
    reply: "Gracias, {nombre}. Los documentos que necesito son: INE vigente (frente y reverso), comprobante de domicilio de máximo 3 meses y comprobantes de ingresos. Te confirmo el medio seguro para enviarlos.",
    action: { label: "Seguimiento en 2 días", days: 2 } },
  { id: "placas", label: "Placas / tarjeta de circulación", words: ["placa", "tarjeta de circulacion", "tramite", "permiso"],
    reply: "Hola {nombre}, tu trámite de placas está: {estado_placas}. En cuanto haya novedades te aviso.",
    action: { label: "Revisar trámite de placas", screen: "placas" } },
  { id: "entrega", label: "Entrega del auto", words: ["entrega", "cuando me lo dan", "cuando esta listo", "recoger", "ya esta listo"],
    reply: "Hola {nombre}, estamos preparando tu {auto}. Te confirmo la fecha de entrega en cuanto la tenga. ¿Qué horario te acomoda?",
    action: { label: "Seguimiento en 1 día", days: 1 } },
  { id: "disponible", label: "Colores / versiones / disponibilidad", words: ["color", "colores", "version", "versiones", "disponible", "existencia", "hay en", "tienen el"],
    reply: "Déjame revisar la disponibilidad del {auto} en el color y versión que buscas, {nombre}. ¿Cuál es tu preferida?",
    action: { label: "Seguimiento hoy en 3 horas", hours: 3 } },
];

/** Devuelve las intenciones detectadas (más probables primero), con respuesta sugerida. */
export function classifyMessage(text) {
  const t = norm(text);
  const out = [];
  for (const it of INTENTS) {
    const hits = it.words.filter((w) => new RegExp(`\\b${w}`).test(t)).length;
    if (hits) out.push({ ...it, hits });
  }
  out.sort((a, b) => b.hits - a.hits);
  if (!out.length) out.push({ id: "general", label: "Mensaje general", hits: 0, reply: "Hola {nombre}, gracias por tu mensaje. Con gusto te ayudo. ¿Me das un poco más de detalle para atenderte mejor?", action: { label: "Seguimiento mañana", days: 1 } });
  return out;
}

// ───────── Correos de placas ─────────

export function platesEmail(c, { followUp = false } = {}) {
  const s = state.settings;
  const reqs = s.platesRequirements;
  const docs = c.plates?.docs ?? {};
  const have = reqs.filter((r) => docs[r]);
  const missing = reqs.filter((r) => !docs[r]);
  const sign = [s.advisorName, s.agency, s.advisorPhone].filter(Boolean).join("\n");
  const veh = [c.vehicle, c.plates?.vin ? `VIN/serie: ${c.plates.vin}` : ""].filter(Boolean).join(" · ");
  if (followUp) {
    return {
      subject: `Seguimiento trámite de placas — ${c.name}${c.vehicle ? ` — ${c.vehicle}` : ""}`,
      body: `Hola,\n\nLes escribo para dar seguimiento al trámite de placas de ${c.name}${veh ? ` (${veh})` : ""}, enviado ${c.plates?.sentAt ? `el ${new Date(c.plates.sentAt).toLocaleDateString("es-MX")}` : "anteriormente"}.\n\n¿Me podrían confirmar el estado del trámite y la fecha estimada de entrega de placas?\n\nGracias.\n\n${sign}`,
    };
  }
  return {
    subject: `Trámite de placas — ${c.name}${c.vehicle ? ` — ${c.vehicle}` : ""}`,
    body: `Hola,\n\nLes envío la documentación para el trámite de placas del siguiente cliente:\n\nCliente: ${c.name}\n${veh ? `Vehículo: ${veh}\n` : ""}${c.phone ? `Teléfono del cliente: ${c.phone}\n` : ""}\nDocumentos adjuntos:\n${have.length ? have.map((r) => `• ${r}`).join("\n") : "• (sin adjuntos)"}\n${missing.length ? `\nPendientes por enviar:\n${missing.map((r) => `• ${r}`).join("\n")}\n` : ""}\nQuedo atento a la confirmación de recepción y a la fecha estimada.\n\nSaludos,\n${sign}`,
  };
}

// ───────── Crédito: cálculo estimado (no es oferta de ningún banco) ─────────

/** Mensualidad estimada con amortización francesa. tasaAnual en % (ej. 14.5). */
export function monthlyPayment(amount, tasaAnual, months) {
  if (!(amount > 0) || !(months > 0)) return NaN;
  const r = (tasaAnual ?? 0) / 100 / 12;
  if (!r) return amount / months;
  return (amount * r) / (1 - Math.pow(1 + r, -months));
}

export function creditEstimate(v) {
  const price = Number(v.price);
  const down = Number(v.downPayment) || 0;
  const months = Number(v.months);
  const rate = v.rate === "" || v.rate === undefined ? NaN : Number(v.rate);
  const income = (Number(v.incomeFixed) || 0) + (Number(v.incomeVariable) || 0);
  const amount = price - down;
  const pay = Number.isFinite(rate) ? monthlyPayment(amount, rate, months) : NaN;
  const ratio = income > 0 && Number.isFinite(pay) ? pay / income : NaN;
  const notes = [];
  if (price > 0 && down >= 0) notes.push(`Monto a financiar: ${money(amount)} (enganche ${price ? Math.round((down / price) * 100) : 0}%).`);
  if (price > 0 && down / price < 0.1) notes.push("El enganche es menor al 10%: muchos bancos piden 10–20% como mínimo.");
  if (Number.isFinite(pay)) notes.push(`Mensualidad estimada: ${money(pay)} a ${months} meses (sin seguros, comisiones ni IVA de intereses).`);
  if (Number.isFinite(ratio)) notes.push(`La mensualidad sería el ${Math.round(ratio * 100)}% del ingreso mensual${ratio > 0.35 ? " — alto: los bancos suelen aceptar hasta 30–35%." : " — dentro de lo que suelen aceptar los bancos."}`);
  return { amount, pay, ratio, income, notes };
}
