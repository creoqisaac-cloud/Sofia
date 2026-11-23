// Sofía Web para Mario: solo lo que se usa. Hoy · Chats · Clientes · Autos y un engrane de ajustes.
// Todo sale del servidor de la computadora de Mario (la misma Sofía que contesta WhatsApp), así que lo que
// se ve aquí es lo mismo que pasa en sus chats.
import { h, toast, confirmBox, fmtWhen, blobToDataUrl, shrinkImage, money } from "./util.js";
import { go, rerender } from "./ui.js";
import { serverBase } from "./store.js";
import {
  connectorReady, refreshStatus, lastStatus, inbox, conversation, syncPendingChats, replyToPending, sendMessage,
  listLeads, updateLead, getAgenda, salesInventory, saveInventory, uploadCarPhoto, getConnection, saveConnection,
  testCloudflareAI, testLocalAI, getAgentConfig, setAgentConfig, revivir,
} from "./connector.js";
import { interpretarOrden, mensajePara, modeloEn, MODELOS } from "./ordenes.js";

const CALOR = { caliente: ["🔥", "Caliente"], tibio: ["🌤️", "Tibio"], frio: ["❄️", "Frío"], cerrado: ["✅", "Vendido"], perdido: ["✖️", "Perdido"] };
const nombreDe = (c, clave) => c?.name || c?.nombreCliente || c?.nombre || `…${String(clave ?? c?.id ?? "").slice(-4)}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const soloClientes = (ls) => ls.filter((p) => !p.personal && p.tipo !== "otro"); // amigos, familia y proveedores no son clientes
const fotoUrl = (fotoId) => (fotoId ? `${serverBase()}/media/${fotoId}` : undefined);

// ───────── Piezas comunes ─────────

function top(titulo, { back } = {}) {
  const st = lastStatus();
  const ok = Boolean(st?.whatsapp?.ok);
  return h("header", { class: "m-top" },
    back ? h("button", { class: "m-icon", "aria-label": "Atrás", onclick: () => (typeof back === "string" ? go(back) : history.back()) }, "‹") : h("span", { class: "m-logo" }, "Sofía"),
    h("h1", {}, titulo),
    connectorReady() ? h("span", { class: `m-pill ${ok ? "ok" : "bad"}`, title: ok ? "WhatsApp de Mario conectado" : "Sin conexión con la computadora" }, ok ? "● Activa" : "● Sin conexión") : null,
    h("button", { class: "m-icon", "aria-label": "Ajustes de Sofía", onclick: () => go("/sofia") }, "⚙"));
}
const page = (...children) => h("div", { class: "m-page" }, ...children);
const card = (...children) => h("section", { class: "m-card" }, ...children);
const cargando = (texto = "Cargando…") => h("p", { class: "m-dim m-center" }, texto);
function falla(root, e) {
  root.append(card(h("p", {}, "No pude hablar con la computadora de Mario."), h("p", { class: "m-dim" }, e.message),
    h("p", { class: "m-dim" }, "Revisa que la ventana «Sofía · WhatsApp de Mario» siga abierta y abre el último link que Sofía mandó al chat «Tú».")));
}
function sinConectar(root) {
  root.append(card(h("h2", {}, "Conecta Sofía"),
    h("p", {}, "Abre en este teléfono el link 📲 que Sofía le manda a Mario a su chat «Tú» de WhatsApp. Con un toque queda conectada."),
    h("p", { class: "m-dim" }, "Si la computadora se reinicia, llega un link nuevo.")));
}

// ───────── REVIVIR CLIENTES (sacar citas) ─────────

function cajaRevivir() {
  const caja = card(cargando());
  const pintar = async () => {
    const r = await revivir("ver");
    const e = r.estado;
    const tope = h("select", { class: "m-input" }, [30, 60, 100].map((n) => h("option", { value: n, selected: Number(e.tope) === n }, `${n} por día`)));
    const lista = h("div", { class: "m-list", hidden: true }, r.muestra.map((d) => h("div", { class: "m-row" },
      h("span", { class: "m-grow" }, `${d.nombre || "Sin nombre"} ·…${d.final}`), h("span", { class: "m-dim m-small" }, `${d.modelo || "auto"} · hace ${d.dias} d${d.esperaba ? " · te esperaba" : ""}`))));
    caja.replaceChildren(
      h("h2", {}, "🔁 Revivir clientes para sacar citas"),
      h("p", {}, e.activa
        ? `🟢 Trabajando: hoy van ${e.hoy} de ${e.tope}. ${e.enHorario ? "Uno por minuto." : "Sigue mañana a las 10 am."}${e.ultimo ? ` Último: ${e.ultimo.nombre || "cliente"}.` : ""}`
        : `${r.total} clientes que dejaron de contestar (sin cita, sin trámite, ni amigos).`),
      r.ejemplo ? h("p", { class: "m-dim m-small" }, `Así les escribe (cambia nombre, auto y horarios): «${r.ejemplo}»`) : null,
      h("p", { class: "m-dim m-small" }, "Antes de cada mensaje la IA lee el chat y se salta a quien no sea cliente. Si contesta un horario, Sofía aparta la cita y te avisa."),
      h("button", { class: "m-btn small", onclick: () => { lista.hidden = !lista.hidden; } }, `Ver a quién (${r.muestra.length}${r.total > r.muestra.length ? ` de ${r.total}` : ""})`), lista,
      e.activa
        ? h("button", { class: "m-btn", onclick: async () => { await revivir("parar"); toast("Detenido"); pintar(); } }, "⏸ Parar")
        : r.total ? h("div", { class: "m-row" }, tope, h("button", { class: "m-btn primary", onclick: async () => {
          if (!(await confirmBox("¿Arranco a revivir clientes?", `Sofía le va a escribir a ${Math.min(r.total, Number(tope.value))} clientes hoy (de ${r.total}), uno por minuto, de 10 am a 7 pm. Puedes pararla cuando quieras.`, "Sí, arrancar"))) return;
          await revivir("iniciar", { tope: Number(tope.value) }); toast("Arrancó: uno por minuto"); pintar();
        } }, "▶ Arrancar")) : null,
      h("p", { class: "m-dim m-small" }, `Enviados en total: ${e.enviados} · saltados por no ser clientes: ${e.saltados}`));
  };
  pintar().catch((e) => caja.replaceChildren(h("p", { class: "m-dim" }, `Revivir: ${e.message}`)));
  return caja;
}

// ───────── HOY ─────────

export function renderHoyMario(root) {
  root.append(top("Hoy"));
  const cuerpo = page();
  root.append(cuerpo);
  if (!connectorReady()) return sinConectar(cuerpo);
  cuerpo.append(cajaOrden(), cajaRevivir());
  const datos = h("div", { class: "m-stack" }, cargando());
  cuerpo.append(datos);
  (async () => {
    try {
      const [st, bandeja, citas, prospectos] = await Promise.all([refreshStatus(), inbox(), getAgenda(), listLeads().then(soloClientes)]);
      // Solo clientes (los que llegaron como prospecto): nunca amigos ni familia, ni postventa.
      const clientes = new Map(prospectos.map((p) => [p.clave, p]));
      const pend = Object.entries(bandeja).filter(([k, c]) => clientes.has(k) && !clientes.get(k).postventa && c.lastDir === "in" && Date.now() - new Date(c.lastAt) < 30 * 864e5)
        .map(([k, c]) => [k, { ...c, name: c.name || clientes.get(k).nombreCliente || clientes.get(k).nombre }]);
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const citasHoy = citas.filter((c) => new Date(c.id) >= hoy && new Date(c.id) < new Date(hoy.getTime() + 2 * 864e5));
      const calientes = prospectos.filter((p) => p.calor === "caliente");
      const ia = st.agente?.ventas?.ia;
      datos.replaceChildren(
        !ia?.motor ? card(h("p", {}, "🧠 Sofía está contestando sin IA."), h("button", { class: "m-btn", onclick: () => go("/sofia") }, "Activar IA")) : null,
        card(
          h("div", { class: "m-stat" }, h("b", {}, String(pend.length)), h("span", {}, pend.length === 1 ? "chat esperando respuesta" : "chats esperando respuesta")),
          pend.length ? h("button", { class: "m-btn primary", onclick: () => responderPendientes(pend) }, "Que Sofía los conteste") : h("p", { class: "m-dim" }, "Todo contestado 👌"),
          pend.length ? h("div", { class: "m-list" }, pend.sort((a, b) => b[1].lastAt.localeCompare(a[1].lastAt)).slice(0, 5).map(([k, c]) => filaChat(k, c))) : null),
        card(
          h("div", { class: "m-stat" }, h("b", {}, String(citasHoy.length)), h("span", {}, "citas hoy y mañana")),
          citasHoy.length ? h("div", { class: "m-list" }, citasHoy.map((c) => h("button", { class: "m-row", onclick: () => go(`/chat/${encodeURIComponent(`${c.canal || "wa"}:${c.cliente}`)}`) },
            h("div", { class: "m-grow" }, h("b", {}, c.nombre || nombreDe(bandeja[`wa:${c.cliente}`], c.cliente)), h("span", { class: "m-dim" }, `${c.texto}${c.interes ? ` · ${c.interes}` : ""}`))))) : null),
        card(
          h("div", { class: "m-stat" }, h("b", {}, String(calientes.length)), h("span", {}, "clientes calientes")),
          h("div", { class: "m-row-btns" },
            h("button", { class: "m-btn", onclick: () => go("/cartera") }, "Ver clientes"),
            h("button", { class: "m-btn", onclick: () => abrirOrden("háblale a los que ya no contestaron") }, "Revivir cartera"))),
      );
    } catch (e) { datos.replaceChildren(); falla(datos, e); }
  })();
}

async function responderPendientes(pend) {
  if (!(await confirmBox("¿Que Sofía conteste?", `Sofía va a contestar ${pend.length} chat(s) como Mario, uno por uno.`, "Sí, contestar"))) return;
  toast("Trayendo chats de WhatsApp…");
  try { await syncPendingChats(); } catch { /* si falla, se contesta lo que ya está */ }
  let ok = 0, mal = 0;
  for (const [clave] of pend) {
    try { await replyToPending(clave); ok++; } catch { mal++; }
    toast(`Contestados ${ok} de ${pend.length}…`);
  }
  toast(`Listo: Sofía contestó ${ok}${mal ? `; ${mal} los dejó para ti (ya los atendías o no había qué decir)` : ""}.`, 6000);
  rerender();
}

function filaChat(clave, c) {
  const esperando = c.lastDir === "in";
  return h("button", { class: `m-row${esperando ? " espera" : ""}`, onclick: () => go(`/chat/${encodeURIComponent(clave)}`) },
    h("div", { class: "m-avatar" }, c?.name ? c.name.trim()[0].toUpperCase() : "👤"),
    h("div", { class: "m-grow" },
      h("div", { class: "m-between" }, h("b", {}, nombreDe(c, clave)), h("span", { class: "m-dim m-small" }, fmtWhen(c.lastAt))),
      h("span", { class: "m-dim m-one" }, `${c.lastDir === "out" ? "Tú: " : ""}${c.lastText || "(foto o audio)"}`)),
    esperando ? h("span", { class: "m-dot", "aria-label": "Esperando respuesta" }) : null);
}

// ───────── «Dile a Sofía…» ─────────

function cajaOrden() {
  const t = h("textarea", { class: "m-input", rows: 2, placeholder: "Dile a Sofía… (ej. «háblale a los interesados en CR-V de octubre»)" });
  const ejemplos = ["Háblale a los interesados en CR-V", "A los calientes diles que ya llegó la promo del mes", "Revive a los que no contestaron de octubre", "Confírmales la cita a los de mañana"];
  return card(
    h("h2", {}, "Dile a Sofía"),
    h("div", { class: "m-orden" }, t, h("button", { class: "m-send", "aria-label": "Enviar orden", onclick: () => { if (t.value.trim()) abrirOrden(t.value.trim()); } }, "➤")),
    h("div", { class: "m-chips" }, ejemplos.map((e) => h("button", { class: "m-chip", onclick: () => { t.value = e; t.focus(); } }, e))));
}

async function abrirOrden(orden) {
  const capa = h("div", { class: "m-sheet-bg" });
  const hoja = h("div", { class: "m-sheet" }, cargando("Sofía está leyendo tu orden…"));
  capa.append(hoja);
  const cerrar = () => capa.remove();
  capa.addEventListener("click", (e) => { if (e.target === capa) cerrar(); });
  document.body.append(capa);
  try {
    const [prospectos, bandeja, citas, inventario] = await Promise.all([listLeads().then(soloClientes), inbox(), getAgenda(), salesInventory().catch(() => [])]);
    const r = interpretarOrden(orden, { prospectos, bandeja, citas, inventario });
    const elegidos = new Set(r.destinatarios.map((d) => d.clave));
    const msg = h("textarea", { class: "m-input", rows: 4 });
    msg.value = r.mensaje;
    const ejemplo = h("p", { class: "m-bubble out" });
    const pintarEjemplo = () => { ejemplo.textContent = mensajePara(msg.value, r.destinatarios[0] ?? { nombre: "Ana", modelo: modeloEn(orden) }); };
    msg.addEventListener("input", pintarEjemplo);
    pintarEjemplo();
    const boton = h("button", { class: "m-btn primary" });
    const contar = () => { boton.textContent = elegidos.size ? `Mandar a ${elegidos.size}` : "Elige al menos uno"; boton.disabled = !elegidos.size; };
    contar();
    const foto = r.foto ? inventario.find((a) => modeloEn(a.modelo) === r.foto && a.fotoId) : null;
    boton.onclick = async () => {
      const lista = r.destinatarios.filter((d) => elegidos.has(d.clave));
      if (!(await confirmBox("¿Mandar ahora?", `Sofía le va a escribir a ${lista.length} cliente(s) desde el WhatsApp de Mario, con unos segundos entre cada uno. No cierres esta pantalla hasta que termine.`, "Sí, mandar"))) return;
      boton.disabled = true;
      let ok = 0;
      for (const [i, d] of lista.entries()) {
        boton.textContent = `Mandando ${i + 1} de ${lista.length}…`;
        try {
          await sendMessage({ channel: "wa", to: d.id, text: mensajePara(msg.value, d), ...(foto ? { imageId: foto.fotoId } : {}) });
          ok++;
        } catch (e) { toast(`${d.nombre || d.id}: ${e.message}`, 4000); }
        if (i < lista.length - 1) await espera(8000 + Math.random() * 7000); // ritmo de persona: protege el número
      }
      toast(`Listo: Sofía le escribió a ${ok} de ${lista.length}.`, 5000);
      cerrar();
      rerender();
    };
    hoja.replaceChildren(
      h("div", { class: "m-between" }, h("h2", {}, "Lo que entendí"), h("button", { class: "m-icon", "aria-label": "Cerrar", onclick: cerrar }, "✕")),
      h("p", {}, h("b", {}, r.tipo === "cita" ? "Confirmar cita a: " : "Escribirle a: "), r.filtros.join(" · ")),
      r.avisoFoto ? h("p", { class: "m-warn" }, r.avisoFoto) : null,
      foto ? h("img", { class: "m-foto", src: fotoUrl(foto.fotoId), alt: `Foto de ${foto.modelo}` }) : null,
      h("label", { class: "m-label" }, "Mensaje ({nombre} se cambia por el nombre de cada uno)"), msg,
      h("label", { class: "m-label" }, "Así le llega al primero:"), ejemplo,
      r.destinatarios.length
        ? h("div", { class: "m-list m-scroll" }, r.destinatarios.map((d) => {
          const cb = h("input", { type: "checkbox", checked: true, onchange: () => { cb.checked ? elegidos.add(d.clave) : elegidos.delete(d.clave); contar(); } });
          return h("label", { class: "m-row" }, cb, h("div", { class: "m-grow" }, h("b", {}, d.nombre || `…${String(d.id).slice(-4)}`), h("span", { class: "m-dim" }, d.motivo || "")));
        }))
        : h("p", { class: "m-warn" }, "No encontré clientes con eso. Prueba con otro modelo, mes o «todos»."),
      r.destinatarios.length ? boton : null);
  } catch (e) { hoja.replaceChildren(h("p", {}, e.message), h("button", { class: "m-btn", onclick: cerrar }, "Cerrar")); }
}

// ───────── CHATS ─────────

export function renderChatsMario(root) {
  root.append(top("Chats"));
  const cuerpo = page();
  root.append(cuerpo);
  if (!connectorReady()) return sinConectar(cuerpo);
  let filtro = "todos";
  const lista = h("div", { class: "m-list" }, cargando());
  const chips = h("div", { class: "m-seg" });
  let bandeja = {};
  const pintar = () => {
    chips.replaceChildren(...[["todos", "Todos"], ["espera", "Esperando"], ["sofia", "Atiende Sofía"]].map(([k, l]) =>
      h("button", { class: `m-seg-b${filtro === k ? " on" : ""}`, onclick: () => { filtro = k; pintar(); } }, l)));
    const filas = Object.entries(bandeja).filter(([k]) => k.startsWith("wa:") && !k.endsWith(":0"))
      .filter(([, c]) => filtro === "todos" || (filtro === "espera" ? c.lastDir === "in" : !c.lastManualAt || new Date(c.lastManualAt) < new Date(c.lastAt) - 1800e3))
      .sort((a, b) => String(b[1].lastAt).localeCompare(String(a[1].lastAt)));
    lista.replaceChildren(...(filas.length ? filas.map(([k, c]) => filaChat(k, c)) : [h("p", { class: "m-dim m-center" }, "Sin chats aquí.")]));
  };
  cuerpo.append(chips, card(lista),
    h("button", { class: "m-btn", onclick: async (e) => { e.target.disabled = true; toast("Trayendo chats recientes de WhatsApp (no contesta a nadie)…"); try { await syncPendingChats(); bandeja = await inbox(); pintar(); toast("Listo"); } catch (err) { toast(err.message, 5000); } e.target.disabled = false; } }, "Traer chats de WhatsApp"));
  inbox().then((b) => { bandeja = b; pintar(); }).catch((e) => { lista.replaceChildren(); falla(lista, e); });
}

export function renderChatMario(root, clave) {
  const cuerpo = h("div", { class: "m-chat" });
  root.append(top("Chat", { back: "/chats" }), cuerpo);
  if (!connectorReady()) return sinConectar(cuerpo);
  const id = clave.split(":")[1];
  const burbujas = h("div", { class: "m-msgs" }, cargando());
  const cabeza = h("div", { class: "m-chat-head" });
  const texto = h("textarea", { class: "m-input", rows: 1, placeholder: "Escribe como Mario…" });
  const enviar = h("button", { class: "m-send", "aria-label": "Enviar" }, "➤");
  const sofia = h("button", { class: "m-btn small" }, "✨ Que conteste Sofía");
  let lead = null;
  const pintarCabeza = (c) => {
    cabeza.replaceChildren(
      h("div", { class: "m-grow" }, h("b", {}, nombreDe(c ?? lead, clave)), h("span", { class: "m-dim m-small" }, `+${id}${lead?.interes ? ` · ${lead.interes}` : ""}`),
        lead?.resumen ? h("span", { class: "m-dim m-small", style: "display:block" }, `🧠 ${lead.resumen}${lead.siguiente ? ` → ${lead.siguiente}` : ""}`) : null,
        lead ? h("button", { class: "m-btn small", style: "margin-top:4px", onclick: async () => {
          try { lead = await updateLead(clave, { personal: !lead.personal }); pintarCabeza(c); toast(lead.personal ? "Sofía ya no le contesta: es personal" : "Sofía lo atiende como cliente"); } catch (e) { toast(e.message); }
        } }, lead.personal ? "👥 Personal · cambiar a cliente" : "💼 Cliente · cambiar a personal") : null),
      h("div", { class: "m-temp" }, ["caliente", "tibio", "frio"].map((k) => h("button", {
        class: `m-chip${(lead?.calor ?? "") === k ? " on" : ""}`, title: CALOR[k][1],
        onclick: async () => { try { lead = await updateLead(clave, { calor: k }); pintarCabeza(c); toast(`Marcado ${CALOR[k][1].toLowerCase()}`); } catch (e) { toast(e.message); } },
      }, CALOR[k][0]))));
  };
  const cargar = async () => {
    const [msgs, bandeja, leads] = await Promise.all([conversation(clave), inbox(), lead ? Promise.resolve(null) : listLeads()]);
    if (leads) lead = leads.find((l) => l.clave === clave) ?? null;
    const c = bandeja[clave];
    pintarCabeza(c);
    const abajo = burbujas.scrollHeight - burbujas.scrollTop - burbujas.clientHeight < 80;
    burbujas.replaceChildren(...msgs.map((m) => h("div", { class: `m-bubble ${m.dir}${m.auto ? " auto" : ""}` },
      m.type === "image" ? h("span", { class: "m-dim" }, "📷 Foto ") : null,
      m.text || (m.type !== "text" && m.type !== "image" ? `(${m.type})` : ""),
      h("small", {}, `${m.dir === "out" ? (m.auto ? "Sofía · " : "Mario · ") : ""}${fmtWhen(m.at)}`))));
    if (abajo || !burbujas.dataset.listo) { burbujas.scrollTop = burbujas.scrollHeight; burbujas.dataset.listo = "1"; }
    sofia.hidden = c?.lastDir !== "in";
  };
  enviar.onclick = async () => {
    const t = texto.value.trim();
    if (!t) return;
    enviar.disabled = true;
    try { await sendMessage({ channel: "wa", to: id, text: t }); texto.value = ""; await cargar(); } catch (e) { toast(e.message, 5000); }
    enviar.disabled = false;
  };
  sofia.onclick = async () => {
    sofia.disabled = true;
    try { await replyToPending(clave); toast("Sofía contestó"); await cargar(); } catch (e) { toast(e.message, 5000); }
    sofia.disabled = false;
  };
  cuerpo.append(cabeza, burbujas, h("div", { class: "m-compose" }, sofia, h("div", { class: "m-orden" }, texto, enviar)));
  cargar().catch((e) => { burbujas.replaceChildren(); falla(burbujas, e); });
  const reloj = setInterval(() => { if (!document.body.contains(cuerpo)) return clearInterval(reloj); cargar().catch(() => {}); }, 10000);
}

// ───────── CLIENTES (cartera) ─────────

export function renderCarteraMario(root) {
  root.append(top("Clientes"));
  const cuerpo = page();
  root.append(cuerpo);
  if (!connectorReady()) return sinConectar(cuerpo);
  let col = "caliente";
  let buscar = "";
  let leads = [], bandeja = {};
  const seg = h("div", { class: "m-seg" });
  const lista = h("div", { class: "m-list" }, cargando());
  const q = h("input", { class: "m-input", type: "search", placeholder: "Buscar nombre, número o modelo", oninput: () => { buscar = q.value; pintar(); } });
  const pintar = () => {
    const cuenta = (k) => leads.filter((l) => (l.calor ?? "frio") === k).length;
    seg.replaceChildren(...["caliente", "tibio", "frio", "cerrado"].map((k) => h("button", { class: `m-seg-b${col === k ? " on" : ""}`, onclick: () => { col = k; pintar(); } }, `${CALOR[k][0]} ${CALOR[k][1]} ${cuenta(k)}`)));
    const b = buscar.trim().toLowerCase();
    const filas = leads.filter((l) => (b ? `${l.nombreCliente ?? ""} ${l.nombre ?? ""} ${l.id} ${l.interes ?? ""}`.toLowerCase().includes(b) : (l.calor ?? "frio") === col))
      .sort((a, c) => String(c.actualizado ?? c.at).localeCompare(String(a.actualizado ?? a.at)));
    lista.replaceChildren(...(filas.length ? filas.map((l) => {
      const c = bandeja[l.clave] ?? {};
      return h("div", { class: "m-row m-cliente" },
        h("button", { class: "m-grow m-plain", onclick: () => go(`/chat/${encodeURIComponent(l.clave)}`) },
          h("div", { class: "m-between" }, h("b", {}, l.nombreCliente || l.nombre || nombreDe(c, l.clave)), h("span", { class: "m-dim m-small" }, fmtWhen(c.lastAt || l.actualizado || l.at))),
          h("span", { class: "m-dim m-one" }, [l.interes, l.cita && `📅 ${l.cita}`, l.formaPago, l.enganche && `enganche ${money(l.enganche)}`].filter(Boolean).join(" · ") || c.lastText || l.primerMensaje || "")),
        h("div", { class: "m-temp" }, ["caliente", "tibio", "frio", "cerrado"].filter((k) => k !== (l.calor ?? "frio")).map((k) => h("button", {
          class: "m-chip", title: `Pasar a ${CALOR[k][1]}`,
          onclick: async () => { try { Object.assign(l, await updateLead(l.clave, { calor: k })); pintar(); } catch (e) { toast(e.message); } },
        }, CALOR[k][0]))));
    }) : [h("p", { class: "m-dim m-center" }, b ? "Nadie con eso." : "Nadie en esta columna todavía.")]));
  };
  cuerpo.append(q, seg, card(lista), h("p", { class: "m-dim m-small m-center" }, "Sofía acomoda sola a los clientes nuevos. Si tú mueves a alguien, ella ya no lo cambia."));
  Promise.all([listLeads().then(soloClientes), inbox()]).then(([l, b]) => { leads = l; bandeja = b; pintar(); }).catch((e) => { lista.replaceChildren(); falla(lista, e); });
}

// ───────── AUTOS ─────────

export function renderAutosMario(root) {
  root.append(top("Autos"));
  const cuerpo = page();
  root.append(cuerpo);
  if (!connectorReady()) return sinConectar(cuerpo);
  const lista = h("div", { class: "m-autos" }, cargando());
  cuerpo.append(h("p", { class: "m-dim" }, "Lo que ve Sofía para dar precios y mandar fotos. Precios de lista; si hay promo, ponla en la descripción."),
    h("button", { class: "m-btn primary", onclick: () => go("/auto/nuevo") }, "+ Agregar auto"), lista);
  salesInventory().then((autos) => {
    lista.replaceChildren(...(autos.length ? autos.map((a) => h("button", { class: `m-auto${a.disponible === false ? " off" : ""}`, onclick: () => go(`/auto/${a.id}`) },
      a.fotoId ? h("img", { src: fotoUrl(a.fotoId), alt: "", loading: "lazy" }) : h("div", { class: "m-auto-ph" }, "🚗"),
      h("div", {}, h("b", {}, [a.modelo, a.version].filter(Boolean).join(" ")), h("span", { class: "m-dim" }, `${a.anio || ""} · ${a.precio ? money(a.precio) : "sin precio"}${a.disponible === false ? " · no disponible" : ""}`))))
      : [h("p", { class: "m-dim m-center" }, "Todavía no hay autos.")]));
  }).catch((e) => { lista.replaceChildren(); falla(lista, e); });
}

export function renderAutoMario(root, id) {
  root.append(top(id === "nuevo" ? "Nuevo auto" : "Editar auto", { back: "/autos" }));
  const cuerpo = page(cargando());
  root.append(cuerpo);
  if (!connectorReady()) { cuerpo.replaceChildren(); return sinConectar(cuerpo); }
  salesInventory().then((autos) => {
    const a = autos.find((x) => x.id === id) ?? { id: `auto-${Date.now().toString(36)}`, marca: "Honda", modelo: "", version: "", anio: new Date().getFullYear() + 1, precio: 0, tipo: "nuevo", disponible: true };
    const campo = (label, el) => h("label", { class: "m-field" }, h("span", { class: "m-label" }, label), el);
    const modelo = h("select", { class: "m-input" }, ["", ...MODELOS.map(([m]) => m), "Otro"].map((m) => h("option", { value: m, selected: m === a.modelo }, m || "Elige…")));
    const version = h("input", { class: "m-input", value: a.version ?? "", placeholder: "Touring, Prime, i-Style…" });
    const anio = h("input", { class: "m-input", type: "number", value: a.anio || "" });
    const precio = h("input", { class: "m-input", inputmode: "numeric", value: a.precio || "", placeholder: "Precio de lista" });
    const desc = h("textarea", { class: "m-input", rows: 3, placeholder: "Equipamiento, colores, pasajeros… (ej. «7 pasajeros, híbrida, colores blanco y gris»). Sofía lo usa para contestar." });
    desc.value = a.descripcion ?? "";
    const promo = h("input", { class: "m-input", value: a.promo ?? "", placeholder: "Ej. «Bono de $30,000 este mes» o «Tasa 9.9% a 36 meses»" });
    const disp = h("input", { type: "checkbox", checked: a.disponible !== false });
    let fotoId = a.fotoId;
    const img = h("img", { class: "m-foto", alt: "", src: fotoUrl(fotoId), hidden: !fotoId });
    const archivo = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const f = archivo.files?.[0];
      if (!f) return;
      toast("Subiendo foto…");
      try { const r = await uploadCarPhoto(await blobToDataUrl(await shrinkImage(f, 1280, 0.85))); fotoId = r.fotoId; img.src = fotoUrl(fotoId); img.hidden = false; toast("Foto lista"); } catch (e) { toast(e.message, 5000); }
    } });
    const guardar = async () => {
      if (!modelo.value) return toast("Elige el modelo");
      const nuevo = { ...a, marca: "Honda", modelo: modelo.value, version: version.value.trim(), anio: Number(anio.value) || "", precio: Number(String(precio.value).replace(/[^\d]/g, "")) || 0, descripcion: desc.value.trim(), promo: promo.value.trim(), disponible: disp.checked, palabras: a.palabras ?? [], ...(fotoId ? { fotoId } : {}) };
      try { await saveInventory(autos.some((x) => x.id === a.id) ? autos.map((x) => (x.id === a.id ? nuevo : x)) : [...autos, nuevo]); toast("Guardado"); go("/autos"); } catch (e) { toast(e.message, 5000); }
    };
    const borrar = async () => {
      if (!(await confirmBox("¿Quitar este auto?", "Sofía ya no lo ofrecerá.", "Quitar"))) return;
      try { await saveInventory(autos.filter((x) => x.id !== a.id)); go("/autos"); } catch (e) { toast(e.message, 5000); }
    };
    cuerpo.replaceChildren(card(
      img, h("button", { class: "m-btn", onclick: () => archivo.click() }, fotoId ? "Cambiar foto" : "Agregar foto"), archivo,
      campo("Modelo", modelo), campo("Versión", version), h("div", { class: "m-grid2" }, campo("Año", anio), campo("Precio", precio)), campo("Qué trae (Sofía lo usa para contestar)", desc), campo("🎁 Promoción vigente (opcional)", promo),
      h("label", { class: "m-row" }, disp, h("span", {}, "Disponible (Sofía lo ofrece)")),
      h("button", { class: "m-btn primary", onclick: guardar }, "Guardar"),
      id !== "nuevo" ? h("button", { class: "m-btn danger", onclick: borrar }, "Quitar auto") : null));
  }).catch((e) => { cuerpo.replaceChildren(); falla(cuerpo, e); });
}

// ───────── AJUSTES DE SOFÍA ─────────

export function renderAjustesMario(root) {
  root.append(top("Sofía", { back: "/" }));
  const cuerpo = page();
  root.append(cuerpo);
  if (!connectorReady()) { sinConectar(cuerpo); cuerpo.append(card(h("button", { class: "m-btn", onclick: () => go("/mas") }, "Modo completo (avanzado)"))); return; }
  const estado = card(cargando());
  const ia = card(cargando());
  const conducta = card(cargando());
  cuerpo.append(estado, ia, conducta, card(h("p", { class: "m-dim" }, "Las pantallas de antes (placas, crédito, redes, conexiones Meta…) siguen aquí, por si las ocupas."), h("button", { class: "m-btn", onclick: () => go("/mas") }, "Modo completo (avanzado)")));
  (async () => {
    try {
      const [st, con, cfg] = await Promise.all([refreshStatus(), getConnection(), getAgentConfig()]);
      const motor = st.agente?.ventas?.ia?.motor;
      const linea = (ok, si, no) => h("p", {}, `${ok ? "🟢" : "🔴"} ${ok ? si : no}`);
      estado.replaceChildren(h("h2", {}, "Estado"),
        linea(true, "Conectada a la computadora de Mario", ""),
        linea(st.whatsapp?.ok, "WhatsApp de Mario vinculado", "WhatsApp desconectado: revisa la ventana en la computadora"),
        linea(Boolean(motor), `IA de apoyo: ${(st.agente?.ventas?.ia?.motores ?? [motor]).map((m) => ({ cloudflare: "Cloudflare", local: "IA local", claude: "Claude" })[m] ?? m).join(" + ")}`, "Sin IA: contesta con su cerebro de reglas"),
        linea(cfg.activo && cfg.ventas?.activo, "Contestando sola", "Respuestas automáticas apagadas"));
      // IA de Cloudflare
      const cuenta = h("input", { class: "m-input", value: con.valores?.CF_ACCOUNT_ID ?? "", autocomplete: "off", placeholder: "Account ID (32 letras y números)" });
      const llave = h("input", { class: "m-input", type: "password", autocomplete: "off", placeholder: con.configurado?.CF_API_TOKEN ? "✓ guardado (escribe solo para cambiarlo)" : "API token de Workers AI" });
      const salida = h("p", { class: "m-dim" });
      const localUrl = h("input", { class: "m-input", value: con.valores?.LOCAL_AI_URL ?? "", inputmode: "url", autocomplete: "off", placeholder: "https://…trycloudflare.com o http://192.168.1.50:11434" });
      const localModelo = h("input", { class: "m-input", value: con.valores?.LOCAL_AI_MODEL ?? "", autocomplete: "off", placeholder: "Modelo (qwen2.5:3b)" });
      const salidaLocal = h("p", { class: "m-dim" });
      ia.replaceChildren(h("h2", {}, "🧠 IA (Cloudflare, gratis)"),
        h("p", { class: "m-dim" }, "En dash.cloudflare.com: Workers AI → copia el Account ID. Tu perfil → API Tokens → Create Token → plantilla «Workers AI»."),
        cuenta, llave,
        h("button", { class: "m-btn primary", onclick: async () => {
          const datos = {};
          if (cuenta.value.trim() !== (con.valores?.CF_ACCOUNT_ID ?? "")) datos.CF_ACCOUNT_ID = cuenta.value.trim();
          if (llave.value.trim()) datos.CF_API_TOKEN = llave.value.trim();
          salida.textContent = "Guardando y probando…";
          try {
            if (Object.keys(datos).length) await saveConnection(datos);
            await testCloudflareAI();
            if (!cfg.ventas?.ia) await setAgentConfig({ ...cfg, ventas: { ...cfg.ventas, ia: true } });
            salida.textContent = "✅ Listo: Sofía ya contesta con IA.";
            llave.value = "";
          } catch (e) { salida.textContent = `❌ ${e.message}`; }
        } }, "Guardar y probar"), salida,
        // IA local en otro equipo (Ollama)
        h("h2", { style: "margin-top:18px" }, "💻 IA local (otro equipo con Ollama)"),
        h("p", { class: "m-dim" }, "Ordena y resume todos los chats en segundo plano, aprende de cómo contestas y suple a Cloudflare si se acaba su cuota del día. Pega el link del túnel (https://….trycloudflare.com) o la IP de la red (http://192.168.x.x:11434)."),
        localUrl, localModelo,
        h("button", { class: "m-btn primary", onclick: async () => {
          const datos = {};
          if (localUrl.value.trim() !== (con.valores?.LOCAL_AI_URL ?? "")) datos.LOCAL_AI_URL = localUrl.value.trim();
          if (localModelo.value.trim() !== (con.valores?.LOCAL_AI_MODEL ?? "")) datos.LOCAL_AI_MODEL = localModelo.value.trim();
          salidaLocal.textContent = "Guardando y probando (la primera vez puede tardar ~1 min)…";
          try {
            if (Object.keys(datos).length) await saveConnection(datos);
            if (!localUrl.value.trim()) { salidaLocal.textContent = "IA local quitada."; return; }
            const r = await testLocalAI();
            if (!cfg.ventas?.ia) await setAgentConfig({ ...cfg, ventas: { ...cfg.ventas, ia: true } });
            salidaLocal.textContent = `✅ Conectada (${r.modelo}, contestó en ${r.segundos} s).`;
          } catch (e) { salidaLocal.textContent = `❌ ${e.message}`; }
        } }, "Guardar y probar"), salidaLocal);
      // Conducta
      const activo = h("input", { type: "checkbox", checked: Boolean(cfg.activo && cfg.ventas?.activo) });
      const conIa = h("input", { type: "checkbox", checked: Boolean(cfg.ventas?.ia) });
      const direccion = h("input", { class: "m-input", value: cfg.direccion ?? "", placeholder: "Ej. Av. Constitución 123, Col. Centro, Monterrey" });
      const mapa = h("input", { class: "m-input", value: cfg.mapa ?? "", inputmode: "url", placeholder: "Link de Google Maps (https://maps.app.goo.gl/…)" });
      const seguir = h("input", { type: "checkbox", checked: cfg.ventas?.seguimiento !== false });
      const resumen = h("input", { type: "checkbox", checked: cfg.ventas?.resumenDiario !== false });
      const pausa = h("select", { class: "m-input" }, [[0, "No se calla"], [10, "10 minutos"], [30, "30 minutos"], [60, "1 hora"]].map(([v, l]) => h("option", { value: v, selected: Number(cfg.pausaMinutos) === v }, l)));
      conducta.replaceChildren(h("h2", {}, "Cómo trabaja"),
        h("label", { class: "m-row" }, activo, h("span", {}, "Sofía contesta sola a los clientes")),
        h("label", { class: "m-row" }, conIa, h("span", {}, "Usar IA cuando esté conectada")),
        h("label", { class: "m-row" }, seguir, h("span", {}, "Seguimiento: escribirle al día siguiente y a los 3 días a quien se quedó callado")),
        h("label", { class: "m-row" }, resumen, h("span", {}, "Resumen del día a las 9 am en mi chat «Tú»")),
        h("label", { class: "m-field" }, h("span", { class: "m-label" }, "Si Mario contesta a mano, Sofía se calla en ese chat"), pausa),
        h("label", { class: "m-field" }, h("span", { class: "m-label" }, "📍 Dirección de la agencia (la manda cuando preguntan «¿dónde están?»)"), direccion),
        h("label", { class: "m-field" }, h("span", { class: "m-label" }, "Link de Google Maps"), mapa),
        h("button", { class: "m-btn", onclick: async () => {
          if (mapa.value.trim() && !/^https:\/\/\S+$/.test(mapa.value.trim())) return toast("El link del mapa debe empezar con https://");
          try { await setAgentConfig({ ...cfg, activo: activo.checked, pausaMinutos: Number(pausa.value), direccion: direccion.value.trim(), mapa: mapa.value.trim(), ventas: { ...cfg.ventas, activo: activo.checked, ia: conIa.checked, seguimiento: seguir.checked, resumenDiario: resumen.checked } }); toast("Guardado"); } catch (e) { toast(e.message, 5000); }
        } }, "Guardar"));
    } catch (e) { estado.replaceChildren(); falla(estado, e); }
  })();
}
