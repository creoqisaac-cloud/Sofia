// Arranque: carga datos del dispositivo, enruta pantallas, avisa recordatorios y respalda si hay servidor.
import { h, $, toast, modal, debounce } from "./util.js";
import { load, state, save, onChange, customer, addFeedback, serverPush, serverPeek, serverPull, backupReady } from "./store.js";
import { askPersistence } from "./db.js";
import { setRenderer, route, go, field, input, textarea, rerender } from "./ui.js";
import { renderHome } from "./v-home.js";
import { renderCustomers, renderCustomer, renderCustomerForm } from "./v-customers.js";
import { renderCredit } from "./v-credit.js";
import { renderPlates } from "./v-plates.js";
import { renderWhatsApp } from "./v-whatsapp.js";
import { renderReminders } from "./v-reminders.js";
import { renderSettings } from "./v-settings.js";
import { renderChat } from "./v-whatsapp.js";
import { renderMore } from "./v-more.js";
import { renderConnections } from "./v-connections.js";
import { renderStyle } from "./v-style.js";
import { renderSocial } from "./v-social.js";
import { renderInventory, renderCarForm, renderSimulator } from "./v-inventory.js";
import { renderSalesDesk } from "./v-sales-desk.js";
import { renderHoyMario, renderChatsMario, renderChatMario, renderCarteraMario, renderAutosMario, renderAutoMario, renderAjustesMario } from "./mario.js";
import { connectorReady, inbox, refreshStatus } from "./connector.js";
import { googleReady, googleStatus, saveEvent, deleteEvent, closeEmailCase } from "./google.js";
import { isNative, nativeNotifications, syncNativeReminders, onNotificationTap, webNotify } from "./native.js";

// Íconos de trazo (heredan el color del texto).
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  hoy: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  clientes: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>'),
  whatsapp: svg('<path d="M20 11.5a8 8 0 01-11.8 7L4 20l1.5-4.1A8 8 0 1120 11.5z"/><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.6"/>'),
  avisos: svg('<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z"/><path d="M10 20.5a2 2 0 004 0"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  redes: svg('<path d="M3 10v4l3 .5V18a1.5 1.5 0 003 0v-3l9 3V6L6 9.5 3 10z"/><path d="M21 10v4"/>'),
  mas: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  autos: svg('<path d="M4 16v-3l2-5h12l2 5v3"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/>'),
  comentario: svg('<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9.5h8M8 12.5h5"/>'),
};

const NAV = [
  ["/", "Hoy", ICONS.hoy],
  ["/chats", "Chats", ICONS.whatsapp],
  ["/cartera", "Clientes", ICONS.clientes],
  ["/autos", "Autos", ICONS.autos],
];
// Pantallas que se abren desde "Más" (la pestaña Más queda marcada).
const UNDER_MORE = ["/mas", "/recordatorios", "/ajustes", "/conexiones", "/estilo"];
// Pantallas de la vendedora (la pestaña WhatsApp queda marcada).
const UNDER_WA = ["/inventario", "/probar", "/ventas"];

function screenName(path) {
  if (path === "/") return "Hoy";
  if (path.endsWith("/credito")) return "Crédito";
  if (path.endsWith("/placas")) return "Placas";
  if (path.startsWith("/cliente")) return "Cliente";
  if (path.startsWith("/whatsapp/chat")) return "Conversación";
  if (path === "/estilo") return "Mi estilo";
  if (path === "/conexiones") return "Conexiones";
  if (path === "/recordatorios") return "Recordatorios";
  if (path === "/ajustes") return "Ajustes";
  if (path.startsWith("/inventario")) return "Inventario";
  if (path === "/probar") return "Probar a Sofía";
  if (path === "/ventas") return "Operación de ventas";
  return NAV.find((n) => path.startsWith(n[0]) && n[0] !== "/")?.[1] ?? path;
}

function render() {
  const path = route();
  const view = $("#view");
  view.replaceChildren();
  const seg = path.split("/").filter(Boolean);
  try {
    if (path === "/") renderHoyMario(view);
    else if (seg[0] === "chats") renderChatsMario(view);
    else if (seg[0] === "chat" && seg[1]) renderChatMario(view, decodeURIComponent(seg[1]));
    else if (seg[0] === "cartera") renderCarteraMario(view);
    else if (seg[0] === "autos") renderAutosMario(view);
    else if (seg[0] === "auto" && seg[1]) renderAutoMario(view, decodeURIComponent(seg[1]));
    else if (seg[0] === "sofia") renderAjustesMario(view);
    else if (seg[0] === "inicio") renderHome(view);
    else if (seg[0] === "clientes") renderCustomers(view);
    else if (seg[0] === "cliente" && seg[1] === "nuevo") renderCustomerForm(view, null);
    else if (seg[0] === "cliente" && seg[2] === "editar") renderCustomerForm(view, seg[1]);
    else if (seg[0] === "cliente" && seg[2] === "credito") renderCredit(view, seg[1]);
    else if (seg[0] === "cliente" && seg[2] === "placas") renderPlates(view, seg[1]);
    else if (seg[0] === "cliente") renderCustomer(view, seg[1]);
    else if (seg[0] === "whatsapp" && seg[1] === "chat" && seg[2]) renderChat(view, decodeURIComponent(seg[2]));
    else if (seg[0] === "whatsapp") renderWhatsApp(view);
    else if (seg[0] === "redes") renderSocial(view);
    else if (seg[0] === "inventario" && seg[1]) renderCarForm(view, decodeURIComponent(seg[1]));
    else if (seg[0] === "inventario") renderInventory(view);
    else if (seg[0] === "probar") renderSimulator(view);
    else if (seg[0] === "ventas") renderSalesDesk(view);
    else if (seg[0] === "mas") renderMore(view);
    else if (seg[0] === "conexiones") renderConnections(view);
    else if (seg[0] === "estilo") renderStyle(view);
    else if (seg[0] === "recordatorios") renderReminders(view);
    else if (seg[0] === "ajustes") renderSettings(view);
    else go("/");
  } catch (e) {
    console.error(e);
    view.append(h("div", { class: "page" }, h("p", { class: "warn" }, `Algo falló en esta pantalla: ${e.message}`), h("button", { class: "btn", onclick: () => go("/") }, "Ir a Hoy")));
  }
  for (const a of document.querySelectorAll("nav.bottom a")) {
    const p = a.getAttribute("href").slice(1);
    a.classList.toggle("on", p === "/" ? path === "/" : path.startsWith(p) || (p === "/chats" && path.startsWith("/chat/")) || (p === "/autos" && path.startsWith("/auto/")));
    if (p === "/chats") {
      a.querySelector(".badge")?.remove();
      if (unread) a.querySelector(".ic").append(h("span", { class: "badge" }, String(unread)));
    }
  }
}

function shell() {
  document.body.append(
    h("main", { id: "view" }),
    h("nav", { class: "bottom" }, NAV.map(([p, label, icon]) => h("a", { href: `#${p}` }, h("span", { class: "ic", "aria-hidden": "true", html: icon }), h("span", {}, label)))));
}

function feedback() {
  const t = textarea({ rows: 5, placeholder: "¿Qué falta, qué sobra, qué no se entiende? Todo sirve." });
  modal(`Comentario · ${screenName(route())}`, h("div", { class: "stack-s" }, h("p", { class: "muted small" }, "Se guarda aquí y lo mandas desde Ajustes → Comentarios."), t), [
    { label: "Cancelar" },
    { label: "Guardar", kind: "primary", onClick: () => { if (!t.value.trim()) return false; addFeedback(screenName(route()), t.value.trim()); toast("¡Gracias! Comentario guardado"); } },
  ]);
}

function onboarding() {
  if (state.settings.onboarded) return;
  const name = input({ placeholder: "Tu nombre" });
  const agency = input({ placeholder: "Nombre de la agencia" });
  modal("Bienvenido a Sofía", h("div", { class: "stack-s" },
    h("p", {}, "Clientes con seguimiento, solicitud de crédito con INE, correos de placas y asistente de WhatsApp. Funciona sin internet y sin IA; todo se guarda en este dispositivo."),
    field("¿Cómo te llamas?", name), field("¿En qué agencia trabajas?", agency)), [
    { label: "Empezar", kind: "primary", onClick: () => {
      state.settings.advisorName = name.value.trim();
      state.settings.agency = agency.value.trim();
      state.settings.onboarded = true;
      save();
      rerender();
    } },
  ]);
}

// ───────── Recordatorios ─────────

const fired = new Set();
function tick() {
  const now = Date.now();
  for (const r of state.reminders) {
    if (r.done || fired.has(r.id)) continue;
    const t = new Date(r.at).getTime();
    if (t <= now && now - t < 5 * 60000) {
      fired.add(r.id);
      const c = r.customerId ? customer(r.customerId) : null;
      toast(`⏰ ${r.text}`, 8000);
      if (!nativeNotifications()) webNotify("Sofía", c ? `${r.text} · ${c.name}` : r.text);
    }
  }
}

const syncNative = debounce(() => {
  if (nativeNotifications()) syncNativeReminders(state.reminders, (id) => customer(id)?.name).catch((e) => console.warn("Notificaciones:", e));
}, 800);

// ───────── Bandeja: avisos de mensajes nuevos (si hay conector con WhatsApp/Messenger) ─────────

let unread = 0;
let lastSeenAt = null;
async function checkInbox() {
  if (!connectorReady() || document.visibilityState !== "visible") return;
  try {
    const conv = Object.entries(await inbox());
    unread = conv.filter(([k, c]) => k.startsWith("wa:") && c.lastDir === "in" && Date.now() - new Date(c.lastAt) < 30 * 864e5).length;
    const newest = conv.map(([, c]) => c).filter((c) => c.lastDir === "in").sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))[0];
    if (newest && lastSeenAt && newest.lastAt > lastSeenAt && !route().startsWith("/chat/")) {
      toast(`💬 ${newest.name || "Cliente"}: ${(newest.lastText ?? "").slice(0, 60)}`, 6000);
      webNotify("Nuevo mensaje", `${newest.name || "Cliente"}: ${newest.lastText ?? ""}`);
    }
    if (newest) lastSeenAt = newest.lastAt > (lastSeenAt ?? "") ? newest.lastAt : lastSeenAt;
    const a = document.querySelector('nav.bottom a[href="#/chats"] .ic');
    a?.querySelector(".badge")?.remove();
    if (unread && a) a.append(h("span", { class: "badge" }, String(unread)));
  } catch { /* sin red: se reintenta en la siguiente vuelta */ }
}

// ───────── Google Calendar: los recordatorios suenan en el iPhone aunque Sofía esté cerrada ─────────

let calBusy = false;
let calAgain = false; // llegó otro cambio mientras sincronizaba: se repite al terminar
const syncCalendar = debounce(async () => {
  if (!googleReady() || !navigator.onLine) return;
  if (calBusy) { calAgain = true; return; }
  calBusy = true;
  let changed = false;
  try {
    while (state.calTrash.length) {
      await deleteEvent(state.calTrash[0]); // si falla se queda en la cola (si ya no existe, Google contesta ok)
      state.calTrash.shift();
      changed = true;
    }
    const now = Date.now();
    for (const r of [...state.reminders]) {
      const t = new Date(r.at).getTime();
      // Eventos nuevos solo para lo próximo (60 días); uno que ya tiene evento se mueve a donde vaya.
      if (r.done || (!r.calendarId && (t < now - 3600000 || t > now + 60 * 86400000))) continue;
      const c = r.customerId ? customer(r.customerId) : null;
      const sig = `${r.at}|${r.text}|${c?.name ?? ""}|${c?.phone ?? ""}`;
      if (r.calendarSig === sig && r.calendarId) continue;
      if (!state.reminders.includes(r)) continue; // lo borraron durante la vuelta
      const id = await saveEvent({ id: r.calendarId ?? undefined, ref: r.id, title: c ? `${r.text} · ${c.name}` : r.text, description: c?.phone ? `Cliente: ${c.name}\nTel. ${c.phone}\nWhatsApp: https://wa.me/${c.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "52$1")}` : "Recordatorio de Sofía", at: r.at, alerts: [5] });
      changed = true;
      // Lo marcaron hecho o lo borraron mientras Google contestaba: su evento va a la papelera.
      if (r.done || !state.reminders.includes(r)) { state.calTrash.push(id); calAgain = true; continue; }
      r.calendarId = id;
      r.calendarSig = sig;
    }
  } catch (e) {
    console.warn("Calendario:", e.message); // se reintenta en el siguiente cambio, al volver a la app o al haber red
  } finally {
    calBusy = false;
    if (changed) {
      save();
      if (document.visibilityState === "hidden") autoPush(); // el respaldo ya lleva los ids de los eventos
    }
    if (calAgain) { calAgain = false; syncCalendar(); }
  }
}, 2500);

// ───────── Servidor propio (opcional) ─────────

let dirty = false;
const autoPush = debounce(async () => {
  if (!state.settings.server.auto || !backupReady() || !dirty) return;
  try { await serverPush(); dirty = false; } catch (e) { console.warn("Servidor:", e.message); }
}, 1500);

async function checkServerOnStart() {
  const sv = state.settings.server;
  if (!sv.auto || !backupReady()) return;
  try {
    const meta = await serverPeek();
    if (meta.updatedAt && (!sv.lastSync || meta.updatedAt > sv.lastSync) && meta.updatedAt > state.updatedAt) {
      modal("Hay datos más nuevos en el servidor", h("p", {}, "Otro dispositivo guardó cambios. ¿Traerlos a este?"), [
        { label: "Ahora no" },
        { label: "Traer", kind: "primary", onClick: async () => { await serverPull(); toast("Datos actualizados"); rerender(); } },
      ]);
    }
  } catch (e) { console.warn("Servidor:", e.message); }
}

// Link de un toque que la computadora de Mario le manda a su chat «Tú»:
//   …/#/conectar?u=https://xxxx.trycloudflare.com&k=CLAVE
// Deja la app apuntando a esa Sofía y ofrece subir (o traer) los clientes de este dispositivo.
function linkDeConexion() {
  const m = location.hash.match(/^#\/conectar\?(.*)$/);
  if (!m) return null;
  const p = new URLSearchParams(m[1]);
  history.replaceState(null, "", location.pathname + location.search + "#/"); // la clave no se queda en la barra ni en el historial
  const u = (p.get("u") ?? "").trim().replace(/\/+$/, "");
  const k = (p.get("k") ?? "").trim();
  if (!/^https:\/\/[\w.-]+(:\d+)?$/.test(u) || k.length < 16) return { error: "El link de conexión está incompleto. Pide uno nuevo." };
  const sv = state.settings.server;
  const cambio = sv.url !== u || sv.token !== k;
  sv.url = u; sv.token = k; sv.auto = true;
  save();
  return { cambio };
}

async function despuesDeConectar() {
  try {
    const meta = await serverPeek();
    const locales = state.customers?.length ?? 0;
    if (!meta.updatedAt && locales) {
      modal("Conectada a la Sofía de Mario", h("p", {}, `Este dispositivo tiene ${locales} cliente(s). ¿Los subo a Sofía para que ella los conozca y los veas en todos tus dispositivos?`), [
        { label: "Ahora no" },
        { label: "Subir", kind: "primary", onClick: async () => { try { await serverPush(); toast("Clientes subidos a Sofía"); } catch (e) { toast(e.message, 6000); return false; } } },
      ]);
    } else if (meta.updatedAt && !locales) {
      await serverPull(); toast("Conectada. Traje los clientes de Sofía"); rerender();
    } else if (meta.updatedAt && locales) {
      modal("Conectada a la Sofía de Mario", h("p", {}, "Sofía ya tiene clientes guardados y este dispositivo también. ¿Qué hago?"), [
        { label: "Traer los de Sofía", onClick: async () => { try { await serverPull(); toast("Datos actualizados"); rerender(); } catch (e) { toast(e.message, 6000); return false; } } },
        { label: "Subir los de aquí", kind: "primary", onClick: async () => { try { await serverPush(); toast("Clientes subidos a Sofía"); } catch (e) { toast(e.message, 6000); return false; } } },
      ]);
    } else toast("Conectada a la Sofía de Mario");
  } catch (e) {
    toast("No pude hablar con la computadora de Mario: " + e.message, 7000);
  }
}

// ───────── Inicio ─────────

async function start() {
  document.documentElement.classList.toggle("native", isNative());
  shell();
  await load();
  const link = linkDeConexion();
  askPersistence();
  setRenderer(render);
  window.addEventListener("hashchange", render);
  render();
  // La bienvenida de la versión anterior ya no aplica: Sofía es de Mario y se conecta con su link.
  onChange(() => { dirty = true; syncNative(); syncCalendar(); });
  syncNative();
  onNotificationTap((extra) => { if (extra.customerId) go(`/cliente/${extra.customerId}`); });
  setInterval(tick, 30000);
  tick();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autoPush(); else { tick(); syncCalendar(); if (route() === "/") render(); } });
  window.addEventListener("online", () => syncCalendar());
  if (link?.error) toast(link.error, 7000);
  else if (link) despuesDeConectar();
  else checkServerOnStart();
  if (connectorReady()) { refreshStatus().then(() => { if (route() === "/") render(); }).catch(() => {}); checkInbox(); }
  if (googleReady()) {
    googleStatus().catch(() => {});
    syncCalendar();
    // Casos de placas entregadas cuyo cierre en Gmail no llegó: se reintenta para que no haya más seguimientos.
    for (const c of state.customers) if (c.plates?.closePending) closeEmailCase(c.id).then(() => { delete c.plates.closePending; save(); }).catch(() => {});
  }
  setInterval(checkInbox, 30000);
  if ("serviceWorker" in navigator && !isNative() && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

start().catch((e) => {
  console.error(e);
  document.body.append(h("p", { class: "warn page" }, `No se pudo abrir Sofía: ${e.message}. Si estás en modo privado del navegador, ábrela en una ventana normal.`));
});
