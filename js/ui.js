// Piezas de interfaz compartidas por las pantallas.
import { h, toast, waDigits, inDays, toLocalInput, fmtWhen } from "./util.js";
import { STAGES, log, save, setFollowUp, state, stageLabel, learnFromAdvisor } from "./store.js";
import { openExternal } from "./native.js";

// ───────── Router mínimo por #hash ─────────

let renderFn = () => {};
export const setRenderer = (fn) => { renderFn = fn; };
export const rerender = () => renderFn();
export const go = (path) => { if (location.hash === `#${path}`) rerender(); else location.hash = path; };
export const route = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
export const query = () => new URLSearchParams(location.hash.split("?")[1] ?? "");

// ───────── Bloques ─────────

export const header = (title, { back, actions } = {}) =>
  h("header", { class: "top" },
    back ? h("button", { class: "icon-btn", "aria-label": "Atrás", onclick: () => (typeof back === "string" ? go(back) : history.back()) }, "‹") : h("span", { class: "brand" }, "SOFÍA"),
    h("h1", {}, title),
    h("div", { class: "row gap-s" }, actions ?? []));

export const section = (title, ...children) => h("section", { class: "card" }, title ? h("h2", {}, title) : null, ...children);

export const empty = (text, action) => h("div", { class: "empty" }, h("p", {}, text), action ?? null);

export function field(label, input, hint) {
  return h("label", { class: "field" }, h("span", {}, label), input, hint ? h("small", {}, hint) : null);
}

export const input = (attrs) => h("input", { class: "input", ...attrs });
export const textarea = (attrs, value = "") => { const t = h("textarea", { class: "input", rows: 4, ...attrs }); t.value = value; return t; };
export function select(options, value, attrs = {}) {
  const s = h("select", { class: "input", ...attrs }, options.map(([v, l]) => h("option", { value: v }, l)));
  s.value = value ?? "";
  return s;
}

export const btn = (label, onclick, kind = "") => h("button", { class: `btn ${kind}`, type: "button", onclick }, label);
export const chip = (text, kind = "") => h("span", { class: `chip ${kind}` }, text);
export const stageChip = (stage) => chip(stageLabel(stage), `st-${stage}`);
export const stageSelect = (value, onchange) => select(STAGES, value, { onchange: (e) => onchange(e.target.value), "aria-label": "Etapa" });

// ───────── Acciones comunes ─────────

/** Abre WhatsApp con el texto (el asesor pulsa Enviar) y lo registra en la bitácora. */
export function sendWhatsApp(c, text, { learn = true } = {}) {
  const digits = waDigits(c?.phone);
  if (!digits) { toast("Falta un celular válido (10 dígitos) en la ficha del cliente."); return false; }
  if (c?.id) log(c.id, "whatsapp", text);
  if (learn) learnFromAdvisor([text], "enviado"); // solo lo que el asesor escribió o editó
  save();
  openExternal(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
  return true;
}

export function call(c) {
  const d = String(c?.phone ?? "").replace(/[^\d+]/g, "");
  if (!d) { toast("Este cliente no tiene teléfono."); return; }
  log(c.id, "llamada", "Llamada");
  save();
  openExternal(`tel:${d}`);
}

/** Botones rápidos de "próximo seguimiento". */
export function followUpPicker(c, onDone = rerender) {
  const custom = input({ type: "datetime-local", value: c.nextFollowUp ? toLocalInput(new Date(c.nextFollowUp)) : "", "aria-label": "Fecha de seguimiento" });
  const set = (d, label) => { setFollowUp(c.id, d); toast(d ? `Seguimiento: ${fmtWhen(d.toISOString())}` : "Seguimiento quitado"); if (label) log(c.id, "seguimiento", label); onDone(); };
  return h("div", { class: "stack-s" },
    h("div", { class: "row wrap gap-s" },
      btn("Mañana", () => set(inDays(1), "Seguimiento para mañana"), "small"),
      btn("En 3 días", () => set(inDays(3), "Seguimiento en 3 días"), "small"),
      btn("En 1 semana", () => set(inDays(7), "Seguimiento en 1 semana"), "small"),
      btn("En 1 mes", () => set(inDays(30), "Seguimiento en 1 mes"), "small"),
      c.nextFollowUp ? btn("Quitar", () => set(null), "small ghost") : null),
    h("div", { class: "row gap-s" }, custom, btn("Fijar", () => { if (custom.value) set(new Date(custom.value), "Seguimiento programado"); }, "small")));
}

/** Selector de cliente (para WhatsApp y recordatorios sin cliente previo). */
export function customerSelect(value, onchange) {
  return select([["", "— Sin cliente —"], ...state.customers.map((c) => [c.id, c.name || "(sin nombre)"])], value, { onchange: (e) => onchange(e.target.value) });
}
