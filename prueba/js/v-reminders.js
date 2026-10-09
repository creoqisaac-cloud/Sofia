// Recordatorios: crear, completar y llevarlos al calendario del teléfono.
import { h, toast, fmtWhen, toLocalInput, inDays, download, confirmBox } from "./util.js";
import { state, customer, addReminder, updateReminder, deleteReminder } from "./store.js";
import { header, section, empty, btn, go, rerender, field, input, customerSelect } from "./ui.js";
import { isNative, nativeNotifications, notificationsStatus, requestNotifications } from "./native.js";

export function renderReminders(root) {
  const text = input({ placeholder: "Ej. Llamar para confirmar cita" });
  const when = input({ type: "datetime-local", value: toLocalInput(inDays(1)) });
  let cid = "";
  const sel = customerSelect("", (v) => { cid = v; });
  const notif = h("div");
  drawNotif(notif);
  const open = state.reminders.filter((r) => !r.done);
  const done = state.reminders.filter((r) => r.done).slice(-15).reverse();

  root.append(
    header("Recordatorios"),
    h("div", { class: "page" },
      notif,
      section("Nuevo recordatorio",
        field("¿Qué hay que hacer?", text),
        h("div", { class: "grid2" }, field("Cuándo", when), field("Cliente (opcional)", sel)),
        h("div", { class: "row end" }, btn("Agregar", () => {
          if (!text.value.trim() || !when.value) { toast("Escribe qué y cuándo."); return; }
          const r = addReminder({ at: new Date(when.value), text: text.value.trim(), customerId: cid || null });
          toast(`Recordatorio ${fmtWhen(r.at)}`);
          rerender();
        }, "primary"))),
      section(`Próximos (${open.length})`,
        open.length ? h("div", { class: "list" }, open.map(row)) : empty("Sin recordatorios abiertos."),
        open.length && !nativeNotifications() ? h("div", { class: "row end" }, btn("Agregar todos a mi calendario", () => download(ics(open), "sofia-recordatorios.ics"), "small ghost")) : null),
      done.length ? section("Hechos recientemente", h("div", { class: "list" }, done.map((r) => h("div", { class: "item muted" }, h("span", { class: "grow" }, `✓ ${r.text}`), h("span", { class: "small" }, fmtWhen(r.at)))))) : null));
}

function row(r) {
  const c = r.customerId ? customer(r.customerId) : null;
  const late = new Date(r.at) < new Date();
  return h("div", { class: `item col ${late ? "late" : ""}` },
    h("div", {}, h("strong", {}, r.text), h("div", { class: "muted small" }, `${fmtWhen(r.at)}${c ? ` · ${c.name}` : ""}`)),
    h("div", { class: "row wrap gap-s" },
      btn("Hecho", () => { if (c && r.kind === "seguimiento") c.nextFollowUp = null; updateReminder(r.id, { done: true, doneAt: new Date().toISOString() }); rerender(); }, "small"),
      c ? btn("Ficha", () => go(`/cliente/${c.id}`), "small ghost") : null,
      !nativeNotifications() ? btn("Al calendario", () => download(ics([r]), "recordatorio.ics"), "small ghost") : null,
      btn("Borrar", async () => { if (await confirmBox("Borrar recordatorio", r.text, "Borrar")) { if (c && r.kind === "seguimiento") c.nextFollowUp = null; deleteReminder(r.id); rerender(); } }, "small ghost")));
}

async function drawNotif(box) {
  const st = await notificationsStatus();
  if (st === "granted") {
    box.replaceChildren(h("p", { class: "ok-text small" }, isNative()
      ? "✓ Los recordatorios suenan en este teléfono aunque la app esté cerrada."
      : "✓ Avisos activados mientras Sofía esté abierta. Para que suenen con la app cerrada, agrégalos a tu calendario."));
    return;
  }
  const iphone = /iPhone|iPad/i.test(navigator.userAgent);
  box.replaceChildren(section("Avisos",
    h("p", { class: "muted" }, isNative()
      ? "Permite las notificaciones para que los recordatorios suenen aunque la app esté cerrada."
      : iphone
        ? "En iPhone, para que el aviso suene con la app cerrada usa «Al calendario» en cada recordatorio (se importa a Calendario con alarma)."
        : "Activa los avisos del navegador, o agrega los recordatorios a tu calendario."),
    st === "unsupported" ? null : btn("Activar avisos", async () => { await requestNotifications(); drawNotif(box); }, "small primary")));
}

// ───────── Calendario (.ics) ─────────

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s) => String(s ?? "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export function ics(reminders) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sofia//Recordatorios//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const r of reminders) {
    const c = r.customerId ? customer(r.customerId) : null;
    const end = new Date(new Date(r.at).getTime() + 15 * 60000).toISOString();
    lines.push("BEGIN:VEVENT", `UID:${r.id}@sofia`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(r.at)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${esc(c ? `${r.text} (${c.name})` : r.text)}`, c?.phone ? `DESCRIPTION:${esc(`Tel. ${c.phone}`)}` : "DESCRIPTION:Sofía",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(r.text)}`, "TRIGGER:-PT0M", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}
