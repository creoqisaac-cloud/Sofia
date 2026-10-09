// Pantalla "Hoy": lo que hay que hacer ahora mismo.
import { h, fmtWhen, todayEnd, inDays, toast } from "./util.js";
import { state, customer, openReminders, updateReminder, lastContact, plateLabel, setFollowUp } from "./store.js";
import { header, section, empty, btn, go, rerender, sendWhatsApp, stageChip, chip } from "./ui.js";
import { connectorReady } from "./connector.js";
import { aiReady } from "./ai.js";
import { fillTemplate, suggestTemplateId, template } from "./rules.js";

export function renderHome(root) {
  const s = state.settings;
  const now = Date.now();
  const end = todayEnd().getTime();
  const due = openReminders().filter((r) => new Date(r.at).getTime() <= end);
  const overdue = due.filter((r) => new Date(r.at).getTime() < now);
  const plates = state.customers.filter((c) => c.plates && !["entregadas"].includes(c.plates.status));
  const credits = state.customers.filter((c) => c.credit && c.credit.status !== "enviada" && c.stage === "credito");
  const hello = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches";

  root.append(
    header("Hoy"),
    h("div", { class: "page" },
      h("p", { class: "lead" }, `${hello}${s.advisorName ? `, ${s.advisorName.split(" ")[0]}` : ""}.`, " ",
        due.length ? `Tienes ${due.length} pendiente${due.length === 1 ? "" : "s"} para hoy${overdue.length ? ` (${overdue.length} atrasado${overdue.length === 1 ? "" : "s"})` : ""}.` : "No tienes pendientes vencidos."),
      h("div", { class: "grid3" },
        tile("Clientes", state.customers.length, () => go("/clientes")),
        tile("Placas en trámite", plates.length, () => go("/clientes?f=placas")),
        tile("Créditos por enviar", credits.length, () => go("/clientes?f=credito"))),
      h("div", { class: "row wrap gap-s" },
        btn("+ Cliente", () => go("/cliente/nuevo"), "primary"),
        btn("Solicitud de crédito con INE", () => go("/cliente/nuevo?siguiente=credito")),
        btn(connectorReady() ? "Bandeja de WhatsApp" : "Responder WhatsApp", () => go(connectorReady() ? "/whatsapp?tab=bandeja" : "/whatsapp?tab=responder")),
        btn("Recordatorios", () => go("/recordatorios"), "ghost")),
      !aiReady() || !connectorReady() ? h("button", { class: "item", onclick: () => go("/conexiones") },
        h("div", { class: "grow" }, h("strong", {}, "Activa todo el poder de Sofía"), h("div", { class: "muted small" }, [!aiReady() && "IA para INE y mensajes en tu estilo", !connectorReady() && "WhatsApp Business y Facebook reales"].filter(Boolean).join(" · "))),
        h("span", { class: "muted" }, "›")) : null,
      section("Pendientes de hoy",
        due.length ? h("div", { class: "list" }, due.map(reminderRow)) : empty("Nada pendiente para hoy. Programa seguimientos desde la ficha de cada cliente.")),
      plates.length ? section("Placas en trámite", h("div", { class: "list" }, plates.map((c) =>
        h("button", { class: "item", onclick: () => go(`/cliente/${c.id}/placas`) },
          h("div", {}, h("strong", {}, c.name), h("div", { class: "muted" }, c.vehicle || "")),
          chip(plateLabel(c.plates.status)))))) : null,
    ));
}

function tile(label, n, onclick) {
  return h("button", { class: "tile", onclick }, h("strong", {}, String(n)), h("span", {}, label));
}

function reminderRow(r) {
  const c = r.customerId ? customer(r.customerId) : null;
  const late = new Date(r.at).getTime() < Date.now();
  const tplId = c ? suggestTemplateId(c, lastContact(c.id)?.at) : null;
  return h("div", { class: `item col ${late ? "late" : ""}` },
    h("div", { class: "row between" },
      h("div", {},
        h("strong", {}, c ? c.name : r.text),
        h("div", { class: "muted" }, `${fmtWhen(r.at)}${c ? ` · ${r.text}` : ""}`)),
      c ? stageChip(c.stage) : null),
    h("div", { class: "row wrap gap-s" },
      c ? btn("WhatsApp", () => {
        if (!sendWhatsApp(c, fillTemplate(template(tplId).text, c), { learn: false })) return;
        // Contactado: el seguimiento no se pierde, se mueve 3 días (se puede cambiar en la ficha).
        if (r.kind === "seguimiento") { setFollowUp(c.id, inDays(3)); toast("Próximo seguimiento en 3 días"); rerender(); } else done(r, c);
      }, "small wa") : null,
      c ? btn("Ficha", () => go(`/cliente/${c.id}`), "small") : null,
      btn("Hecho", () => done(r, c), "small"),
      btn("Mañana", () => { if (c && r.kind === "seguimiento") setFollowUp(c.id, inDays(1)); else updateReminder(r.id, { at: inDays(1).toISOString() }); toast("Movido a mañana"); rerender(); }, "small ghost")));
}

function done(r, c) {
  if (c && r.kind === "seguimiento") c.nextFollowUp = null;
  updateReminder(r.id, { done: true, doneAt: new Date().toISOString() });
  toast(c ? `Listo. ¿Cuándo vuelves a contactar a ${c.name.split(" ")[0]}? Prográmalo en su ficha.` : "Listo");
  rerender();
}
