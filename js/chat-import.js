// Importa chats exportados de WhatsApp ("Exportar chat"): Android da un .txt, iPhone un .zip con _chat.txt.
// Sin dependencias: el .zip se abre con DecompressionStream del navegador.

const LINE = /^‎?\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s*)?([^:]{1,60}?):\s?(.*)$/i;
const SYSTEM = /cifrad|encrypted|cre[oó] el grupo|created group|añadió|added|cambió|changed|eliminado|deleted|mensaje fue eliminado/i;
const MEDIA = /^<?(multimedia omitido|media omitted|imagen omitida|video omitido|audio omitido|sticker omitido|documento omitido)>?$|^‎?(image|video|audio|sticker|document) omitted$/i;

function toIso(d, m, y, hh, mm, ampm) {
  let year = Number(y);
  if (year < 100) year += 2000;
  let day = Number(d), month = Number(m);
  if (month > 12 && day <= 12) [day, month] = [month, day]; // exportación con mes/día
  let hour = Number(hh);
  if (ampm) { const pm = /p/i.test(ampm); if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0; }
  const dt = new Date(year, month - 1, day, hour, Number(mm));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Texto de un chat exportado → { participants: {nombre: n}, messages: [{ from, text, at }] } */
export function parseChat(text) {
  const messages = [];
  for (const raw of String(text).replace(/\r/g, "").replace(/[  ]/g, " ").split("\n")) {
    const m = LINE.exec(raw);
    if (m) {
      const [, d, mo, y, hh, mm, ampm, from, body] = m;
      if (SYSTEM.test(from)) continue;
      messages.push({ from: from.replace(/^‎/, "").trim(), text: body.replace(/^‎/, "").trim(), at: toIso(d, mo, y, hh, mm, ampm) });
    } else if (messages.length && raw.trim()) {
      messages[messages.length - 1].text += `\n${raw.trim()}`; // renglón extra del mismo mensaje
    }
  }
  const clean = messages.filter((x) => x.text && !MEDIA.test(x.text) && !SYSTEM.test(x.text));
  const participants = {};
  for (const x of clean) participants[x.from] = (participants[x.from] ?? 0) + 1;
  return { participants, messages: clean };
}

// ───────── .zip (formato estándar, sin librerías) ─────────

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function textFilesFromZip(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("El archivo .zip está dañado.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.txt$/i.test(name) || name.startsWith("__MACOSX")) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = b.subarray(start, start + csize);
    const raw = method === 0 ? data : method === 8 ? await inflate(data) : null;
    if (raw) out.push({ name, text: new TextDecoder().decode(raw) });
  }
  return out;
}

/** Lee los archivos elegidos (.txt o .zip) y devuelve los chats encontrados. */
export async function readChatFiles(files) {
  const chats = [];
  for (const f of files) {
    const isZip = /\.zip$/i.test(f.name) || f.type === "application/zip";
    const texts = isZip ? await textFilesFromZip(await f.arrayBuffer()) : [{ name: f.name, text: await f.text() }];
    for (const t of texts) {
      const chat = parseChat(t.text);
      if (chat.messages.length) chats.push({ file: f.name, ...chat, title: f.name.replace(/\.(zip|txt)$/i, "").replace(/^(Chat de WhatsApp con|WhatsApp Chat with|WhatsApp Chat - )\s*/i, "") });
    }
  }
  return chats;
}

/** Quién es el asesor: el nombre guardado o el participante que aparece en más chats. */
export function guessMe(chats, savedName) {
  if (savedName && chats.some((c) => c.participants[savedName])) return savedName;
  const seen = {};
  for (const c of chats) for (const p of Object.keys(c.participants)) seen[p] = (seen[p] ?? 0) + 1;
  const sorted = Object.entries(seen).sort((a, b) => b[1] - a[1]);
  return sorted.length && (chats.length === 1 ? null : sorted[0][1] > 1) ? sorted[0][0] : null;
}

const EMOJI = /\p{Extended_Pictographic}/gu;

/** Estadísticas sin IA del estilo del asesor. */
export function styleStats(examples) {
  const texts = examples.map((e) => e.text);
  if (!texts.length) return null;
  const words = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/);
  const avg = Math.round(texts.reduce((a, t) => a + t.length, 0) / texts.length);
  const emojis = {};
  let withEmoji = 0;
  for (const t of texts) { const e = t.match(EMOJI); if (e) { withEmoji++; for (const x of e) emojis[x] = (emojis[x] ?? 0) + 1; } }
  const greet = {};
  for (const t of texts) { const w = words(t).slice(0, 2).join(" ").replace(/[^\p{L}\p{N} ]/gu, ""); if (/^(hola|buen|que tal|hey|saludos|estimad)/.test(w)) greet[w] = (greet[w] ?? 0) + 1; }
  let usted = 0, tu = 0;
  for (const t of texts) { const w = words(t); if (w.some((x) => /^usted(es)?$|^su$|^le$/.test(x))) usted++; if (w.some((x) => /^(tu|te|ti|contigo)$/.test(x))) tu++; }
  return {
    count: texts.length,
    avg,
    emojiPct: Math.round((withEmoji / texts.length) * 100),
    topEmojis: Object.entries(emojis).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]),
    greetings: Object.entries(greet).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]),
    treatment: usted > tu * 1.5 ? "usted" : tu > usted * 1.5 ? "tú" : "mixto",
  };
}

/** "+52 1 81 1234 5678" como nombre de chat → teléfono; si no, null. */
export const phoneFromName = (name) => { const d = String(name).replace(/\D/g, ""); return d.length >= 10 && /^[\d\s+()-]+$/.test(String(name).trim()) ? d.slice(-10) : null; };
