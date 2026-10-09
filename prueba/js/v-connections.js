// Más → Conexiones: IA real, servidor/conector, WhatsApp Business y Facebook, con su estado verdadero.
import { h, toast, fmtWhen } from "./util.js";
import { state, save, serverPeek, serverBase, isAppsScript } from "./store.js";
import { header, section, btn, rerender, field, input, select, chip, go } from "./ui.js";
import { MODELS, testConnection, aiReady } from "./ai.js";
import { connectorReady, refreshStatus, lastStatus, sendMessage, waTemplates } from "./connector.js";

const GUIDE = "https://github.com/creoqisaac-cloud/Sofia/blob/claude/focused-gauss-q4hxvr/prueba/CONEXIONES.md";
const pill = (ok, okText, noText) => h("div", {}, chip(ok ? `● ${okText}` : `○ ${noText}`, ok ? "ok" : "off"));

export function renderConnections(root) {
  root.append(
    header("Conexiones", { back: "/mas" }),
    h("div", { class: "page" },
      h("p", { class: "muted" }, "Sofía funciona sin nada de esto. Cada conexión agrega poder real: IA para leer INE y escribir como tú, WhatsApp y Facebook para atender y publicar desde aquí."),
      aiCard(),
      serverCard(),
      waCard(),
      fbCard(),
      h("p", { class: "muted small" }, "Guía paso a paso (cuentas de Meta, tokens y servidor gratis): ", h("a", { href: GUIDE, target: "_blank", rel: "noopener" }, "CONEXIONES.md"))));
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
  return section("Inteligencia artificial (Claude)",
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
    h("div", { class: "stack-s" }, pill(Boolean(connectorReady() && st), "Conectado", serverBase() ? (isAppsScript() ? "Solo respaldo (Google)" : "Sin probar") : "Sin conectar"), h("span", { class: "muted small" }, "Respaldo en la nube y puente con WhatsApp/Facebook. Gratis en Cloudflare, o tu propia computadora/hosting.")),
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
  return section("Facebook (página y Messenger)",
    h("div", { class: "stack-s" }, pill(Boolean(st?.ok), st?.name ?? "Conectada", st?.configured ? "Token con error" : "Sin configurar"), h("span", { class: "muted small" }, "Publicar en tu página, contestar Messenger y preparar anuncios con IA.")),
    st?.error ? h("p", { class: "warn small" }, `Meta dice: ${st.error}`) : null,
    st?.ok ? btn("Ir a Redes", () => go("/redes"), "small") : null);
}
