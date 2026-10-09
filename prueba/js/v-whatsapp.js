// Asistente de WhatsApp SIN IA: plantillas, mensaje sugerido por etapa, respuestas por tema y
// lista de pendientes. Abre WhatsApp con el texto listo; la persona pulsa Enviar. IA = opcional.
import { h, toast, inDays, fmtWhen, uid, waDigits, confirmBox } from "./util.js";
import { state, customer, save, lastContact, updateCustomer, setFollowUp, DEFAULT_TEMPLATES, addCustomer, stageLabel } from "./store.js";
import { header, section, empty, btn, go, rerender, query, field, input, textarea, customerSelect, sendWhatsApp, followUpPicker, stageChip } from "./ui.js";
import { fillTemplate, suggestTemplateId, template, classifyMessage } from "./rules.js";
import { aiEnabled, aiWrite } from "./ai.js";

const TABS = [["escribir", "Escribir"], ["responder", "Responder"], ["pendientes", "Pendientes"], ["plantillas", "Plantillas"]];

export function renderWhatsApp(root) {
  const q = query();
  const tab = q.get("tab") ?? (q.get("c") ? "escribir" : "pendientes");
  const cid = q.get("c") ?? "";
  const body = h("div", { class: "page" },
    h("div", { class: "tabs", role: "tablist" }, TABS.map(([id, label]) => h("button", { role: "tab", "aria-selected": String(tab === id), class: tab === id ? "on" : "", onclick: () => go(`/whatsapp?tab=${id}${cid ? `&c=${cid}` : ""}`) }, label))));
  root.append(header("WhatsApp", { back: cid ? `/cliente/${cid}` : undefined }), body);
  ({ escribir: write, responder: reply, pendientes: pending, plantillas: templates }[tab] ?? pending)(body, cid);
}

const changeCustomer = (tab) => (id) => go(`/whatsapp?tab=${tab}${id ? `&c=${id}` : ""}`);

/** Destinatario: cliente de la lista o un número suelto. */
function recipient(cid, tab) {
  const c = cid ? customer(cid) : null;
  const phone = input({ type: "tel", inputmode: "tel", placeholder: "81 1234 5678", value: c?.phone ?? "" });
  return { c, phone, el: h("div", { class: "grid2" }, field("Cliente", customerSelect(cid, changeCustomer(tab))), field("Celular", phone)) };
}

function target(c, phoneInput) {
  const phone = phoneInput.value.trim();
  if (c) {
    if (phone && phone !== c.phone) { updateCustomer(c.id, { phone }, { silent: true }); save(); }
    return c;
  }
  if (!waDigits(phone)) { toast("Escribe un celular válido (10 dígitos)."); return null; }
  return { phone, name: "" };
}

function aiButton(getArgs, onText) {
  if (!aiEnabled()) return null;
  return btn("✨ Mejorar con IA", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = "Pensando…";
    try { onText(await aiWrite(getArgs())); } catch (err) { toast(err.message); } finally { b.disabled = false; b.textContent = "✨ Mejorar con IA"; }
  }, "ghost");
}

// ───────── Escribir ─────────

function write(root, cid) {
  const { c, phone, el } = recipient(cid, "escribir");
  const suggested = c ? suggestTemplateId(c, lastContact(c.id)?.at) : "seguimiento";
  const msg = textarea({ rows: 6 }, fillTemplate(template(suggested).text, c ?? {}));
  let current = suggested;
  const chips = h("div", { class: "chips-scroll" });
  const drawChips = () => chips.replaceChildren(...state.settings.templates.map((t) =>
    h("button", { class: `chip-btn ${t.id === current ? "on" : ""}`, onclick: () => { current = t.id; msg.value = fillTemplate(t.text, c ?? {}); drawChips(); } }, `${t.id === suggested ? "★ " : ""}${t.title}`)));
  drawChips();
  const after = h("div");
  root.append(
    section("", el,
      c ? h("p", { class: "muted small" }, `Etapa: ${stageLabel(c.stage)} · ★ = sugerido para esta etapa`) : null,
      chips,
      field("Mensaje", msg),
      h("div", { class: "row wrap gap-s" },
        btn("Abrir en WhatsApp", () => {
          const t = target(c, phone);
          if (!t || !sendWhatsApp(t, msg.value.trim())) return;
          if (c) after.replaceChildren(section("¿Cuándo vuelves a contactarlo?", followUpPicker(c, () => toast("Seguimiento guardado"))));
        }, "wa"),
        aiButton(() => ({ draft: msg.value, customer: c ?? {}, goal: template(current)?.title }), (t) => { msg.value = t; }),
        !c ? btn("Guardar como cliente", () => {
          if (!waDigits(phone.value)) { toast("Escribe un celular válido."); return; }
          const created = addCustomer({ name: `Cliente ${phone.value.trim()}`, phone: phone.value.trim(), source: "whatsapp" });
          go(`/cliente/${created.id}/editar`);
        }, "ghost") : null)),
    after);
}

// ───────── Responder ─────────

function reply(root, cid) {
  const { c, phone, el } = recipient(cid, "responder");
  const incoming = textarea({ rows: 4, placeholder: "Pega aquí lo que te escribió el cliente" });
  const out = h("div", { class: "stack-s" });
  const analyze = () => {
    const text = incoming.value.trim();
    if (!text) { toast("Pega el mensaje del cliente."); return; }
    const intents = classifyMessage(text);
    let chosen = intents[0];
    const answer = textarea({ rows: 5 }, fillTemplate(chosen.reply, c ?? {}));
    const actionBox = h("div");
    const drawAction = () => {
      const a = chosen.action;
      actionBox.replaceChildren(c && a ? btn(`Siguiente paso: ${a.label}`, () => {
        if (a.stage) { updateCustomer(c.id, { stage: a.stage }); toast(`Etapa: ${stageLabel(a.stage)}`); }
        if (a.days) { setFollowUp(c.id, inDays(a.days)); toast(`Seguimiento ${fmtWhen(inDays(a.days).toISOString())}`); }
        if (a.hours) { setFollowUp(c.id, new Date(Date.now() + a.hours * 3600000)); toast(`Seguimiento en ${a.hours} horas`); }
        if (a.screen === "placas") go(`/cliente/${c.id}/placas`);
      }, "small ghost") : null);
    };
    drawAction();
    out.replaceChildren(
      h("p", { class: "muted small" }, "Tema detectado (por palabras clave, sin IA):"),
      h("div", { class: "chips-scroll" }, intents.map((it) => h("button", { class: `chip-btn ${it === chosen ? "on" : ""}`, onclick: (e) => {
        chosen = it;
        answer.value = fillTemplate(it.reply, c ?? {});
        e.currentTarget.parentElement.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("on"));
        e.currentTarget.classList.add("on");
        drawAction();
      } }, it.label))),
      field("Respuesta sugerida (edítala)", answer),
      h("div", { class: "row wrap gap-s" },
        btn("Abrir en WhatsApp", () => { const t = target(c, phone); if (t) sendWhatsApp(t, answer.value.trim()); }, "wa"),
        aiButton(() => ({ incoming: text, draft: answer.value, customer: c ?? {} }), (t) => { answer.value = t; }),
        actionBox));
  };
  root.append(section("", el, field("Mensaje del cliente", incoming), h("div", { class: "row" }, btn("Sugerir respuesta", analyze, "primary")), out));
}

// ───────── Pendientes ─────────

function pending(root) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const due = state.customers.filter((c) => c.nextFollowUp && new Date(c.nextFollowUp) <= end).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
  const orphan = state.customers.filter((c) => !c.nextFollowUp && !["perdido", "entregado"].includes(c.stage));
  const rowFor = (c) => {
    const tid = suggestTemplateId(c, lastContact(c.id)?.at);
    const text = fillTemplate(template(tid).text, c);
    return h("div", { class: "item col" },
      h("div", { class: "row between" }, h("div", {}, h("strong", {}, c.name), h("div", { class: "muted small" }, c.nextFollowUp ? `Seguimiento ${fmtWhen(c.nextFollowUp)}` : "Sin seguimiento programado")), stageChip(c.stage)),
      h("p", { class: "preview" }, text),
      h("div", { class: "row wrap gap-s" },
        btn("Enviar sugerido", () => { if (sendWhatsApp(c, text)) { setFollowUp(c.id, inDays(3)); toast("Próximo seguimiento en 3 días"); rerender(); } }, "small wa"),
        btn("Cambiar mensaje", () => go(`/whatsapp?tab=escribir&c=${c.id}`), "small ghost")));
  };
  root.append(
    section(`Para hoy (${due.length})`, due.length ? h("div", { class: "list" }, due.map(rowFor)) : empty("Nadie pendiente para hoy.")),
    orphan.length ? section(`Clientes sin seguimiento (${orphan.length})`, h("p", { class: "muted small" }, "Ningún cliente activo debería quedarse sin fecha de próximo contacto."), h("div", { class: "list" }, orphan.slice(0, 30).map(rowFor))) : null);
}

// ───────── Plantillas ─────────

function templates(root) {
  const list = state.settings.templates;
  root.append(
    section("Plantillas",
      h("p", { class: "muted small" }, "Variables: {nombre} {asesor} {agencia} {auto} {fecha} {estado_placas}"),
      h("div", { class: "stack" }, list.map((t) => {
        const title = input({ value: t.title, onchange: (e) => { t.title = e.target.value; save(); } });
        const text = textarea({ rows: 4, onchange: (e) => { t.text = e.target.value; save(); toast("Plantilla guardada"); } }, t.text);
        return h("div", { class: "tpl" }, title, text, h("div", { class: "row end" }, btn("Borrar", async () => {
          if (!(await confirmBox("Borrar plantilla", `¿Borrar "${t.title}"?`, "Borrar"))) return;
          state.settings.templates = list.filter((x) => x !== t);
          save();
          rerender();
        }, "small ghost")));
      })),
      h("div", { class: "row wrap gap-s" },
        btn("+ Nueva plantilla", () => { list.push({ id: uid(), title: "Nueva plantilla", text: "Hola {nombre}, " }); save(); rerender(); }),
        btn("Restaurar originales", async () => {
          if (!(await confirmBox("Restaurar plantillas", "Se reemplazan tus plantillas por las originales.", "Restaurar"))) return;
          state.settings.templates = DEFAULT_TEMPLATES.map((t) => ({ ...t }));
          save();
          rerender();
        }, "ghost"))));
}
