// Más → Mi estilo de venta: Sofía aprende de los chats reales del asesor para escribir como él,
// y recupera a los clientes de esos chats.
import { h, toast, modal, fmtWhen, inDays, confirmBox } from "./util.js";
import { state, save, learnFromAdvisor, addCustomer, updateCustomer, log, setFollowUp, stageLabel } from "./store.js";
import { header, section, btn, rerender, field, textarea, chip, go } from "./ui.js";
import { readChatFiles, guessMe, styleStats, phoneFromName } from "./chat-import.js";
import { aiReady, analyzeStyle, extractLead } from "./ai.js";
import { phoneKey } from "./connector.js";

let found = []; // chats importados en esta sesión (clientes por agregar)

export function renderStyle(root) {
  const st = state.settings.style;
  const stats = styleStats(st.examples);
  const files = h("input", { type: "file", multiple: true, accept: ".txt,.zip,text/plain,application/zip", hidden: true, onchange: (e) => importChats([...(e.target.files ?? [])]) });
  const notes = textarea({ rows: 5, placeholder: "Ej.: Siempre saludo por su nombre y con 😃. Primero pregunto si es de contado o crédito. Nunca doy precio sin conocer la versión. Cierro invitando a prueba de manejo el fin de semana…", onchange: (e) => { st.notes = e.target.value.trim(); save(); toast("Guardado"); } }, st.notes ?? "");

  root.append(
    header("Mi estilo de venta", { back: "/mas" }),
    h("div", { class: "page" },
      h("p", { class: "lead" }, "Enséñale a Sofía cómo vendes: lee tus chats reales para escribir con tu tono, tus saludos y tu forma de cerrar."),

      section("1 · Tus chats de WhatsApp",
        h("p", { class: "muted small" }, "En WhatsApp abre un chat con un cliente → ⋮ (o el nombre del contacto en iPhone) → Más → Exportar chat → Sin archivos. Guárdalo en Archivos y súbelo aquí. Puedes subir varios a la vez (.txt o .zip)."),
        files,
        h("div", { class: "row wrap gap-s" }, btn("Subir chats exportados", () => files.click(), "primary")),
        st.myName ? h("p", { class: "muted small" }, `Tú apareces como «${st.myName}» en los chats. `, h("a", { href: "#", onclick: (e) => { e.preventDefault(); st.myName = ""; save(); rerender(); } }, "Cambiar")) : null,
        found.length ? foundList() : null),

      section("2 · Cuéntale cómo vendes",
        field("Tus reglas, frases, promociones que manejas, lo que nunca dices", notes)),

      section("3 · Tu estilo",
        stats ? h("ul", { class: "checks" },
          h("li", { class: "info" }, `${stats.count} mensajes tuyos aprendidos.`),
          h("li", { class: "info" }, `Largo promedio: ${stats.avg} caracteres · Trato: ${stats.treatment}.`),
          h("li", { class: "info" }, `${stats.emojiPct}% de tus mensajes llevan emoji ${stats.topEmojis.join(" ")}`),
          stats.greetings.length ? h("li", { class: "info" }, `Saludas con: ${stats.greetings.map((g) => `«${g}»`).join(", ")}`) : null)
          : h("p", { class: "muted" }, "Aún no hay mensajes tuyos. Sube chats o envía mensajes desde Sofía: también aprende de lo que escribes aquí."),
        st.profile ? profileView(st.profile, st.analyzedAt) : null,
        h("div", { class: "row wrap gap-s" },
          aiReady()
            ? btn(st.profile ? "✨ Volver a analizar con IA" : "✨ Analizar mi estilo con IA", async (e) => {
              if (!st.examples.length && !st.notes) { toast("Sube al menos un chat o escribe cómo vendes."); return; }
              const b = e.currentTarget;
              b.disabled = true; b.textContent = "Analizando…";
              try { st.profile = await analyzeStyle(st.examples, st.notes); st.analyzedAt = new Date().toISOString(); save(); toast("Listo: Sofía ya escribe como tú."); rerender(); }
              catch (err) { toast(err.message, 6000); b.disabled = false; b.textContent = "✨ Analizar mi estilo con IA"; }
            }, "primary")
            : btn("Conectar IA para analizar tu estilo", () => go("/conexiones"), "ghost"),
          st.examples.length ? btn("Borrar lo aprendido", async () => {
            if (!(await confirmBox("Borrar estilo", "Se borran los mensajes aprendidos y el análisis.", "Borrar"))) return;
            Object.assign(st, { examples: [], profile: null, analyzedAt: null });
            save();
            rerender();
          }, "ghost small") : null)),
    ));
}

function profileView(p, at) {
  const row = (k, v) => (v && (!Array.isArray(v) || v.length) ? h("tr", {}, h("th", {}, k), h("td", {}, Array.isArray(v) ? v.join(" · ") : v)) : null);
  return h("div", { class: "reading" },
    h("div", { class: "row between" }, h("h3", {}, "Así vendes (según la IA)"), at ? chip(`analizado ${fmtWhen(at)}`, "ok") : null),
    h("p", {}, p.resumen),
    h("table", { class: "kv" },
      row("Tono", p.tono), row("Trato", p.trato), row("Saludo", p.saludo_tipico), row("Despedida", p.despedida_tipica),
      row("Emojis", p.emojis), row("Largo", p.longitud), row("Frases", p.frases_tipicas), row("Abre así", p.como_abre_conversacion),
      row("Pide datos", p.como_pide_datos), row("Objeciones", p.como_maneja_objeciones), row("Cierra", p.como_cierra), row("Evita", p.evita)));
}

async function importChats(files) {
  if (!files.length) return;
  let chats;
  try { chats = await readChatFiles(files); } catch (e) { toast(e.message, 5000); return; }
  if (!chats.length) { toast("No encontré mensajes en esos archivos. ¿Son chats exportados de WhatsApp?", 5000); return; }
  const st = state.settings.style;
  let me = guessMe(chats, st.myName);
  if (!me) me = await askWhoAmI(chats);
  if (!me) return;
  st.myName = me;
  let learned = 0;
  found = [];
  for (const c of chats) {
    learned += learnFromAdvisor(c.messages.filter((m) => m.from === me).map((m) => m.text), "chat");
    const other = Object.keys(c.participants).filter((p) => p !== me).sort((a, b) => c.participants[b] - c.participants[a])[0];
    if (other) found.push({ name: other, phone: phoneFromName(other), messages: c.messages.map((m) => ({ dir: m.from === me ? "out" : "in", text: m.text, at: m.at })), title: c.title });
  }
  save();
  toast(`Aprendí ${learned} mensajes tuyos de ${chats.length} chat${chats.length === 1 ? "" : "s"}.`, 4000);
  rerender();
}

function askWhoAmI(chats) {
  const names = {};
  for (const c of chats) for (const [p, n] of Object.entries(c.participants)) names[p] = (names[p] ?? 0) + n;
  return new Promise((resolve) => {
    modal("¿Cuál eres tú?", h("div", { class: "list" }, Object.entries(names).sort((a, b) => b[1] - a[1]).map(([n, count]) =>
      h("button", { class: "item", onclick: () => { document.querySelector(".modal-wrap")?.remove(); resolve(n); } }, h("strong", { class: "grow" }, n), h("span", { class: "muted small" }, `${count} mensajes`)))), [{ label: "Cancelar", onClick: () => resolve(null) }]);
  });
}

const matchCustomer = (f) => state.customers.find((c) => (f.phone && phoneKey(c.phone) === f.phone) || c.name.trim().toLowerCase() === f.name.trim().toLowerCase());

function foundList() {
  return h("div", { class: "stack-s" },
    h("h3", {}, "Clientes en estos chats"),
    h("div", { class: "list" }, found.map((f) => {
      const existing = matchCustomer(f);
      const last = f.messages.at(-1);
      return h("div", { class: "item col" },
        h("div", { class: "row between" }, h("strong", {}, f.name), existing ? chip(`Ya es cliente · ${stageLabel(existing.stage)}`, "ok") : chip(`${f.messages.length} mensajes`)),
        last ? h("p", { class: "preview" }, `${last.dir === "out" ? "Tú" : "Cliente"}: ${last.text.slice(0, 140)}`) : null,
        h("div", { class: "row wrap gap-s" },
          aiReady() ? btn(existing ? "✨ Actualizar ficha con IA" : "✨ Agregar con IA", (e) => saveLead(f, existing, true, e.currentTarget), "small primary") : null,
          !existing ? btn("Agregar", (e) => saveLead(f, null, false, e.currentTarget), aiReady() ? "small ghost" : "small primary") : btn("Ver ficha", () => go(`/cliente/${existing.id}`), "small ghost")));
    })));
}

async function saveLead(f, existing, withAi, b) {
  b.disabled = true;
  try {
    let info = null;
    if (withAi) {
      b.textContent = "Leyendo el chat…";
      info = await extractLead(f.messages.map((m) => `${m.dir === "out" ? "Asesor" : "Cliente"}: ${m.text}`).join("\n"), { name: f.name });
    }
    const name = existing?.name ?? (info?.nombre || f.name);
    const extra = info ? [info.resumen, info.presupuesto && `Presupuesto: ${info.presupuesto}`, info.forma_pago !== "desconocido" && `Pago: ${info.forma_pago}`, info.enganche && `Enganche: ${info.enganche}`, info.plazo_meses && `Plazo: ${info.plazo_meses} meses`, info.cuando_compra && `Cuándo compra: ${info.cuando_compra}`, info.siguiente_paso && `Siguiente paso: ${info.siguiente_paso}`].filter(Boolean).join("\n") : "";
    const data = { ...(info?.auto_interes ? { vehicle: info.auto_interes } : {}), ...(info?.etapa ? { stage: info.etapa } : {}), chat: f.messages.slice(-80) };
    let c;
    if (existing) {
      c = updateCustomer(existing.id, { ...data, notes: [existing.notes, extra].filter(Boolean).join("\n\n") });
    } else {
      c = addCustomer({ name, phone: f.phone ?? "", source: "whatsapp", stage: "seguimiento", notes: extra, ...data });
    }
    log(c.id, "whatsapp", `Chat importado (${f.messages.length} mensajes)${info ? " y leído con IA" : ""}`);
    if (info?.dias_para_seguimiento > 0 && !["perdido", "entregado"].includes(c.stage)) setFollowUp(c.id, inDays(info.dias_para_seguimiento), info.siguiente_paso || "Dar seguimiento");
    save();
    toast(existing ? `Ficha de ${c.name} actualizada` : `${c.name} agregado a clientes`);
    rerender();
  } catch (e) {
    toast(e.message, 6000);
    b.disabled = false;
  }
}
