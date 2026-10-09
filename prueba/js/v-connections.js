// Más → Conexiones: Google (gratis: datos, Gmail, Calendar, lector), servidor/conector, WhatsApp Business,
// Facebook/Instagram e IA opcional, cada uno con su estado verdadero.
import { h, toast, fmtWhen, modal } from "./util.js";
import { state, save, serverPeek, serverPull, serverBase, isAppsScript } from "./store.js";
import { header, section, btn, rerender, field, input, select, chip, go } from "./ui.js";
import { MODELS, testConnection, aiReady } from "./ai.js";
import { connectorReady, refreshStatus, lastStatus, sendMessage, waTemplates } from "./connector.js";
import { googleReady, googleStatus, lastGoogleStatus, setEmailConfig, saveEvent, deleteEvent } from "./google.js";

const GUIDE = "https://github.com/creoqisaac-cloud/Sofia/blob/claude/focused-gauss-q4hxvr/prueba/CONEXIONES.md";
const GOOGLE_GUIDE = "https://github.com/creoqisaac-cloud/Sofia/blob/claude/focused-gauss-q4hxvr/prueba/servidor/google/LEEME.md";
const pill = (ok, okText, noText) => h("div", {}, chip(ok ? `● ${okText}` : `○ ${noText}`, ok ? "ok" : "off"));

export function renderConnections(root) {
  root.append(
    header("Conexiones", { back: "/mas" }),
    h("div", { class: "page" },
      h("p", { class: "muted" }, "Sofía funciona sin nada de esto. Todo lo de abajo es GRATIS excepto la IA, que es un extra opcional."),
      googleCard(),
      serverCard(),
      waCard(),
      fbCard(),
      aiCard(),
      h("p", { class: "muted small" }, "Guía paso a paso (cuentas de Meta, tokens y servidor gratis): ", h("a", { href: GUIDE, target: "_blank", rel: "noopener" }, "CONEXIONES.md"))));
}

// ───────── Google (gratis) ─────────

function googleCard() {
  const g = state.settings.google; // solo para mostrar: al conectar se escribe en state.settings.google
  const st = lastGoogleStatus();
  const url = input({ type: "url", placeholder: "https://script.google.com/macros/s/…/exec", value: g.url ?? "" });
  const token = input({ type: "password", autocomplete: "off", value: g.token ?? "" });
  const out = h("p", { class: "small", role: "status" });
  const correo = st?.correo ?? {};
  const auto = h("input", { type: "checkbox", checked: Boolean(correo.seguimientoAuto) });
  const dias = input({ type: "number", min: "1", max: "30", value: correo.dias ?? 3, style: "max-width:90px" });
  const connect = async (e) => {
    const b = e.currentTarget;
    state.settings.google = { ...state.settings.google, url: url.value.trim(), token: token.value.trim() };
    save();
    b.disabled = true;
    out.className = "small";
    out.textContent = "Probando tu cuenta de Google…";
    try {
      const primera = !st;
      const r = await googleStatus();
      toast(`Google conectado: ${r.cuenta ?? "tu cuenta"}`);
      // Sin conector, Google guarda el respaldo: se enciende solo la primera vez (luego manda el interruptor).
      // Si tu Drive ya tiene datos (otro teléfono), primero se ofrece traerlos para no taparlos con este.
      if (primera && !serverBase()) {
        const m = await serverPeek().catch(() => ({}));
        if (m.updatedAt && !state.settings.server.lastSync) {
          modal("Ya hay datos en tu Drive", h("p", {}, `Hay un respaldo del ${fmtWhen(m.updatedAt)}. ¿Traerlo a este dispositivo? Si no, el respaldo automático queda apagado para no taparlo.`), [
            { label: "Ahora no" },
            { label: "Traer", kind: "primary", onClick: async () => { try { await serverPull(); state.settings.server.auto = true; save(); toast("Datos traídos de tu Drive"); rerender(); } catch (err) { toast(err.message, 6000); return false; } } },
          ]);
        } else { state.settings.server.auto = true; save(); }
      }
      rerender();
    } catch (err) { out.className = "small warn"; out.textContent = err.message; }
    finally { b.disabled = false; }
  };
  const testCalendar = async () => {
    try {
      const id = await saveEvent({ title: "Prueba de Sofía", description: "Si te llegó el aviso, los recordatorios funcionan. Puedes borrarlo.", at: new Date(Date.now() + 10 * 60000).toISOString(), alerts: [5] });
      toast("Listo: en 5 minutos te debe sonar el aviso de Google Calendar.", 6000);
      setTimeout(() => deleteEvent(id).catch(() => {}), 20 * 60000);
    } catch (err) { toast(err.message, 6000); }
  };
  return section("Google (gratis): datos, correo, recordatorios y lector",
    h("div", { class: "stack-s" }, pill(googleReady() && Boolean(st), st?.cuenta ?? "Conectado", googleReady() ? "Sin probar" : "Sin conectar"),
      h("span", { class: "muted small" }, "Tu propia cuenta de Google hace de servidor, sin pagar nada: respaldo en Drive, el agente de correo de placas envía desde tu Gmail y da seguimiento solo, los recordatorios suenan en tu iPhone con Google Calendar y Google Drive lee las INE como segunda opinión.")),
    field("Dirección del script (…/exec)", url, h("span", {}, "Cómo crearlo en 10 minutos: ", h("a", { href: GOOGLE_GUIDE, target: "_blank", rel: "noopener" }, "guía de Google"))),
    field("Clave", token),
    h("div", { class: "row wrap gap-s" },
      btn(googleReady() && st ? "Volver a probar" : "Conectar y probar", connect, "primary"),
      googleReady() && st ? btn("Probar recordatorio", testCalendar, "ghost") : null),
    out,
    st ? h("ul", { class: "checks" },
      h("li", { class: "ok" }, `Cuenta: ${st.cuenta ?? "—"}`),
      h("li", { class: st.servicios?.correo === false ? "bad" : "ok" }, `Gmail${correo.cuotaRestante !== undefined ? ` · te quedan ${correo.cuotaRestante} correos hoy` : ""}`),
      h("li", { class: st.servicios?.calendario === false ? "bad" : "ok" }, "Google Calendar (calendario «Sofía»)"),
      h("li", { class: st.servicios?.ocr === false ? "bad" : "ok" }, st.servicios?.ocr === false ? "Lector de Google Drive: falta activar el servicio «Drive API» en el script (ver guía)" : "Lector de Google Drive para INE"),
      h("li", { class: "info" }, `Revisado ${fmtWhen(st.at)}${st.version ? ` · ${st.version}` : ""}`)) : null,
    st && !serverBase() ? h("label", { class: "row gap-s small" },
      h("input", { type: "checkbox", checked: state.settings.server.auto, onchange: (e) => { state.settings.server.auto = e.target.checked; save(); } }),
      h("span", {}, "Respaldar automáticamente en tu Drive al salir de la app")) : null,
    st ? h("div", { class: "stack-s" },
      h("h3", {}, "Agente de correo (placas)"),
      h("label", { class: "row gap-s small" }, auto, h("span", {}, "Si la gestoría no contesta, mandar seguimiento automático después de")), h("div", { class: "row gap-s" }, dias, h("span", { class: "small muted" }, "días")),
      btn("Guardar agente de correo", async () => {
        try { await setEmailConfig({ seguimientoAuto: auto.checked, dias: Number(dias.value) || 3 }); await googleStatus(); toast(auto.checked ? "Agente de correo activo: revisa cada hora aunque Sofía esté cerrada." : "Seguimiento automático apagado"); rerender(); }
        catch (err) { toast(err.message, 6000); }
      }, "small")) : null);
}

// ───────── IA ─────────

function aiCard() {
  const ai = state.settings.ai;
  const key = input({ type: "password", autocomplete: "off", placeholder: "sk-ant-…", value: ai.apiKey ?? "" });
  const model = select(MODELS, ai.model || MODELS[0][0]);
  const out = h("p", { class: "small", role: "status" });
  const connect = async (e) => {
    const b = e.currentTarget;
    if (!key.value.trim()) { out.textContent = "Pega tu llave de API."; return; }
    b.disabled = true;
    out.textContent = "Probando conexión con Anthropic…";
    try {
      const r = await testConnection(key.value.trim(), model.value);
      Object.assign(ai, { apiKey: key.value.trim(), model: model.value, enabled: true, connectedAt: new Date().toISOString(), modelName: r.name });
      save();
      toast(`IA conectada: ${r.name}`);
      rerender();
    } catch (err) {
      out.textContent = err.message;
      out.className = "small warn";
    } finally { b.disabled = false; }
  };
  const ineToggle = h("input", { type: "checkbox", checked: ai.ine !== false, onchange: (e) => { ai.ine = e.target.checked; save(); } });
  return section("Inteligencia artificial (opcional, de pago)",
    h("div", { class: "stack-s" }, pill(aiReady(), `Conectada${ai.modelName ? ` · ${ai.modelName}` : ""}`, "Sin conectar"), h("span", { class: "muted small" }, "Lee INE con precisión, aprende tu estilo, redacta respuestas, plantillas por cliente y publicaciones.")),
    field("Llave de API de Anthropic", key, h("span", {}, "Créala en ", h("a", { href: "https://console.anthropic.com/settings/keys", target: "_blank", rel: "noopener" }, "console.anthropic.com → API keys"), ". Se guarda solo en este dispositivo.")),
    field("Calidad", model),
    h("div", { class: "row wrap gap-s" },
      btn(aiReady() ? "Guardar y volver a probar" : "Conectar y probar", connect, "primary"),
      aiReady() ? btn("Desconectar", () => { Object.assign(ai, { enabled: false, apiKey: "", connectedAt: null }); save(); rerender(); }, "ghost") : null),
    out,
    aiReady() ? h("label", { class: "row gap-s small" }, ineToggle, h("span", {}, "Usar IA para leer INE (la foto se envía a Anthropic solo para leerla)")) : null,
    ai.usedAt ? h("p", { class: "muted small" }, `Último uso: ${fmtWhen(ai.usedAt)}`) : null);
}

// ───────── Servidor / conector ─────────

function serverCard() {
  const sv = state.settings.server;
  const url = input({ type: "url", placeholder: "https://sofia-conector.tu-cuenta.workers.dev", value: serverBase() });
  const token = input({ type: "password", autocomplete: "off", value: sv.token ?? "" });
  const auto = h("input", { type: "checkbox", checked: sv.auto, onchange: (e) => { sv.auto = e.target.checked; save(); } });
  const out = h("p", { class: "small", role: "status" });
  const st = lastStatus();
  return section("Servidor (conector)",
    h("div", { class: "stack-s" }, pill(Boolean(connectorReady() && st), "Conectado", serverBase() ? (isAppsScript() ? "Es Google: ponlo en la tarjeta de Google" : "Sin probar") : "Sin conectar"), h("span", { class: "muted small" }, "Necesario solo para WhatsApp Business, Messenger, Facebook e Instagram (Meta exige un servidor HTTPS para avisar de mensajes). Gratis en Cloudflare, o tu computadora/hosting. Aquí corren los agentes automáticos aunque Sofía esté cerrada.")),
    field("Dirección", url),
    field("Clave", token),
    h("label", { class: "row gap-s small" }, auto, h("span", {}, "Respaldar automáticamente al salir de la app")),
    h("div", { class: "row wrap gap-s" },
      btn("Conectar y probar", async (e) => {
        const b = e.currentTarget;
        sv.url = url.value.trim();
        sv.token = token.value.trim();
        save();
        b.disabled = true;
        out.className = "small";
        out.textContent = "Probando…";
        try {
          if (isAppsScript()) {
            const m = await serverPeek();
            toast(m.updatedAt ? `Conectado (Google). Datos del ${fmtWhen(m.updatedAt)}` : "Conectado a Google. Aún sin datos.");
          } else {
            const s = await refreshStatus();
            toast(`Conectado · WhatsApp ${s.whatsapp.ok ? "✓" : "—"} · Facebook ${s.facebook.ok ? "✓" : "—"}`);
          }
          rerender();
        } catch (err) { out.className = "small warn"; out.textContent = err.message; }
        finally { b.disabled = false; }
      }, "primary"),
      btn("Respaldo y restauración", () => go("/ajustes"), "ghost")),
    out,
    st?.at ? h("p", { class: "muted small" }, `Revisado ${fmtWhen(st.at)} · ${st.version ?? ""}`) : null);
}

// ───────── WhatsApp ─────────

function waCard() {
  const st = lastStatus()?.whatsapp;
  const hook = lastStatus()?.webhook;
  const to = input({ type: "tel", placeholder: "Tu celular para la prueba (10 dígitos)" });
  return section("WhatsApp Business (API oficial de Meta)",
    h("div", { class: "stack-s" }, pill(Boolean(st?.ok), st?.phone ? `${st.phone}` : "Conectado", st?.configured ? "Token con error" : "Sin configurar"), h("span", { class: "muted small" }, "Recibir y contestar mensajes desde Sofía, con borradores de IA en tu estilo.")),
    st?.error ? h("p", { class: "warn small" }, `Meta dice: ${st.error}`) : null,
    st?.ok ? h("p", { class: "small" }, `Número: ${st.phone} · Nombre: ${st.name ?? "—"}${st.quality ? ` · Calidad: ${st.quality}` : ""}`) : null,
    hook ? h("p", { class: "muted small" }, hook.last ? `Último aviso de Meta recibido ${fmtWhen(hook.last.at)}` : hook.secret && hook.verifyToken ? "Webhook listo; aún no llega ningún mensaje." : "Falta META_APP_SECRET / META_VERIFY_TOKEN en el servidor.") : null,
    st?.ok ? h("div", { class: "row gap-s" }, to, btn("Enviar prueba", async () => {
      try {
        // hello_world existe en toda cuenta nueva; sirve aunque no haya conversación abierta.
        const tpl = (await waTemplates().catch(() => [])).find((t) => t.name === "hello_world");
        await sendMessage({ channel: "wa", to: `52${to.value.replace(/\D/g, "").slice(-10)}`, template: { name: "hello_world", lang: tpl?.language ?? "en_US", preview: "Plantilla de prueba hello_world" } });
        toast("Enviado. Revisa tu WhatsApp.");
      } catch (e) { toast(e.message, 6000); }
    }, "small")) : h("p", { class: "muted small" }, connectorReady() ? "Agrega los datos de Meta al servidor (ver guía) y vuelve a probar." : "Primero conecta el servidor."));
}

// ───────── Facebook ─────────

function fbCard() {
  const st = lastStatus()?.facebook;
  const ig = lastStatus()?.instagram;
  const prog = lastStatus()?.programadas;
  return section("Facebook e Instagram",
    h("div", { class: "stack-s" }, pill(Boolean(st?.ok), st?.name ?? "Conectada", st?.configured ? "Token con error" : "Sin configurar"), h("span", { class: "muted small" }, "Publicar (o programar) en tu página e Instagram, contestar Messenger y preparar anuncios.")),
    st?.error ? h("p", { class: "warn small" }, `Meta dice: ${st.error}`) : null,
    h("p", { class: "small" }, "Instagram: ", ig?.ok ? `@${ig.username ?? ig.name ?? "conectado"}` : ig?.configured ? `con error${ig.error ? ` (${ig.error})` : ""}` : "sin configurar (IG_USER_ID)"),
    prog ? h("p", { class: "muted small" }, `Publicaciones programadas: ${prog.pendientes ?? 0} pendientes${prog.conError ? ` · ${prog.conError} con error` : ""}`) : null,
    st?.ok ? btn("Ir a Redes", () => go("/redes"), "small") : null);
}
