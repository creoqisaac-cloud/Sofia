// Operación comercial determinista: pegar chats, entender indicaciones sencillas y preparar mensajes.
// No usa IA y nunca envía nada por sí solo.
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[‐‑‒–—]/g, "-").trim();

const SHORT = {
  q: "que", k: "que", ke: "que", xq: "porque", pq: "porque", x: "por", d: "de", tmb: "tambien", tb: "tambien",
  pls: "por favor", xfa: "por favor", porfa: "por favor", info: "informacion", cel: "celular", msj: "mensaje",
  ola: "hola", hla: "hola", mna: "manana", mñn: "manana", kiero: "quiero", kero: "quiero", cto: "cuanto",
  qnto: "cuanto", aki: "aqui", pa: "para", vdd: "verdad", wapp: "WhatsApp", whats: "WhatsApp", promo: "promocion",
};

/** Corrige abreviaturas habituales sin cambiar montos, nombres ni texto libre. */
export function repairSalesText(text, models = []) {
  const fixes = [];
  let repaired = String(text ?? "").replace(/([a-zñ])\1{2,}/gi, "$1$1");
  repaired = repaired.replace(/[\p{L}\p{N}]+/gu, (word) => {
    const n = fold(word).replace(/[^\p{L}\p{N}]/gu, "");
    if (SHORT[n]) { fixes.push([word, SHORT[n]]); return SHORT[n]; }
    const model = models.find((m) => fold(m).replace(/[-\s]/g, "") === n);
    if (model && fold(word) !== fold(model)) { fixes.push([word, model]); return model; }
    return word;
  });
  return { text: repaired, fixes };
}

const MEDIA_ONLY = /^(?:<\s*)?(?:multimedia|media|imagen|image|video|audio|sticker|documento|document) (?:omitido|omitted)(?:\s*>)?$/i;
const SYSTEM = /cifrad[oa]s? de extremo a extremo|end-to-end encrypted|se elimin[oó] este mensaje|this message was deleted|mensajes temporales/i;
const HEADER = /^\s*\[?\s*(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4},?\s*)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?(?:\s?m\.?)?)?(?:,\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})?\s*\]?\s*(?:-\s*)?([^:\n]{1,60}):\s?(.*)$/i;

/** Importa texto copiado de WhatsApp; "Tú/Yo" y el nombre del asesor cuentan como mensajes propios. */
export function parsePastedChat(raw, advisorNames = ["Mario", "Mario Abarca"]) {
  const lines = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[\u200e\u200f\u202a-\u202e]/g, "").split("\n");
  const hasHeaders = lines.some((line) => HEADER.test(line));
  const out = [];
  const isAdvisor = (author) => {
    const a = fold(author).replace(/[^\p{L}\p{N} ]/gu, "").trim();
    return ["tu", "yo", "you", ...advisorNames.map(fold)].some((n) => a === n || (n.length > 3 && a.startsWith(`${n} `)));
  };
  if (!hasHeaders) {
    const body = lines.map((x) => x.trim()).filter((x) => x && !SYSTEM.test(x)).map((x) => MEDIA_ONLY.test(x) ? "[El cliente mandó una foto o archivo]" : x).join("\n");
    return body ? [{ sender: "cliente", author: null, body, hasMedia: /\[El cliente mandó/.test(body) }] : [];
  }
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m) {
      const author = m[1].trim();
      const rawBody = m[2].trim();
      if (SYSTEM.test(rawBody)) continue;
      const hasMedia = MEDIA_ONLY.test(rawBody);
      out.push({ sender: isAdvisor(author) ? "Mario" : "cliente", author, body: hasMedia ? "[El cliente mandó una foto o archivo]" : rawBody, hasMedia });
    } else if (line.trim() && out.length) out[out.length - 1].body += `\n${line.trim()}`;
  }
  return out.filter((m) => m.body.trim());
}

export function mergeCustomerBurst(messages) {
  return messages.filter((m) => m.sender === "cliente" && m.body).map((m) => m.body.trim()).join(". ").replace(/\s*\.\s*([.!?])/g, "$1").trim();
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Convierte una instrucción en filtros visibles. No selecciona ni envía por ambigüedad. */
export function parseSalesDirective(raw, customers, inventory, now = new Date()) {
  const modelNames = [...new Set(inventory.flatMap((a) => [a.modelo, a.version, ...(String(a.palabras ?? "").split(","))]).filter(Boolean))].sort((a, b) => b.length - a.length);
  const fixed = repairSalesText(raw, modelNames);
  const text = fixed.text.trim();
  const n = fold(text);
  const warnings = [];
  let message = null;
  let audienceText = text;
  const quote = text.match(/["“«]([^"”»]{3,})["”»]/);
  if (quote) { message = quote[1].trim(); audienceText = text.replace(quote[0], " "); }
  else if (text.includes(":")) { const i = text.indexOf(":"); if (i > 2 && text.slice(i + 1).trim()) { message = text.slice(i + 1).trim(); audienceText = text.slice(0, i); } }
  const a = fold(audienceText);
  const temperatures = [];
  if (/\b(muy calientes?|listos para cerrar)\b/.test(a)) temperatures.push("muy caliente");
  else if (/\b(calientes?|hot)\b/.test(a)) temperatures.push("caliente");
  if (/\b(tibios?|interesados?)\b/.test(a)) temperatures.push("tibio");
  if (/\b(frios?|congelados?|dormidos?)\b/.test(a)) temperatures.push("frio");
  const model = modelNames.find((m) => a.includes(fold(m))) ?? null;
  let period = null;
  const monthMatch = a.match(/\b(?:de|del mes de|en|mes de)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  if (monthMatch) {
    const m = MONTHS.indexOf(monthMatch[1] === "setiembre" ? "septiembre" : monthMatch[1]);
    let year = now.getFullYear(); if (m > now.getMonth() + 6) year--; else if (m < now.getMonth() - 6) year++;
    period = `${year}-${String(m + 1).padStart(2, "0")}`;
  } else if (/\b(este mes|del mes)\b/.test(a)) period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const appointment = /\b(citados?|citadas?|con cita|agendados?)\b/.test(a);
  const tomorrow = /\b(mañana|manana)\b/.test(a);
  const promo = /\b(promo|promocion|promociones|descuento|oferta|bono|difusion|difusión|flyer|volante)\b/.test(n);
  const media = [...new Set([...( /\b(foto|fotos|imagen|imágenes|imagenes)\b/.test(n) ? ["foto"] : []), ...( /\b(video|vídeo|videos|videos)\b/.test(n) ? ["video"] : []), ...( /\b(flyer|volante|folleto)\b/.test(n) ? ["flyer"] : [] )])];
  const nameMatches = customers.filter((c) => {
    const name = fold(c.name);
    return name.length > 3 && a.includes(name);
  });
  const all = /\b(todos|todas|toda la base|todos mis clientes)\b/.test(a);
  const verbs = /\b(hablale|hablales|escribele|escribeles|mandale|mandales|enviale|enviales|dile|diles|avisale|avisales|manda|envia|comparte|difunde|confirma|seguimiento|reactiva|contacta)\b/.test(n);
  const isDirective = verbs && (temperatures.length || model || period || appointment || all || nameMatches.length || /\bclientes?\b/.test(a));
  if (isDirective && !message && promo) warnings.push("No redacté una promoción sin el texto o condiciones que tú autorizaste. Escríbelas después de dos puntos o entre comillas.");
  if (isDirective && !temperatures.length && !model && !period && !appointment && !all && !nameMatches.length) warnings.push("No pude identificar destinatarios; no se preparó ningún envío.");
  return { isDirective, text, fixed: fixed.fixes, temperatures, model, period, appointment, tomorrow, all, customerIds: nameMatches.map((c) => c.id), media, purpose: promo ? "promo" : appointment ? "appointment" : "followup", message, warnings };
}

export function customerMonth(customer) {
  const d = new Date(customer.updatedAt || customer.createdAt || 0);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultSalesMessage(customer, { tone = "tu", model = "", day = new Date() } = {}) {
  const name = String(customer.name || "").trim().split(/\s+/)[0];
  const hi = name ? `Hola ${name}` : "Hola";
  const vehicle = model || customer.vehicle || "el auto que te interesa";
  const usted = tone === "usted";
  const dayText = [
    usted ? "Si gusta, lo revisamos con calma." : "Si quieres, lo revisamos con calma.",
    usted ? "¿Le aparto un espacio esta semana para verlo?" : "¿Te aparto un espacio esta semana para verlo?",
    usted ? "¿Le preparo una corrida con el enganche que le acomode?" : "¿Te preparo una corrida con el enganche que te acomode?",
    usted ? "Si gusta, le comparto fotos y versiones." : "Si quieres, te comparto fotos y versiones.",
    usted ? "¿Le queda venir este fin de semana?" : "¿Te queda venir este fin de semana?",
    usted ? "Si desea avanzar, revisamos opciones para apartarlo." : "Si quieres avanzar, revisamos opciones para apartarlo.",
    usted ? "Hoy estamos en agencia; será un gusto atenderle." : "Hoy estamos en agencia; aquí te esperamos.",
  ][day.getDay()];
  return `${hi}, ${usted ? "le doy" : "te doy"} seguimiento sobre ${vehicle}. ${dayText}`;
}
