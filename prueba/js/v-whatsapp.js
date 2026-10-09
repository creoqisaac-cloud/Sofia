// WhatsApp: bandeja REAL (WhatsApp Business + Messenger vía el conector) con borradores de IA en el
// estilo del asesor, y el asistente sin IA (plantillas, respuestas por tema, pendientes) que abre wa.me.
import { h, toast, inDays, fmtWhen, uid, waDigits, confirmBox } from "./util.js";
import { state, customer, save, lastContact, updateCustomer, setFollowUp, DEFAULT_TEMPLATES, addCustomer, stageLabel, log, learnFromAdvisor } from "./store.js";
import { header, section, empty, btn, go, rerender, query, route, field, input, textarea, customerSelect, sendWhatsApp, followUpPicker, stageChip, chip, select } from "./ui.js";
import { fillTemplate, suggestTemplateId, template, classifyMessage } from "./rules.js";
import { aiReady, draftMessage, personalizeTemplates, extractLead } from "./ai.js";
import { connectorReady, inbox, conversation, sendMessage, waTemplates, downloadMedia, windowOpen, phoneKey, lastStatus } from "./connector.js";
import { applyIneImage, ensureCredit } from "./v-credit.js";

const TABS = [["bandeja", "Bandeja"], ["escribir", "Escribir"], ["responder", "Responder"], ["pendientes", "Pendientes"], ["plantillas", "Plantillas"]];
let poll = null;
const mediaCache = new Map(); // fotos ya descargadas (id de WhatsApp → Blob)
const stopPoll = () => { clearInterval(poll); poll = null; };
const pollWhile = (path, fn, ms = 15000) => { stopPoll(); poll = setInterval(() => { if (route() === path && document.visibilityState === "visible") fn(); else if (route() !== path) stopPoll(); }, ms); };

export function renderWhatsApp(root) {
  stopPoll();
  const q = query();
  const cid = q.get("c") ?? "";
  const tab = q.get("tab") ?? (cid ? "escribir" : connectorReady() ? "bandeja" : "pendientes");
  const body = h("div", { class: "page" },
    h("div", { class: "tabs", role: "tablist" }, TABS.map(([id, label]) => h("button", { role: "tab", "aria-selected": String(tab === id), class: tab === id ? "on" : "", onclick: () => go(`/whatsapp?tab=${id}${cid ? `&c=${cid}` : ""}`) }, label))));
  root.append(header("WhatsApp", { back: cid ? `/cliente/${cid}` : undefined }), body);
  ({ bandeja: inboxTab, escribir: write, responder: reply, pendientes: pending, plantillas: templates }[tab] ?? pending)(body, cid);
}

// ───────── Historial para la IA ─────────

function historyFor(c) {
  if (!c) return [];
  const imported = (c.chat ?? []).map((m) => ({ dir: m.dir, text: m.text, at: m.at }));
  const sent = state.activity.filter((a) => a.customerId === c.id && a.type === "whatsapp").map((a) => ({ dir: "out", text: a.text, at: a.at }));
  return [...imported, ...sent].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-30);
}

const customerByPeer = (channel, id) => (channel === "wa" ? state.customers.find((c) => c.phone && phoneKey(c.phone) === phoneKey(id)) : state.customers.find((c) => c.fbId === id));

// ───────── Bandeja (conector) ─────────

function inboxTab(root) {
  if (!connectorReady()) {
    root.append(section("Bandeja de WhatsApp y Messenger",
      h("p", {}, "Conecta tu WhatsApp Business (y tu página de Facebook) para recibir y contestar aquí, con borradores de IA en tu estilo."),
      h("p", { class: "muted small" }, "Mientras tanto usa «Escribir», «Responder» y «Pendientes»: abren WhatsApp con el mensaje listo."),
      btn("Conectar WhatsApp", () => go("/conexiones"), "primary")));
    return;
  }
  const list = h("div", { class: "list" }, h("p", { class: "muted" }, "Cargando conversaciones…"));
  root.append(section("Conversaciones", list));
  const draw = async () => {
    try {
      const conv = Object.entries(await inbox()).map(([key, c]) => ({ key, ...c })).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
      if (!conv.length) { list.replaceChildren(empty(lastStatus()?.whatsapp?.ok ? "Aún no llegan mensajes. Cuando un cliente te escriba aparecerá aquí." : "El conector responde, pero WhatsApp aún no está configurado en él (ver Conexiones).")); return; }
      list.replaceChildren(...conv.map((cv) => {
        const c = customerByPeer(cv.channel, cv.id);
        const unread = cv.lastDir === "in" && (!state.waSeen[cv.key] || state.waSeen[cv.key] < cv.lastAt);
        return h("button", { class: `item ${unread ? "late" : ""}`, onclick: () => go(`/whatsapp/chat/${encodeURIComponent(cv.key)}`) },
          h("div", { class: "grow" },
            h("strong", {}, c?.name ?? (cv.name || (cv.channel === "wa" ? `+${cv.id}` : "Cliente de Messenger"))),
            h("div", { class: "muted small" }, `${cv.lastDir === "out" ? "Tú: " : ""}${(cv.lastText ?? "").slice(0, 90)}`)),
          h("div", { class: "stack-s", style: "align-items:flex-end" }, chip(cv.channel === "wa" ? "WhatsApp" : "Messenger", unread ? "ok" : ""), h("span", { class: "muted small" }, fmtWhen(cv.lastAt))));
      }));
    } catch (e) { list.replaceChildren(h("p", { class: "warn" }, e.message)); }
  };
  draw();
  pollWhile(route(), draw);
}

// ───────── Conversación ─────────

export function renderChat(root, key) {
  stopPoll();
  const [channel, id] = key.split(":");
  let c = customerByPeer(channel, id);
  let msgs = [];
  let meta = null;
  const list = h("div", { class: "chat" }, h("p", { class: "muted" }, "Cargando…"));
  const status = h("p", { class: "muted small", role: "status" });
  const box = textarea({ rows: 3, placeholder: "Escribe tu respuesta…" });
  const chips = h("div", { class: "chips-scroll" });
  const actions = h("div", { class: "row wrap gap-s" });
  const tplBox = h("div");
  let aiDraft = "";
  let drafted = "";

  const title = () => c?.name ?? (meta?.name || (channel === "wa" ? `+${id}` : "Cliente de Messenger"));
  const open = () => channel !== "wa" || windowOpen(meta?.lastInAt);

  function drawMessages() {
    list.replaceChildren(...msgs.map((m) => h("div", { class: `bubble ${m.dir}` },
      m.media ? mediaView(m) : null,
      m.text ? h("div", { class: "pre" }, m.text) : null,
      h("div", { class: "muted small" }, `${fmtWhen(m.at)}${m.dir === "out" && m.status ? ` · ${{ sent: "enviado", delivered: "entregado", read: "leído ✓✓", failed: "falló" }[m.status] ?? m.status}` : ""}`))));
    list.scrollTop = list.scrollHeight;
  }

  function mediaView(m) {
    const wrap = h("div", { class: "stack-s" });
    const showPhoto = (blob) => wrap.replaceChildren(
      h("img", { src: URL.createObjectURL(blob), alt: "Foto del cliente", class: "chat-img" }),
      h("div", { class: "row wrap gap-s" },
        btn("Usar como INE (frente)", () => toIne(blob, "front"), "small"),
        btn("Usar como INE (reverso)", () => toIne(blob, "back"), "small ghost")));
    if (m.media.url) wrap.append(h("img", { src: m.media.url, alt: "Imagen del cliente", class: "chat-img" }));
    else if (m.media.id && mediaCache.has(m.media.id) && m.type === "image") showPhoto(mediaCache.get(m.media.id));
    else if (m.media.id) {
      wrap.append(btn(m.type === "image" ? "Ver foto" : `Descargar ${m.type}`, async (e) => {
        e.currentTarget.disabled = true;
        try {
          const blob = await downloadMedia(m.media.id);
          mediaCache.set(m.media.id, blob); // se queda visible aunque la conversación se actualice
          if (m.type === "image") showPhoto(blob);
          else window.open(URL.createObjectURL(blob), "_blank");
        } catch (err) { toast(err.message, 5000); }
      }, "small"));
    }
    return wrap;
  }

  async function toIne(blob, which) {
    c = c ?? createCustomer();
    ensureCredit(c);
    status.textContent = "Leyendo la INE…";
    try { await applyIneImage(c, which, blob, status); go(`/cliente/${c.id}/credito`); } catch (e) { status.textContent = e.message; }
  }

  function createCustomer(info = null) {
    const created = addCustomer({ name: info?.nombre || meta?.name || title(), phone: channel === "wa" ? id.slice(-10) : "", fbId: channel === "fb" ? id : undefined, source: channel === "wa" ? "whatsapp" : "redes", stage: info?.etapa ?? "nuevo", vehicle: info?.auto_interes ?? "", notes: info?.resumen ?? "", chat: msgs.slice(-80).map((m) => ({ dir: m.dir, text: m.text, at: m.at })) });
    if (info?.dias_para_seguimiento > 0) setFollowUp(created.id, inDays(info.dias_para_seguimiento), info.siguiente_paso || "Dar seguimiento");
    return created;
  }

  function suggestions() {
    const lastIn = [...msgs].reverse().find((m) => m.dir === "in" && m.text);
    const items = [];
    if (lastIn) for (const it of classifyMessage(lastIn.text).slice(0, 3)) items.push([it.label, fillTemplate(it.reply, c ?? { name: meta?.name })]);
    const tid = c ? suggestTemplateId(c, lastContact(c.id)?.at) : "seguimiento";
    const t = template(tid);
    if (t) items.push([t.title, c?.aiTemplates?.items?.[tid] ?? fillTemplate(t.text, c ?? { name: meta?.name })]);
    chips.replaceChildren(...items.map(([label, text]) => h("button", { class: "chip-btn", onclick: () => { box.value = text; drafted = text; } }, label)));
  }

  async function aiSuggest(auto = false) {
    if (!aiReady()) return;
    const lastIn = [...msgs].reverse().find((m) => m.dir === "in");
    if (auto && (!lastIn || msgs.at(-1)?.dir !== "in" || box.value.trim())) return;
    status.textContent = "La IA está escribiendo una respuesta en tu estilo…";
    try {
      aiDraft = await draftMessage({ customer: c ?? { name: meta?.name }, history: msgs.map((m) => ({ dir: m.dir, text: m.text })), incoming: lastIn?.text ?? "" });
      if (!box.value.trim() || !auto) { box.value = aiDraft; drafted = aiDraft; }
      status.textContent = "Borrador listo: revísalo y envía.";
    } catch (e) { status.textContent = e.message; }
  }

  async function send() {
    const text = box.value.trim();
    if (!text) { toast("Escribe el mensaje."); return; }
    if (!open()) { toast("Pasaron más de 24 h desde su último mensaje: WhatsApp solo permite plantillas aprobadas."); return; }
    try {
      await sendMessage({ channel, to: id, text });
      if (text !== drafted && text !== aiDraft) learnFromAdvisor([text], "enviado");
      if (c) log(c.id, "whatsapp", text);
      save();
      box.value = "";
      drafted = "";
      await load();
      toast("Enviado");
    } catch (e) { toast(e.message, 6000); }
  }

  async function templatePicker() {
    try {
      const list2 = await waTemplates();
      if (!list2.length) { tplBox.replaceChildren(h("p", { class: "muted small" }, "No hay plantillas aprobadas en tu cuenta de WhatsApp. Créalas en el Administrador de WhatsApp de Meta.")); return; }
      const sel = select(list2.map((t, i) => [String(i), `${t.name} (${t.language})`]), "0");
      const params = h("div", { class: "stack-s" });
      const drawParams = () => {
        const t = list2[Number(sel.value)];
        const bodyText = t.components?.find((x) => x.type === "BODY")?.text ?? "";
        const n = new Set(bodyText.match(/\{\{\d+\}\}/g) ?? []).size;
        params.replaceChildren(h("p", { class: "preview" }, bodyText), ...Array.from({ length: n }, (_, i) => input({ placeholder: `Valor {{${i + 1}}}`, value: i === 0 ? (c?.name ?? meta?.name ?? "").split(" ")[0] : "", "data-p": "1" })));
      };
      sel.addEventListener("change", drawParams);
      drawParams();
      tplBox.replaceChildren(section("Enviar plantilla aprobada", sel, params, btn("Enviar plantilla", async () => {
        const t = list2[Number(sel.value)];
        const values = [...params.querySelectorAll("input[data-p]")].map((x) => x.value);
        let preview = t.components?.find((x) => x.type === "BODY")?.text ?? t.name;
        values.forEach((v, i) => { preview = preview.replaceAll(`{{${i + 1}}}`, v); });
        try { await sendMessage({ channel: "wa", to: id, template: { name: t.name, lang: t.language, params: values, preview } }); toast("Plantilla enviada"); tplBox.replaceChildren(); await load(); } catch (e) { toast(e.message, 6000); }
      }, "primary")));
    } catch (e) { toast(e.message, 5000); }
  }

  function drawActions() {
    actions.replaceChildren(
      open() ? btn("Enviar", send, "wa") : btn("Enviar plantilla (fuera de 24 h)", templatePicker, "wa"),
      aiReady() ? btn("✨ Sugerir con IA", () => aiSuggest(false), "ghost") : null,
      c ? btn("Ficha del cliente", () => go(`/cliente/${c.id}`), "ghost") : btn(aiReady() ? "✨ Crear cliente con IA" : "Crear cliente", async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        let info = null;
        if (aiReady()) {
          b.textContent = "Leyendo la conversación…";
          info = await extractLead(msgs.map((m) => `${m.dir === "out" ? "Asesor" : "Cliente"}: ${m.text}`).join("\n"), { name: meta?.name }).catch((err) => { toast(err.message, 5000); return null; });
        }
        c = createCustomer(info);
        save();
        toast(`${c.name} agregado a clientes`);
        rerender();
      }, "ghost"));
  }

  async function load() {
    try {
      msgs = await conversation(key);
      meta = (await inbox())[key] ?? meta;
      state.waSeen[key] = meta?.lastAt ?? new Date().toISOString();
      const h1 = root.querySelector("header.top h1");
      if (h1) h1.textContent = title(); // el nombre del perfil llega con la bandeja
      drawMessages();
      suggestions();
      drawActions();
      if (!open()) status.textContent = "Han pasado más de 24 h desde su último mensaje: Meta solo permite plantillas aprobadas hasta que el cliente vuelva a escribir.";
    } catch (e) { list.replaceChildren(h("p", { class: "warn" }, e.message)); }
  }

  root.append(
    header(title(), { back: "/whatsapp?tab=bandeja", actions: [c ? stageChip(c.stage) : chip(channel === "wa" ? "WhatsApp" : "Messenger")] }),
    h("div", { class: "page" }, list, section("", chips, box, actions, status), tplBox));
  load().then(() => aiSuggest(true));
  pollWhile(route(), async () => { const before = msgs.length; await load(); if (msgs.length > before) aiSuggest(true); });
}

// ───────── Escribir (abre WhatsApp o envía por la API) ─────────

const changeCustomer = (tab) => (id) => go(`/whatsapp?tab=${tab}${id ? `&c=${id}` : ""}`);

function recipient(cid, tab) {
  const c = cid ? customer(cid) : null;
  const phone = input({ type: "tel", inputmode: "tel", placeholder: "81 1234 5678", value: c?.phone ?? "" });
  return { c, phone, el: h("div", { class: "grid2" }, field("Cliente", customerSelect(cid, changeCustomer(tab))), field("Celular", phone)) };
}

function target(c, phoneInput) {
  const phone = phoneInput.value.trim();
  if (c) {
    if (phone && phone !== c.phone) updateCustomer(c.id, { phone }, { silent: true });
    return c;
  }
  if (!waDigits(phone)) { toast("Escribe un celular válido (10 dígitos)."); return null; }
  return { phone, name: "" };
}

function aiButton(label, run, onText) {
  if (!aiReady()) return null;
  return btn(label, async (e) => {
    const b = e.currentTarget;
    const old = b.textContent;
    b.disabled = true;
    b.textContent = "Pensando…";
    try { onText(await run()); } catch (err) { toast(err.message, 6000); } finally { b.disabled = false; b.textContent = old; }
  }, "ghost");
}

function write(root, cid) {
  const { c, phone, el } = recipient(cid, "escribir");
  const suggested = c ? suggestTemplateId(c, lastContact(c.id)?.at) : "seguimiento";
  const personal = c?.aiTemplates?.items ?? {};
  const textFor = (t) => personal[t.id] ?? fillTemplate(t.text, c ?? {});
  let current = suggested;
  let generated = textFor(template(suggested));
  const msg = textarea({ rows: 6 }, generated);
  const chips = h("div", { class: "chips-scroll" });
  const drawChips = () => chips.replaceChildren(...state.settings.templates.map((t) =>
    h("button", { class: `chip-btn ${t.id === current ? "on" : ""}`, onclick: () => { current = t.id; generated = textFor(t); msg.value = generated; drawChips(); } }, `${personal[t.id] ? "✨ " : t.id === suggested ? "★ " : ""}${t.title}`)));
  drawChips();
  const after = h("div");
  const viaApi = connectorReady() && lastStatus()?.whatsapp?.ok;
  root.append(
    section("", el,
      c ? h("p", { class: "muted small" }, `Etapa: ${stageLabel(c.stage)} · ★ sugerida para esta etapa${Object.keys(personal).length ? ` · ✨ personalizadas ${fmtWhen(c.aiTemplates.at)}` : ""}`) : null,
      chips,
      field("Mensaje", msg),
      h("div", { class: "row wrap gap-s" },
        btn("Abrir en WhatsApp", () => {
          const t = target(c, phone);
          if (!t || !sendWhatsApp(t, msg.value.trim(), { learn: msg.value.trim() !== generated })) return;
          if (c) after.replaceChildren(section("¿Cuándo vuelves a contactarlo?", followUpPicker(c, () => toast("Seguimiento guardado"))));
        }, "wa"),
        viaApi && c ? btn("Enviar desde Sofía (API)", async () => {
          const to = waDigits(phone.value);
          if (!to) { toast("Celular inválido"); return; }
          try {
            await sendMessage({ channel: "wa", to, text: msg.value.trim() });
            if (msg.value.trim() !== generated) learnFromAdvisor([msg.value.trim()], "enviado");
            log(c.id, "whatsapp", msg.value.trim());
            save();
            toast("Enviado por WhatsApp Business");
            after.replaceChildren(section("¿Cuándo vuelves a contactarlo?", followUpPicker(c, () => toast("Seguimiento guardado"))));
          } catch (e) { toast(`${e.message} — si no te ha escrito en 24 h, usa una plantilla desde la Bandeja o «Abrir en WhatsApp».`, 7000); }
        }, "ghost") : null,
        c ? aiButton("✨ Mensaje ideal ahora", () => draftMessage({ customer: c, history: historyFor(c), goal: template(current)?.title }), (t) => { generated = t; msg.value = t; }) : null,
        c ? aiButton(`✨ Plantillas para ${c.name.split(" ")[0]}`, async () => {
          const items = await personalizeTemplates(c, state.settings.templates, historyFor(c));
          c.aiTemplates = { at: new Date().toISOString(), items };
          save();
          return items[current] ?? msg.value;
        }, () => { toast("Plantillas personalizadas para este cliente"); rerender(); }) : null,
        !c ? btn("Guardar como cliente", () => {
          if (!waDigits(phone.value)) { toast("Escribe un celular válido."); return; }
          const created = addCustomer({ name: `Cliente ${phone.value.trim()}`, phone: phone.value.trim(), source: "whatsapp" });
          go(`/cliente/${created.id}/editar`);
        }, "ghost") : null)),
    after);
}

// ───────── Responder (mensaje pegado) ─────────

function reply(root, cid) {
  const { c, phone, el } = recipient(cid, "responder");
  const incoming = textarea({ rows: 4, placeholder: "Pega aquí lo que te escribió el cliente" });
  const out = h("div", { class: "stack-s" });
  const analyze = () => {
    const text = incoming.value.trim();
    if (!text) { toast("Pega el mensaje del cliente."); return; }
    const intents = classifyMessage(text);
    let chosen = intents[0];
    let generated = fillTemplate(chosen.reply, c ?? {});
    const answer = textarea({ rows: 5 }, generated);
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
    const aiBtn = aiButton("✨ Responder con IA", () => draftMessage({ customer: c ?? {}, history: historyFor(c), incoming: text }), (t) => { generated = t; answer.value = t; });
    out.replaceChildren(
      h("p", { class: "muted small" }, "Tema detectado (por palabras clave, sin IA):"),
      h("div", { class: "chips-scroll" }, intents.map((it) => h("button", { class: `chip-btn ${it === chosen ? "on" : ""}`, onclick: (e) => {
        chosen = it;
        generated = fillTemplate(it.reply, c ?? {});
        answer.value = generated;
        e.currentTarget.parentElement.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("on"));
        e.currentTarget.classList.add("on");
        drawAction();
      } }, it.label))),
      field("Respuesta sugerida (edítala)", answer),
      h("div", { class: "row wrap gap-s" },
        btn("Abrir en WhatsApp", () => { const t = target(c, phone); if (t) sendWhatsApp(t, answer.value.trim(), { learn: answer.value.trim() !== generated }); }, "wa"),
        aiBtn,
        actionBox));
    aiBtn?.click(); // con IA, el borrador en tu estilo sale solo
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
    const text = c.aiTemplates?.items?.[tid] ?? fillTemplate(template(tid).text, c);
    return h("div", { class: "item col" },
      h("div", { class: "row between" }, h("div", {}, h("strong", {}, c.name), h("div", { class: "muted small" }, c.nextFollowUp ? `Seguimiento ${fmtWhen(c.nextFollowUp)}` : "Sin seguimiento programado")), stageChip(c.stage)),
      h("p", { class: "preview" }, text),
      h("div", { class: "row wrap gap-s" },
        btn("Enviar sugerido", () => { if (sendWhatsApp(c, text, { learn: false })) { setFollowUp(c.id, inDays(3)); toast("Próximo seguimiento en 3 días"); rerender(); } }, "small wa"),
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
      h("p", { class: "muted small" }, "Variables: {nombre} {asesor} {agencia} {auto} {fecha} {estado_placas}. Con IA, cada cliente recibe su versión personalizada en tu estilo (botón ✨ en «Escribir»)."),
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
