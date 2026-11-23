// Centro de operación sin IA: chats pegados, CRM por temperatura, indicaciones y cola revisable.
import { h, toast, fmtWhen, uid, confirmBox, money } from "./util.js";
import { state, save, addCustomer, customer, updateCustomer, log, learnFromAdvisor, setFollowUp } from "./store.js";
import { header, section, empty, btn, go, field, input, textarea, select, chip } from "./ui.js";
import { connectorReady, lastStatus, sendMessage, getAgenda, refreshStatus } from "./connector.js";
import { parsePastedChat, mergeCustomerBurst, parseSalesDirective, customerMonth, defaultSalesMessage, repairSalesText } from "./sales-desk.js";
import { decidir, VENTAS_BASE, horariosLibres, mensualidad, leerEnganche, pesos } from "./vendedor.js";
import { openExternal } from "./native.js";

const TEMPS = [["muy caliente", "Muy caliente"], ["caliente", "Caliente"], ["tibio", "Tibio"], ["frio", "Frío"]];
const months = () => {
  const d = new Date();
  return [["", "Todos los meses"], [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, "Este mes"], ...Array.from({ length: 11 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth() - i - 1, 1);
    return [`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`, x.toLocaleDateString("es-MX", { month: "long", year: "numeric" })];
  })];
};
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const temperature = (c) => c.salesTemperature || (c.stage === "cotizacion" || c.stage === "credito" ? "caliente" : "tibio");
const modelLabel = (c) => c.vehicle ? `Modelo: ${c.vehicle}` : "";
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const DEFAULT_TONE = () => state.settings.salesDesk?.tone || "tu";

function salesCfg() {
  const cfg = { asesor: state.settings.advisorName || "Mario Abarca", agencia: state.settings.agency || "Honda", marca: "Honda", zonaHoraria: "America/Monterrey",
    horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, reglas: [], ventas: { ...VENTAS_BASE, ia: false } };
  return cfg;
}

export function renderSalesDesk(root) {
  let tab = "tablero";
  let filterMonth = "";
  let filterModel = "";
  let appointments = [];
  let plan = null;
  let targets = [];
  let draftText = "";
  const content = h("div", { class: "page" });
  const draw = () => {
    const tabs = [["tablero", "Tablero"], ["chat", "Chat pegado"], ["orden", "Indicaciones"], ["envios", `Envíos (${state.outbox.filter((x) => x.status !== "sent" && x.status !== "cancelled").length})`], ["citas", "Citas"]];
    content.replaceChildren(h("div", { class: "tabs", role: "tablist" }, tabs.map(([id, label]) => h("button", { role: "tab", "aria-selected": String(tab === id), class: tab === id ? "on" : "", onclick: () => { tab = id; draw(); } }, label))));
    if (tab === "tablero") drawBoard(content, draw);
    if (tab === "chat") drawPasteChat(content, draw);
    if (tab === "orden") drawDirective(content, draw, (p, c, text) => { plan = p; targets = c; draftText = text; tab = "orden"; draw(); });
    if (tab === "envios") drawOutbox(content, draw);
    if (tab === "citas") drawAppointments(content, draw, appointments);
  };
  root.append(header("Operación de ventas", { back: "/whatsapp?tab=auto", actions: [btn("Inventario", () => go("/inventario"), "small ghost")] }), content);
  if (connectorReady()) getAgenda().then((a) => { appointments = a; if (tab === "citas") draw(); }).catch(() => {});
  draw();
}

function drawBoard(root, redraw) {
  root.replaceChildren(root.firstElementChild);
  const month = select(months(), filterMonth, { onchange: (e) => { filterMonth = e.target.value; redraw(); } });
  const model = input({ type: "search", placeholder: "Filtrar por modelo", value: filterModel });
  const applyFilter = btn("Filtrar", redraw, "small ghost");
  const q = fold(filterModel);
  const shown = state.customers.filter((c) => (!filterMonth || customerMonth(c) === filterMonth) && (!q || fold(c.vehicle).includes(q) || (c.tags ?? []).some((x) => fold(x).includes(q))));
  const columns = state.settings.salesDesk.columns;
  const tone = select([["tu", "Tú, cercano"], ["usted", "Usted, formal"]], DEFAULT_TONE(), { onchange: (e) => { state.settings.salesDesk.tone = e.target.value; save(); } });
  root.append(section("Tablero de clientes", h("p", { class: "muted small" }, "Temperatura y etiquetas son tuyas. La etiqueta del modelo viene de la ficha del cliente. Mover tarjetas no envía mensajes."),
    h("div", { class: "grid2" }, field("Mes de alta/actualización", month), field("Modelo", model), field("Estilo de trato", tone)),
    h("div", { class: "row wrap gap-s" }, btn("Importar chat copiado", () => { const tabs = root.querySelectorAll("[role=tab]"); tabs[1]?.click(); }, "ghost"), btn("Preparar seguimiento", () => { const tabs = root.querySelectorAll("[role=tab]"); tabs[3]?.click(); }, "ghost")),
    ...columns.map((col) => {
      const clients = shown.filter((c) => col.temperature ? !c.salesColumn && (col.temperature === "caliente" ? ["muy caliente", "caliente"].includes(temperature(c)) : temperature(c) === col.temperature) : c.salesColumn === col.id);
      return section(`${col.name} · ${clients.length}`,
        clients.length ? h("div", { class: "list" }, clients.map((c) => customerCard(c, redraw))) : empty("No hay clientes aquí."));
    }),
    section("Personalizar columnas", h("p", { class: "muted small" }, "Las columnas Caliente, Tibio y Frío permanecen. Puedes añadir etapas propias."), customColumnControl(redraw))));
  const filters = root.querySelector(".grid2");
  filters?.append(applyFilter);
  model.addEventListener("keydown", (e) => { if (e.key === "Enter") redraw(); });
}

function customerCard(c, redraw) {
  const temp = select(TEMPS, temperature(c));
  temp.addEventListener("change", () => { updateCustomer(c.id, { salesTemperature: temp.value }); log(c.id, "ventas", `Temperatura: ${temp.value}`); redraw(); });
  const customColumns = state.settings.salesDesk.columns.filter((x) => !x.temperature).map((x) => [x.id, x.name]);
  const lane = customColumns.length ? select([["", "Etapa propia…"], ...customColumns], c.salesColumn || "", { onchange: (e) => { updateCustomer(c.id, { salesColumn: e.target.value || null }); redraw(); } }) : null;
  const tags = h("div", { class: "chips-scroll" }, ...(c.tags ?? []).filter((x) => x !== c.vehicle).map((t) => chip(t)));
  const tagInput = input({ placeholder: "Etiqueta libre" });
  const addTag = () => { const t = tagInput.value.trim(); if (!t || fold(t) === fold(c.vehicle)) return; const next = [...new Set([...(c.tags ?? []), t])]; updateCustomer(c.id, { tags: next }); tagInput.value = ""; redraw(); };
  const consent = h("input", { type: "checkbox", checked: Boolean(c.marketingConsent), onchange: (e) => { updateCustomer(c.id, { marketingConsent: e.target.checked }); toast(e.target.checked ? "Marcado con permiso para promociones" : "Se excluye de promociones"); } });
  const followDate = input({ type: "date", value: c.nextFollowUp ? new Date(c.nextFollowUp).toISOString().slice(0, 10) : "" });
  const saveFollow = () => { setFollowUp(c.id, followDate.value ? new Date(`${followDate.value}T10:00:00`).toISOString() : null, "Seguimiento de venta"); toast(followDate.value ? "Seguimiento programado" : "Seguimiento quitado"); redraw(); };
  return h("article", { class: "item col" },
    h("div", { class: "row between" }, h("strong", {}, c.name || "Cliente sin nombre"), chip(c.stage || "nuevo")),
    h("div", { class: "small" }, [c.phone && `+${c.phone}`, modelLabel(c), c.nextFollowUp && `Seguimiento: ${fmtWhen(c.nextFollowUp)}`].filter(Boolean).join(" · ")),
    h("div", { class: "row wrap gap-s" }, field("Temperatura", temp), lane ? field("Etapa", lane) : null, btn("Abrir ficha", () => go(`/cliente/${c.id}`), "small ghost"), btn("WhatsApp", () => go(`/whatsapp?tab=escribir&c=${encodeURIComponent(c.id)}`), "small")),
    c.vehicle ? chip(`Modelo: ${c.vehicle}`, "ok") : null, tags,
    h("div", { class: "row gap-s" }, tagInput, btn("Añadir", addTag, "small ghost")),
    h("div", { class: "row gap-s" }, field("Próximo seguimiento", followDate), btn("Guardar", saveFollow, "small ghost")),
    h("label", { class: "row gap-s small" }, consent, h("span", {}, "Tiene permiso para recibir promociones")));
}

function customColumnControl(redraw) {
  const name = input({ placeholder: "Nombre de columna" });
  return h("div", { class: "stack-s" }, h("div", { class: "row gap-s" }, name, btn("Crear", () => {
    const label = name.value.trim(); if (!label) return;
    const columns = state.settings.salesDesk.columns;
    if (columns.some((x) => fold(x.name) === fold(label))) { toast("Ya existe esa columna."); return; }
    columns.push({ id: `custom-${uid()}`, name: label, temperature: null }); save(); redraw();
  }, "small primary")),
    ...state.settings.salesDesk.columns.filter((x) => !x.temperature).map((col) => h("div", { class: "row gap-s" }, h("span", { class: "grow" }, col.name), btn("Renombrar", () => {
      const label = prompt("Nuevo nombre para la columna", col.name)?.trim(); if (!label) return;
      col.name = label; save(); redraw();
    }, "small ghost"), btn("Borrar", async () => {
      if (!(await confirmBox("Borrar columna", `Los clientes de “${col.name}” volverán a Tibio.`, "Borrar"))) return;
      state.customers.forEach((c) => { if (c.salesColumn === col.id) { c.salesColumn = null; c.salesTemperature = "tibio"; } });
      state.settings.salesDesk.columns = state.settings.salesDesk.columns.filter((x) => x.id !== col.id); save(); redraw();
    }, "small ghost"))));
}

function drawPasteChat(root, draw) {
  const name = input({ placeholder: "Nombre del cliente" });
  const phone = input({ inputmode: "tel", placeholder: "Celular con lada" });
  const paste = textarea({ rows: 9, placeholder: "Pega aquí el chat exportado o copiado de WhatsApp. Sofía separa “Tú” de los mensajes del cliente; no envía nada." });
  const result = h("div");
  const importChat = async () => {
    const parsed = parsePastedChat(paste.value, [state.settings.advisorName || "Mario Abarca", "Mario", "Yo", "Tú"]);
    if (!parsed.length) { toast("No encontré texto para importar."); return; }
    const number = digits(phone.value);
    let c = number ? state.customers.find((x) => digits(x.phone).endsWith(number.slice(-10))) : null;
    if (!c) c = addCustomer({ name: name.value.trim() || parsed.find((x) => x.sender === "cliente")?.author || "Cliente de WhatsApp", phone: number.slice(-10), source: "whatsapp", stage: "nuevo", chat: [] });
    const old = c.chat ?? [];
    const newMessages = parsed.map((m) => ({ dir: m.sender === "Mario" ? "out" : "in", text: m.body, at: new Date().toISOString(), ...(m.hasMedia ? { hasMedia: true } : {}) }));
    updateCustomer(c.id, { chat: [...old, ...newMessages].slice(-250), lastCustomerAt: new Date().toISOString(), ...(name.value.trim() && !c.name ? { name: name.value.trim() } : {}) });
    const written = parsed.filter((m) => m.sender === "Mario").map((m) => m.body);
    if (written.length) learnFromAdvisor(written, "chat-importado");
    const lastCustomer = [...parsed].reverse().find((m) => m.sender === "cliente");
    if (lastCustomer && parsed.at(-1)?.sender === "cliente") {
      const cfg = salesCfg();
      const inv = state.inventory.filter((a) => a.disponible !== false).map((a) => ({ ...a, foto: null }));
      const libres = horariosLibres({ horario: cfg.horario, ahora: new Date() });
      const previous = c.salesConversation ?? {};
      const r = decidir({ cfg, inventario: inv, conv: previous, msg: { texto: mergeCustomerBurst(parsed.slice(-8)), nombre: c.name, primero: !old.length, enHorario: true }, ahora: new Date(), libres });
      c.salesConversation = r.conv;
      if (r.lead?.interes) c.vehicle = r.lead.interes;
      if (r.lead?.calor) c.salesTemperature = r.lead.calor;
      save();
      const answer = r.respuestas.map((x) => x.texto).join("\n\n");
      result.replaceChildren(h("article", { class: "item col" }, h("strong", {}, `Importé ${parsed.length} mensajes · ${c.name}`),
        h("p", { class: "muted small" }, "Borrador determinista, sin IA. Revisa los datos antes de enviar."),
        textarea({ rows: 4, "aria-label": "Borrador de respuesta" }, answer),
        answer ? btn("Preparar en Envíos", () => { state.outbox.unshift({ id: uid(), customerId: c.id, to: digits(c.phone), text: result.querySelector("textarea")?.value || answer, type: "respuesta", status: "ready", createdAt: new Date().toISOString() }); save(); toast("Borrador guardado; no se envió."); draw(); }, "primary") : h("p", { class: "muted small" }, "Sofía no preparó una respuesta; revisa el chat y usa la indicación manual."),
        btn("Abrir cliente", () => go(`/cliente/${c.id}`), "ghost")));
    } else result.replaceChildren(h("p", { class: "ok-text small" }, `Chat guardado en ${c.name}. El último mensaje fue de Mario, así que no generé respuesta.`));
    toast("Chat importado en este dispositivo");
  };
  root.append(section("Pegar un chat, sin API oficial", h("p", { class: "muted small" }, "Copia o exporta la conversación desde WhatsApp y pégala aquí. Sofía registra el historial y prepara un borrador local; no contesta por sí sola ni manda mensajes al importar."),
    h("div", { class: "grid2" }, field("Cliente", name), field("Celular", phone)), paste,
    btn("Importar y preparar respuesta si el cliente fue el último", importChat, "primary"), result));
}

function resolveTargets(plan, appointments = []) {
  let list = state.customers.filter((c) => !c.archived);
  if (plan.customerIds.length) list = list.filter((c) => plan.customerIds.includes(c.id));
  else if (plan.temperatures.length) list = list.filter((c) => plan.temperatures.some((t) => t === "caliente" ? ["caliente", "muy caliente"].includes(temperature(c)) : t === temperature(c)));
  else if (!plan.all && !plan.model && !plan.period && !plan.appointment) return [];
  if (plan.model) list = list.filter((c) => fold(c.vehicle).includes(fold(plan.model)) || (c.tags ?? []).some((t) => fold(t).includes(fold(plan.model))));
  if (plan.period) list = list.filter((c) => customerMonth(c) === plan.period);
  if (plan.appointment) {
    const ids = appointments.filter((a) => {
      if (!plan.tomorrow) return true;
      const d = new Date(a.id || a.at); const t = new Date(); const tom = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      return d.getFullYear() === tom.getFullYear() && d.getMonth() === tom.getMonth() && d.getDate() === tom.getDate();
    }).map((a) => digits(a.cliente || a.phone));
    list = list.filter((c) => ids.includes(digits(c.phone)) || (c.nextFollowUp && (!plan.tomorrow || new Date(c.nextFollowUp).toDateString() === new Date(Date.now() + 86400000).toDateString())));
  }
  if (plan.purpose === "promo") list = list.filter((c) => c.marketingConsent === true);
  return list;
}

function drawDirective(root, draw, setPlan) {
  const instruction = textarea({ rows: 4, placeholder: "Ej.: Háblale a los calientes del Civic: ya llegó la unidad que buscabas." });
  const preview = h("div");
  const compose = async () => {
    const agendas = connectorReady() ? await getAgenda().catch(() => []) : [];
    const p = parseSalesDirective(instruction.value, state.customers, state.inventory, new Date());
    if (!p.isDirective) { preview.replaceChildren(h("p", { class: "warn small" }, "No entendí la orden con suficiente certeza. Especifica destinatarios y un mensaje; no preparé nada.")); return; }
    const matches = resolveTargets(p, agendas);
    const totalBeforeConsent = p.purpose === "promo" ? resolveTargets({ ...p, purpose: "followup" }, agendas).length : matches.length;
    const excluded = p.purpose === "promo" ? totalBeforeConsent - matches.length : 0;
    if (!matches.length) { preview.replaceChildren(h("p", { class: "warn small" }, p.purpose === "promo" ? "No hay destinatarios con permiso para promociones y filtros compatibles." : "No encontré clientes que coincidan. No se preparó ningún envío."), ...p.warnings.map((w) => h("p", { class: "muted small" }, w))); return; }
    const tone = DEFAULT_TONE();
    const make = (c) => p.message ? p.message.replace(/\{nombre\}/gi, c.name?.split(/\s+/)[0] || "").replace(/\{auto\}/gi, c.vehicle || p.model || "el auto") : defaultSalesMessage(c, { tone, model: p.model || c.vehicle, day: new Date() });
    const common = input({ placeholder: "Mensaje exacto para estos clientes (opcional)" });
    const photoAutos = state.inventory.filter((a) => a.disponible !== false && a.fotoId);
    const photo = p.media.includes("foto") && photoAutos.length ? select([["", "Sin foto"], ...photoAutos.map((a) => [a.fotoId, `${a.marca || ""} ${a.modelo || "Auto"} ${a.anio || ""}`.trim()])], "") : null;
    preview.replaceChildren(h("div", { class: "item col" }, h("strong", {}, `Sofía entendió: ${matches.length} destinatarios`),
      h("p", { class: "small" }, `Filtro: ${[...p.temperatures, p.model, p.period, p.appointment ? "con cita" : ""].filter(Boolean).join(" · ") || "selección directa"}`),
      excluded ? h("p", { class: "warn small" }, `${excluded} clientes excluidos porque no están marcados con permiso de promociones.`) : null,
      p.media.length ? h("p", { class: "muted small" }, `Pidió material: ${p.media.join(", ")}. La foto seleccionada solo se enviará si el conector de WhatsApp está activo; videos y flyers aún se deben compartir manualmente.`) : null,
      photo ? field("Foto del inventario", photo) : p.media.includes("foto") ? h("p", { class: "warn small" }, "No hay foto de inventario sincronizada con el servidor. Abre Inventario → Mandar a WhatsApp y vuelve a preparar la indicación.") : null,
      ...p.warnings.map((w) => h("p", { class: "warn small" }, w)),
      field("Personaliza el mensaje para todos (opcional)", common),
      h("p", { class: "muted small" }, `Vista previa: ${make(matches[0])}`),
      h("div", { class: "list" }, matches.slice(0, 12).map((c) => h("div", { class: "item row between" }, h("span", {}, `${c.name} · ${c.phone || "sin celular"}`), chip(temperature(c))))),
      matches.length > 12 ? h("p", { class: "muted small" }, `y ${matches.length - 12} más en la lista de revisión`) : null,
      btn(`Preparar ${matches.length} borradores`, async () => {
        if (!(await confirmBox("Preparar envíos", `Se crearán ${matches.length} borradores, uno por cliente. No saldrá ningún mensaje hasta que abras cada borrador y confirmes el envío.`, "Preparar"))) return;
        const now = new Date().toISOString();
        for (const c of matches) state.outbox.unshift({ id: uid(), customerId: c.id, to: digits(c.phone), text: common.value.trim() || make(c), type: p.purpose, mediaKinds: p.media, ...(photo?.value ? { imageId: photo.value } : {}), model: p.model, status: "ready", createdAt: now });
        save(); toast(`${matches.length} borradores preparados; no se envió ningún mensaje.`); setPlan(p, matches, common.value.trim());
      }, "primary")));
  };
  root.append(section("Dile a Sofía qué quieres hacer", h("p", { class: "muted small" }, "El intérprete es sin IA. Especifica a quién, el modelo y el texto. Sofía muestra los destinatarios; tú revisas y confirmas cada envío."),
    instruction, btn("Interpretar y revisar destinatarios", compose, "primary"), preview));
}

function drawOutbox(root, draw) {
  const waiting = state.outbox.filter((x) => !["sent", "cancelled"].includes(x.status));
  const due = state.customers.filter((c) => c.nextFollowUp && new Date(c.nextFollowUp) <= new Date() && !waiting.some((x) => x.customerId === c.id));
  const addDue = () => {
    for (const c of due) state.outbox.unshift({ id: uid(), customerId: c.id, to: digits(c.phone), text: defaultSalesMessage(c, { tone: DEFAULT_TONE(), model: c.vehicle }), type: "followup", status: "ready", createdAt: new Date().toISOString() });
    save(); toast(`${due.length} seguimientos pasaron a borradores. No se enviaron.`); draw();
  };
  root.append(section("Envíos revisables", h("p", { class: "muted small" }, "Cada borrador se envía por separado y requiere confirmación. En móvil, WhatsApp se abre con el texto listo; regresa aquí y marca el resultado."),
    due.length ? btn(`Preparar seguimientos vencidos (${due.length})`, addDue, "primary") : h("p", { class: "muted small" }, "No hay seguimientos vencidos."),
    waiting.length ? h("div", { class: "list" }, waiting.map((item) => outboxCard(item, draw))) : empty("La cola está vacía.")));
}

function outboxCard(item, draw) {
  const c = customer(item.customerId);
  const box = textarea({ rows: 3, "aria-label": "Mensaje listo para revisar", oninput: (e) => { item.text = e.target.value; save(); } }, item.text);
  const direct = lastStatus()?.whatsapp?.modo === "web" && lastStatus()?.whatsapp?.ok;
  const send = async () => {
    if (!c || !digits(c.phone)) { toast("Este cliente necesita un celular válido."); return; }
    if (!(await confirmBox(`Enviar a ${c.name || "cliente"}`, `Revisa el número +${digits(c.phone)} y el mensaje. ${item.imageId && !direct ? "La foto no se adjunta en la apertura manual de WhatsApp. " : ""}${direct ? "Se enviará ahora desde el WhatsApp vinculado." : "Se abrirá WhatsApp para que revises y pulses Enviar."}`, direct ? "Enviar ahora" : "Abrir WhatsApp"))) return;
    try {
      if (direct) {
        await sendMessage({ channel: "wa", to: digits(c.phone), text: item.text, ...(item.imageId ? { imageId: item.imageId } : {}) });
        markOutboxSent(item, c);
        toast("Mensaje enviado por el conector");
      } else {
        const url = `https://wa.me/${digits(c.phone)}?text=${encodeURIComponent(item.text)}`;
        openExternal(url);
        item.status = "opened"; item.openedAt = new Date().toISOString(); save();
        toast("WhatsApp abierto. Pulsa Enviar allí y luego confirma aquí.", 5000);
      }
      draw();
    } catch (e) { toast(e.message, 6000); }
  };
  return h("article", { class: "item col" },
    h("div", { class: "row between" }, h("strong", {}, c?.name || "Cliente eliminado"), chip(item.status === "opened" ? "Abierto en WhatsApp" : item.type)),
    h("p", { class: "muted small" }, `+${item.to || c?.phone || "sin número"} · ${fmtWhen(item.createdAt)}${item.imageId ? " · incluye foto" : ""}`), box,
    h("div", { class: "row wrap gap-s" }, btn(item.status === "opened" ? "Revisar y abrir otra vez" : "Enviar / abrir WhatsApp", send, "primary"),
      item.status === "opened" ? btn("Confirmar que lo envié", async () => { if (await confirmBox("Registrar envío", `¿Enviaste este mensaje a ${c?.name}?`, "Sí, registrar")) { markOutboxSent(item, c); draw(); } }, "small") : null,
      btn("Cancelar", async () => { if (await confirmBox("Cancelar borrador", "Se quitará de la cola. No se envía nada.", "Cancelar borrador")) { item.status = "cancelled"; save(); draw(); } }, "small ghost")));
}

function markOutboxSent(item, c) {
  item.status = "sent"; item.sentAt = new Date().toISOString();
  if (c) { log(c.id, "whatsapp", item.text); c.lastOutboundAt = item.sentAt; c.lastContactAt = item.sentAt; learnFromAdvisor([item.text], "ventas"); }
  save();
}

function drawAppointments(root, redraw, appointments) {
  const upcoming = appointments.filter((a) => new Date(a.id || a.at) >= new Date()).sort((a, b) => new Date(a.id || a.at) - new Date(b.id || b.at));
  const localReminders = state.reminders.filter((r) => !r.done && (r.kind === "cita" || /cita|visita|prueba de manejo/i.test(r.text))).sort((a, b) => new Date(a.at) - new Date(b.at));
  const appointmentList = upcoming.length
    ? h("div", { class: "list" }, upcoming.map((a) => h("article", { class: "item row between" },
      h("div", {}, h("strong", {}, a.nombre || a.cliente), h("div", { class: "muted small" }, a.texto || fmtWhen(a.id))), chip(a.interes || "Cita"))))
    : empty("No hay citas próximas en el servidor consultado.");
  root.append(section("Citas y próximas acciones", h("p", { class: "muted small" }, connectorReady() ? "Agenda consultada en el servidor conectado. Las citas de WhatsApp Web de Mario solo aparecen aquí si este es el mismo servidor." : "Sin servidor conectado: mostrando recordatorios guardados en este dispositivo."),
    appointmentList,
    localReminders.length ? section("Recordatorios locales", h("div", { class: "list" }, localReminders.map((r) => { const c = customer(r.customerId); return h("article", { class: "item row between" }, h("span", {}, `${c?.name || "Cliente"} · ${r.text}`), chip(fmtWhen(r.at))); }))) : null));
}
