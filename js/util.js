// Utilidades pequeñas sin dependencias: DOM, fechas, avisos.

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Crea un elemento: h("button", { class: "btn", onclick }, "Texto", otroNodo). */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = Boolean(v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// ───────── Fechas (hora local del dispositivo) ─────────

const pad = (n) => String(n).padStart(2, "0");
/** Valor para <input type="datetime-local">. */
export const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromLocalInput = (s) => (s ? new Date(s) : null);
export const todayEnd = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** "hoy 10:30", "mañana 9:00", "lun 14 oct 9:00", "hace 2 días". */
export function fmtWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = startOfDay(d).getTime();
  const today = startOfDay().getTime();
  const diff = Math.round((day - today) / 86400000);
  const time = d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `mañana ${time}`;
  if (diff === -1) return `ayer ${time}`;
  if (diff < -1 && diff > -7) return `hace ${-diff} días`;
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) + ` ${time}`;
}
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "");
/** Mañana a las 10:00, en N días a las 10:00, etc. */
export function inDays(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export const money = (n) => (Number.isFinite(n) ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }) : "—");
export const num = (s) => {
  const v = Number(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) && String(s ?? "").trim() !== "" ? v : NaN;
};

/** Solo dígitos; 10 dígitos de México → 52 + número (formato de wa.me). */
export function waDigits(phone) {
  const raw = String(phone ?? "").replace(/\D/g, "");
  const n = raw.length === 10 ? `52${raw}` : raw;
  return /^\d{11,15}$/.test(n) ? n : null;
}

export const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

// ───────── Avisos ─────────

export function toast(msg, ms = 2600) {
  for (const old of document.querySelectorAll(".toast")) old.remove(); // uno a la vez, sin encimarse
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
}

/** Ventana modal simple. Devuelve una función para cerrarla. */
export function modal(title, body, actions = []) {
  const close = () => wrap.remove();
  const wrap = h("div", { class: "modal-wrap", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal-head" }, h("h2", {}, title), h("button", { class: "icon-btn", "aria-label": "Cerrar", onclick: close }, "✕")),
      body,
      actions.length ? h("div", { class: "row end gap" }, actions.map((a) => h("button", { class: `btn ${a.kind ?? ""}`, onclick: async () => { if ((await a.onClick?.()) !== false) close(); } }, a.label))) : null,
    ));
  document.body.append(wrap);
  wrap.querySelector("input,textarea,select")?.focus();
  return close;
}

export const confirmBox = (title, text, okLabel = "Sí") =>
  new Promise((resolve) => {
    const close = modal(title, h("p", {}, text), [
      { label: "Cancelar", onClick: () => resolve(false) },
      { label: okLabel, kind: "primary", onClick: () => resolve(true) },
    ]);
    void close;
  });

export function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
export const dataUrlToBlob = async (url) => (await fetch(url)).blob();
export const blobToBase64 = async (blob) => (await blobToDataUrl(blob)).split(",")[1] ?? "";
export function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Reduce una foto (máx. 1600 px, JPEG) para que pese poco en el teléfono y en respaldos. */
export async function shrinkImage(file, max = 1600, quality = 0.82) {
  if (!file.type?.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    return out ?? file;
  } catch {
    return file; // p. ej. HEIC en un navegador que no lo abre: se guarda tal cual
  }
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const safeName = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
