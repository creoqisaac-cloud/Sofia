// WhatsApp: bandeja REAL (WhatsApp Business + Messenger vía el conector) con borradores de IA en el
// estilo del asesor, y el asistente sin IA (plantillas, respuestas por tema, pendientes) que abre wa.me.
import { h, toast, inDays, fmtWhen, uid, waDigits, confirmBox, download, money } from "./util.js";
import { state, customer, save, lastContact, updateCustomer, setFollowUp, DEFAULT_TEMPLATES, addCustomer, stageLabel, log, learnFromAdvisor } from "./store.js";
import { header, section, empty, btn, go, rerender, query, route, field, input, textarea, customerSelect, sendWhatsApp, followUpPicker, stageChip, chip, select } from "./ui.js";
import { fillTemplate, suggestTemplateId, template, classifyMessage } from "./rules.js";
import { aiReady, draftMessage, personalizeTemplates, extractLead } from "./ai.js";
import { connectorReady, inbox, conversation, sendMessage, waTemplates, downloadMedia, windowOpen, phoneKey, lastStatus, refreshStatus, getAgentConfig, setAgentConfig, listLeads, markLeads } from "./connector.js";
import { applyIneImage, ensureCredit } from "./v-credit.js";
import { waFormat } from "./v-inventory.js";
import { asesorCon } from "./vendedor.js";

const TABS = [["bandeja", "Bandeja"], ["auto", "Automático"], ["escribir", "Escribir"], ["responder", "Responder"], ["pendientes", "Pendientes"], ["plantillas", "Plantillas"]];
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
  ({ bandeja: inboxTab, auto: autoTab, escribir: write, responder: reply, pendientes: pending, plantillas: templates }[tab] ?? pending)(body, cid);
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
      m.auto ? h("div", { class: "muted small" }, "⚙ Respuesta automática de Sofía") : null,
      m.text ? h("div", { class: "pre" }, ...waFormat(m.text)) : null,
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
          // Nunca abrirlo aquí: un .html o .svg de un desconocido correría con acceso a los datos de la app.
          else download(new Blob([blob], { type: "application/octet-stream" }), m.media.filename || `archivo-${m.media.id}`);
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
    markLeads([key]).then(() => refreshStatus()).catch(() => {}); // ya no es prospecto nuevo
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

// ───────── Automático: agente SIN IA que contesta solo (en el servidor) + prospectos ─────────

const DIAS = [[1, "L"], [2, "M"], [3, "M"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
const ZONAS = [["America/Monterrey", "Monterrey / Centro"], ["America/Mexico_City", "Ciudad de México"], ["America/Chihuahua", "Chihuahua"], ["America/Mazatlan", "Mazatlán / Pacífico"], ["America/Tijuana", "Tijuana"], ["America/Cancun", "Cancún"]];

function autoTab(root) {
  const disponibles = state.inventory.filter((a) => a.disponible !== false).length;
  const vendedora = section("Sofía vendedora",
    h("p", {}, "Contesta en segundos, a cualquier hora y en nombre del asesor: ofrece la corrida, pregunta el enganche, agenda la cita y le pasa el cliente con todo su contexto. Todo queda anotado en Prospectos."),
    h("div", { class: "row wrap gap-s" },
      btn(`Inventario (${disponibles} auto${disponibles === 1 ? "" : "s"})`, () => go("/inventario"), disponibles ? "" : "primary"),
      btn("Probar a Sofía", () => go("/probar"), disponibles ? "primary" : "")));
  if (!connectorReady()) {
    vendedora.append(h("p", { class: "muted small" }, "Para que conteste en tu WhatsApp de verdad (aunque la app esté cerrada), conecta tu servidor gratis."), btn("Conectar WhatsApp", () => go("/conexiones"), "ghost"));
    root.append(vendedora);
    return;
  }
  const leadsBox = h("div", { class: "list" }, h("p", { class: "muted" }, "Cargando prospectos…"));
  const form = h("div", { class: "stack-s" }, h("p", { class: "muted" }, "Cargando configuración…"));
  const corridas = h("div", { class: "stack-s" }, h("p", { class: "muted" }, "Cargando…"));
  root.append(section("Prospectos nuevos", h("p", { class: "muted small" }, "Quien te escribió y lo que Sofía le anotó. 🔥 = pidió cita o hablar contigo."), leadsBox),
    vendedora,
    section("Corridas", corridas),
    section("Configuración del asistente", form));
  drawLeads(leadsBox);
  getAgentConfig().then((cfg) => { drawCorridas(corridas, cfg); drawAgentForm(form, cfg); })
    .catch((e) => { form.replaceChildren(h("p", { class: "warn" }, e.message)); corridas.replaceChildren(); });
}

const caliente = (l) => Boolean(l.cita || l.quiereAsesor);

/** Las corridas del asesor, pegadas tal cual: con IA son las únicas cifras de crédito que da Sofía. */
function drawCorridas(box, cfg) {
  const de = asesorCon(cfg.asesor || "el asesor", "de");
  const texto = textarea({ rows: 8, "aria-label": "Corridas", placeholder: "Por ejemplo:\nCivic Touring 2026 · precio $000,000\n20% de enganche ($00,000): 48 meses $0,000 · 60 meses $0,000\n30% de enganche ($00,000): 48 meses $0,000 · 60 meses $0,000\n40%… 50%…\n\nCR-V Turbo 2026 · …" }, cfg.corridas ?? "");
  box.replaceChildren(
    h("p", { class: "muted small" }, `Pega aquí las corridas ${de} (modelo, versión, enganche de 20, 30, 40 o 50%, plazo y mensualidad), como texto. Sofía da solo estas cifras y tal cual; si el cliente pregunta por un modelo que no está aquí, no da números y le pasa la corrida al asesor.`),
    texto,
    h("div", { class: "row" }, btn("Guardar corridas", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        await setAgentConfig({ corridas: texto.value });
        toast(texto.value.trim() ? "Corridas guardadas: Sofía ya las usa." : "Corridas borradas: Sofía no da cifras.", 5000);
      } catch (err) { toast(err.message, 6000); }
      b.disabled = false;
    }, "primary")));
}

/** Lo que Sofía le anotó al prospecto, en renglones cortos. */
function leadLines(l) {
  return [
    l.interes && `Interés: ${l.interes}${l.precio ? ` (${money(l.precio)})` : ""}`,
    l.formaPago === "credito" ? `Crédito${l.enganche ? ` · enganche ${money(l.enganche)}` : l.enganchePct ? ` · enganche ${l.enganchePct}%` : ""}${l.mensualidad ? ` · ~${money(l.mensualidad)} a ${l.plazo} meses` : ""}` : l.formaPago === "contado" ? "De contado" : "",
    l.cita && `Cita: ${l.cita}`,
    l.resumen && `Resumen de Sofía: ${l.resumen}`,
    l.pideBorrar ? "⚠️ Pidió BORRAR SUS DATOS (aviso de privacidad: confírmalo y bórralo en máximo 15 días hábiles)" : l.quiereAsesor && "Pidió hablar contigo",
    l.noPromociones && "No quiere promociones",
  ].filter(Boolean);
}

/** Convierte (o actualiza) al cliente con lo que Sofía anotó y deja el siguiente paso en recordatorios. */
function leadToCustomer(l) {
  const existing = l.canal === "wa" ? state.customers.find((c) => c.phone && phoneKey(c.phone) === phoneKey(l.id)) : state.customers.find((c) => c.fbId === l.id);
  const resumen = leadLines(l).join(" · ");
  const etapa = l.formaPago === "credito" && l.enganche ? "cotizacion" : l.cita ? "seguimiento" : "nuevo";
  const c = existing ?? addCustomer({
    name: l.nombre || (l.canal === "wa" ? `Cliente ${l.id.slice(-10)}` : "Cliente de Messenger"), phone: l.canal === "wa" ? l.id.slice(-10) : "",
    fbId: l.canal === "fb" ? l.id : undefined, source: l.canal === "wa" ? "whatsapp" : "redes", vehicle: l.interes ?? "", stage: etapa,
    notes: [l.primerMensaje && `Primer mensaje: ${l.primerMensaje}`, resumen && `Sofía anotó: ${resumen}`].filter(Boolean).join("\n"),
  });
  if (existing) {
    if (l.interes && !existing.vehicle) existing.vehicle = l.interes;
    if (resumen) log(existing.id, "whatsapp", `Sofía anotó: ${resumen}`);
  }
  const pendiente = l.cita ? `Confirmar visita: ${l.cita}` : l.quiereAsesor ? "Escribirle: pidió hablar contigo" : existing ? null : "Contestar al prospecto";
  if (pendiente) setFollowUp(c.id, inDays(0, new Date().getHours() + 1), pendiente);
  else save();
  return { c, existing };
}

async function drawLeads(box) {
  try {
    const leads = (await listLeads()).filter((l) => !l.importado).sort((a, b) => Number(caliente(b)) - Number(caliente(a)));
    if (!leads.length) { box.replaceChildren(empty("Sin prospectos nuevos.")); return; }
    box.replaceChildren(...leads.slice(0, 50).map((l) => h("div", { class: `item col ${caliente(l) ? "late" : ""}` },
      h("div", { class: "row between" }, h("strong", {}, `${caliente(l) ? "🔥 " : ""}${l.nombre || (l.canal === "wa" ? `+${l.id}` : "Contacto de Messenger")}`), chip(l.canal === "wa" ? "WhatsApp" : "Messenger")),
      ...leadLines(l).map((t) => h("div", { class: "small" }, t)),
      l.primerMensaje ? h("p", { class: "preview" }, l.primerMensaje) : null,
      h("p", { class: "muted small" }, fmtWhen(l.actualizado ?? l.at)),
      h("div", { class: "row wrap gap-s" },
        btn("Agregar como cliente", async (e) => {
          e.currentTarget.disabled = true;
          const { c, existing } = leadToCustomer(l);
          await markLeads([l.clave]).catch(() => {});
          toast(existing ? `${c.name} actualizado con lo que anotó Sofía` : `${c.name} agregado a clientes`);
          refreshStatus().catch(() => {});
          drawLeads(box); // solo la lista: no tirar cambios sin guardar del formulario de abajo
        }, "small primary"),
        btn("Ver conversación", () => go(`/whatsapp/chat/${encodeURIComponent(l.clave)}`), "small ghost"),
        btn("Descartar", async () => { await markLeads([l.clave]).catch(() => {}); refreshStatus().catch(() => {}); drawLeads(box); }, "small ghost")))));
  } catch (e) { box.replaceChildren(h("p", { class: "warn" }, e.message)); }
}

function drawAgentForm(box, cfg) {
  const st = lastStatus()?.agente;
  const activo = h("input", { type: "checkbox", checked: cfg.activo });
  const dias = new Set(cfg.horario.dias);
  const diasBox = h("div", { class: "chips-scroll" });
  const drawDias = () => diasBox.replaceChildren(...DIAS.map(([d, l]) => h("button", { type: "button", class: `chip-btn ${dias.has(d) ? "on" : ""}`, "aria-pressed": String(dias.has(d)), onclick: () => { if (dias.has(d)) dias.delete(d); else dias.add(d); drawDias(); } }, l)));
  drawDias();
  const inicio = input({ type: "time", value: cfg.horario.inicio });
  const fin = input({ type: "time", value: cfg.horario.fin });
  const zona = select(ZONAS.some((z) => z[0] === cfg.zonaHoraria) ? ZONAS : [...ZONAS, [cfg.zonaHoraria, cfg.zonaHoraria]], cfg.zonaHoraria);
  const asesor = input({ value: cfg.asesor || state.settings.advisorName || "" });
  const agencia = input({ value: cfg.agencia || state.settings.agency || "" });
  const bienvenida = textarea({ rows: 3 }, cfg.bienvenida);
  const fuera = textarea({ rows: 3 }, cfg.fueraDeHorario);
  const espera = input({ type: "number", min: "1", max: "720", value: cfg.esperaHoras });
  const pausa = input({ type: "number", min: "0", max: "1440", value: cfg.pausaMinutos });
  const reglas = cfg.reglas.map((r) => ({ palabras: r.palabras.join(", "), respuesta: r.respuesta }));
  if (!reglas.length) reglas.push(
    { palabras: "precio, cuánto, cuanto cuesta, costo", respuesta: "Con gusto te paso el precio, {nombre}. ¿Qué versión te interesa y lo buscas de contado o a crédito?" },
    { palabras: "crédito, credito, financiamiento, mensualidad, enganche", respuesta: "¡Claro! Manejamos crédito. Para darte una mensualidad aproximada, ¿cuánto te gustaría dar de enganche y a cuántos meses?" },
    { palabras: "ubicación, ubicacion, dirección, direccion, dónde están, donde estan", respuesta: `${agencia.value.trim() ? "Estamos en {agencia}. " : ""}Te comparto la ubicación y con gusto te espero; ¿qué día te acomoda?` });
  const v = cfg.ventas ?? {};
  const ventas = h("input", { type: "checkbox", checked: v.activo !== false });
  const presentacion = textarea({ rows: 2, placeholder: "¡Hola {nombre}! 👋 Te escribo de parte del {asesor}, de {agencia}." }, v.presentacion ?? "");
  const tasa = input({ type: "number", min: "0", max: "80", step: "0.1", value: v.tasaAnual ?? 15.9 });
  const enganche = input({ type: "number", min: "0", max: "90", value: v.engancheMinimo ?? 20 });
  const plazos = input({ value: (v.plazos ?? [24, 36, 48, 60]).join(", "), inputmode: "numeric" });
  const conAsesor = input({ type: "number", min: "0", max: "168", value: v.horasConAsesor ?? 12 });
  const conIa = h("input", { type: "checkbox", checked: Boolean(v.ia) });
  const iaSt = st?.ventas?.ia;
  const soloReglas = h("div", { class: "stack-s" }); // bienvenida y fuera de horario: solo sin la vendedora
  const verModo = () => { soloReglas.hidden = ventas.checked; };
  ventas.onchange = verModo;
  const reglasBox = h("div", { class: "stack-s" });
  const drawReglas = () => reglasBox.replaceChildren(...reglas.map((r, i) => h("div", { class: "tpl" },
    field(`Regla ${i + 1}: si el mensaje dice…`, input({ value: r.palabras, placeholder: "palabras separadas por coma", oninput: (e) => { r.palabras = e.target.value; } })),
    field("…Sofía contesta", textarea({ rows: 2, oninput: (e) => { r.respuesta = e.target.value; } }, r.respuesta)),
    h("div", { class: "row end" }, btn("Quitar regla", () => { reglas.splice(i, 1); drawReglas(); }, "small ghost")))),
    btn("+ Agregar regla", () => { reglas.push({ palabras: "", respuesta: "" }); drawReglas(); }, "small"));
  drawReglas();
  soloReglas.append(field("Bienvenida (primer mensaje de un contacto nuevo)", bienvenida), field("Fuera de horario", fuera));
  verModo();
  box.replaceChildren(
    st ? h("p", { class: st.ultimoError ? "warn small" : "muted small" }, `${st.activo ? "Activo" : "Apagado"} · ahora ${st.enHorario ? "en horario" : "fuera de horario"}${st.ultimoError ? ` · último error: ${st.ultimoError.error}` : ""}`) : null,
    h("label", { class: "row gap-s" }, activo, h("span", {}, "Contestar automáticamente")),
    h("p", { class: "muted small" }, "Variables: {nombre} (del perfil del cliente), {asesor}, {agencia}. Nunca se contesta a sí misma y se calla si tú acabas de escribir."),
    h("div", { class: "grid2" }, field("Asesor", asesor), field("Agencia", agencia)),
    // div y no <label>: un toque en el título o entre los chips activaría el botón "L" (lunes).
    h("div", { class: "field" }, h("span", {}, "Días de atención"), diasBox),
    h("div", { class: "grid2" }, field("Abre", inicio), field("Cierra", fin)),
    field("Zona horaria", zona),
    h("h3", {}, "Vendedora"),
    h("label", { class: "row gap-s" }, ventas, h("span", {}, "Vender autos: menú, inventario con foto, crédito, citas y pase contigo")),
    field("Cómo se presenta (opcional)", presentacion, "Va al inicio del primer mensaje. Vacío: «Te escribo de parte del…»."),
    h("div", { class: "grid2" }, field("Tasa anual de referencia (%)", tasa, "Solo para estimar; Sofía aclara que está sujeta a aprobación."), field("Enganche mínimo (%)", enganche)),
    h("div", { class: "grid2" }, field("Plazos (meses)", plazos), field("Al pedirte, Sofía se calla (horas)", conAsesor)),
    h("label", { class: "row gap-s" }, conIa, h("span", {}, "Con IA: contesta lo que el menú no entiende y platica como vendedora (opcional, de pago)")),
    h("p", { class: iaSt && !iaSt.llave && conIa.checked ? "warn small" : "muted small" }, iaSt?.motor === "cloudflare"
      ? "Usa la IA GRATIS de tu Cloudflare (cuota diaria sin costo). Nunca inventa precios: solo usa tu inventario y tus reglas; si no sabe, te pasa al cliente."
      : iaSt?.motor === "claude"
        ? `Usa Claude con la llave de tu servidor (modelo ${iaSt.modelo}): la más natural, con costo por uso.`
        : "Para la IA gratis: en Cloudflare, tu Worker → Settings → Bindings → Add → Workers AI, con el nombre AI (ver la guía). Sin IA, Sofía contesta con el menú."),
    h("p", { class: "muted small" }, state.settings.style.examples.length
      ? `Habla como tú: al guardar se le mandan ${Math.min(40, state.settings.style.examples.length)} mensajes tuyos de «Mi estilo de venta».`
      : "Para que hable como tú, importa tus chats en Más → Mi estilo de venta y vuelve a guardar."),
    soloReglas,
    h("h3", {}, "Respuestas por palabra clave"),
    reglasBox,
    h("div", { class: "grid2" },
      field("No repetir la misma respuesta antes de (horas)", espera),
      field("Callarse si tú escribiste hace menos de (minutos)", pausa)),
    h("div", { class: "row" }, btn("Guardar", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        await setAgentConfig({
          activo: activo.checked, asesor: asesor.value, agencia: agencia.value, zonaHoraria: zona.value,
          horario: { dias: [...dias], inicio: inicio.value, fin: fin.value },
          bienvenida: bienvenida.value, fueraDeHorario: fuera.value,
          // Mensajes reales del asesor (los más recientes con algo de contenido) para que la IA hable como él.
          estilo: { ejemplos: state.settings.style.examples.map((e) => e.text).filter((t) => t.length >= 8 && t.length <= 300).slice(-40), notas: state.settings.style.notes ?? "" },
          ventas: {
            activo: ventas.checked, ia: conIa.checked, presentacion: presentacion.value, tasaAnual: Number(tasa.value) || 0, engancheMinimo: Number(enganche.value) || 0,
            plazos: plazos.value.split(/[^\d]+/).map(Number).filter(Boolean), ...(conAsesor.value === "" ? {} : { horasConAsesor: Number(conAsesor.value) }),
          },
          reglas: reglas.filter((r) => r.palabras.trim() || r.respuesta.trim()),
          // Vacío = conservar lo guardado (Number("") sería 0).
          esperaHoras: espera.value === "" ? undefined : Number(espera.value), pausaMinutos: pausa.value === "" ? undefined : Number(pausa.value),
        });
        await refreshStatus().catch(() => {});
        toast(activo.checked ? (ventas.checked ? "Listo: Sofía vende por ti en WhatsApp y Messenger." : "Listo: Sofía contesta sola en WhatsApp y Messenger.") : "Configuración guardada (respuestas automáticas apagadas).", 5000);
        rerender();
      } catch (err) { toast(err.message, 6000); b.disabled = false; }
    }, "primary")));
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
