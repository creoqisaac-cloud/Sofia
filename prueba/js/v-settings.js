// Ajustes: perfil, placas, IA opcional, servidor propio opcional, respaldo y comentarios.
import { h, toast, download, confirmBox, fmtWhen, inDays } from "./util.js";
import { state, save, exportAll, importAll, resetAll, serverPush, serverPull, serverPeek, addCustomer, setFollowUp, DEFAULT_PLATE_REQS } from "./store.js";
import { header, section, btn, rerender, field, input, textarea, go } from "./ui.js";
import { aiWrite } from "./ai.js";
import { deliverFiles, isNative, openExternal } from "./native.js";

export const VERSION = "prueba-1.0";

export function renderSettings(root) {
  const s = state.settings;
  const bind = (obj, key, attrs = {}) => input({ value: obj[key] ?? "", ...attrs, onchange: (e) => { obj[key] = e.target.value.trim(); save(); toast("Guardado"); } });

  const reqs = textarea({ rows: 7, onchange: (e) => { s.platesRequirements = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); save(); toast("Lista guardada"); } }, s.platesRequirements.join("\n"));

  const aiOn = h("input", { type: "checkbox", checked: s.ai.enabled, onchange: (e) => { s.ai.enabled = e.target.checked; save(); rerender(); } });
  const srvAuto = h("input", { type: "checkbox", checked: s.server.auto, onchange: (e) => { s.server.auto = e.target.checked; save(); } });
  const restoreInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!(await confirmBox("Restaurar respaldo", "Se reemplazarán los datos de este dispositivo por los del respaldo.", "Restaurar"))) return;
      await importAll(data);
      toast("Respaldo restaurado");
      go("/");
    } catch (err) { toast(err.message ?? "Archivo inválido"); }
  } });

  root.append(
    header("Ajustes"),
    h("div", { class: "page" },
      section("Tu perfil",
        h("p", { class: "muted small" }, "Se usa en mensajes, correos y en la solicitud de crédito."),
        h("div", { class: "grid2" },
          field("Tu nombre", bind(s, "advisorName", { placeholder: "Nombre del asesor" })),
          field("Agencia", bind(s, "agency", { placeholder: "Nombre de la agencia" })),
          field("Tu teléfono", bind(s, "advisorPhone", { type: "tel" })),
          field("Tu correo", bind(s, "advisorEmail", { type: "email" })))),

      section("Placas",
        field("Correo de la gestoría", bind(s, "platesEmail", { type: "email", placeholder: "gestoria@agencia.com" })),
        field("Documentos que pide la gestoría (uno por renglón)", reqs),
        btn("Restaurar lista original", () => { s.platesRequirements = [...DEFAULT_PLATE_REQS]; save(); rerender(); }, "small ghost")),

      section("Asistente con IA (opcional)",
        h("p", { class: "muted small" }, "Sofía funciona completa SIN IA: plantillas, sugerencias por etapa, respuestas por tema, lectura de INE y análisis son reglas fijas en el dispositivo. Si activas la IA, aparece «✨ Mejorar con IA» en WhatsApp. Usa tu propia llave de Anthropic (console.anthropic.com); se guarda solo en este dispositivo y nunca se sube al servidor ni a respaldos."),
        h("label", { class: "row gap-s" }, aiOn, h("span", {}, "Activar IA")),
        s.ai.enabled ? h("div", { class: "stack-s" },
          field("Llave de API", bind(s.ai, "apiKey", { type: "password", autocomplete: "off", placeholder: "sk-ant-…" })),
          field("Modelo", bind(s.ai, "model", { placeholder: "claude-opus-5-5" })),
          btn("Probar IA", async () => {
            try { toast(`IA: ${await aiWrite({ draft: "Hola, ¿sigues interesado en el auto?", goal: "prueba" })}`, 6000); } catch (e) { toast(e.message, 5000); }
          }, "small")) : null),

      section("Servidor propio (opcional)",
        h("p", { class: "muted small" }, "Sin servidor, todo se guarda en este dispositivo. Con un servidor (tu computadora, Google Apps Script gratis o cualquier hosting) puedes respaldar y usar varios dispositivos. Instrucciones en la carpeta «servidor»."),
        field("Dirección del servidor", bind(s.server, "url", { type: "url", placeholder: "https://script.google.com/macros/s/…/exec" })),
        field("Clave", bind(s.server, "token", { type: "password", autocomplete: "off" })),
        h("label", { class: "row gap-s" }, srvAuto, h("span", {}, "Guardar en el servidor automáticamente al salir de la app")),
        s.server.lastSync ? h("p", { class: "muted small" }, `Última sincronización: ${fmtWhen(s.server.lastSync)}`) : null,
        h("div", { class: "row wrap gap-s" },
          btn("Probar", async () => { try { const m = await serverPeek(); toast(m.updatedAt ? `Conectado. Datos del ${fmtWhen(m.updatedAt)}` : "Conectado. El servidor está vacío."); } catch (e) { toast(e.message, 5000); } }, "small"),
          btn("Subir ahora", async () => { try { await serverPush(); toast("Datos guardados en el servidor"); rerender(); } catch (e) { toast(e.message, 5000); } }, "small"),
          btn("Traer del servidor", async () => {
            if (!(await confirmBox("Traer del servidor", "Se reemplazarán los datos de este dispositivo por los del servidor.", "Traer"))) return;
            try { const r = await serverPull(); toast(r.empty ? "El servidor no tiene datos todavía." : "Datos actualizados desde el servidor"); go("/"); } catch (e) { toast(e.message, 5000); }
          }, "small ghost"))),

      section("Respaldo",
        h("p", { class: "muted small" }, "Descarga un archivo con todo (clientes, recordatorios, documentos). Guárdalo en Drive o mándatelo por correo."),
        restoreInput,
        h("div", { class: "row wrap gap-s" },
          btn("Descargar respaldo", async () => {
            const data = await exportAll();
            data.state = structuredClone(data.state);
            data.state.settings.ai.apiKey = "";
            const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
            const name = `sofia-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
            if (isNative()) await deliverFiles([{ blob, name }], { title: "Respaldo de Sofía" }); else download(blob, name);
          }, "small primary"),
          btn("Restaurar respaldo", () => restoreInput.click(), "small ghost"))),

      feedbackSection(),

      section("Prueba",
        h("div", { class: "row wrap gap-s" },
          btn("Cargar clientes de ejemplo", () => { loadSamples(); toast("Se agregaron 3 clientes de ejemplo"); go("/"); }, "small ghost"),
          btn("Borrar todos los datos", async () => {
            if (!(await confirmBox("Borrar todo", "Se borra TODO lo guardado en este dispositivo. Descarga un respaldo antes si lo necesitas.", "Borrar todo"))) return;
            await resetAll();
            toast("Datos borrados");
            go("/");
          }, "small danger")),
        h("p", { class: "muted small" }, `Sofía ${VERSION} · Funciona sin internet una vez abierta. ${isNative() ? "App Android." : "En iPhone: Compartir → Agregar a pantalla de inicio."}`))));
}

function feedbackSection() {
  const s = state.settings;
  const list = state.feedback;
  const compose = () => [
    `Comentarios de la prueba de Sofía (${s.advisorName || "usuario"}${s.agency ? `, ${s.agency}` : ""}):`,
    ...list.map((f) => `• [${new Date(f.at).toLocaleString("es-MX")} · ${f.screen}] ${f.text}`),
  ].join("\n");
  const to = input({ value: s.feedbackTo ?? "", placeholder: "Correo o WhatsApp de quien recibe los comentarios", onchange: (e) => { s.feedbackTo = e.target.value.trim(); save(); } });
  return section(`Comentarios de la prueba (${list.length})`,
    h("p", { class: "muted small" }, "Usa el botón 💬 de cualquier pantalla para anotar lo que falta o no te gusta. Aquí se juntan para mandarlos."),
    list.length ? h("ul", { class: "timeline" }, list.slice(0, 10).map((f) => h("li", {}, h("span", { class: "muted small" }, `${fmtWhen(f.at)} · ${f.screen}`), h("div", { class: "pre" }, f.text)))) : null,
    field("Enviar a", to),
    h("div", { class: "row wrap gap-s" },
      btn("Enviar comentarios", async () => {
        if (!list.length) { toast("Aún no hay comentarios."); return; }
        const text = compose();
        const dest = to.value.trim();
        const digits = dest.replace(/\D/g, "");
        if (dest.includes("@")) openExternal(`mailto:${dest}?subject=${encodeURIComponent("Comentarios prueba Sofía")}&body=${encodeURIComponent(text)}`);
        else if (digits.length >= 10) openExternal(`https://wa.me/${digits.length === 10 ? `52${digits}` : digits}?text=${encodeURIComponent(text)}`);
        else if (navigator.share) await navigator.share({ title: "Comentarios prueba Sofía", text }).catch(() => {});
        else { await navigator.clipboard?.writeText(text); toast("Comentarios copiados"); }
      }, "small primary")));
}

function loadSamples() {
  const a = addCustomer({ name: "Ana Prueba López (EJEMPLO)", phone: "8100000001", vehicle: "CR-V Touring", stage: "cotizacion", source: "piso", notes: "Quiere cotización a 48 meses. Dato de ejemplo." });
  setFollowUp(a.id, new Date(Date.now() - 3600000));
  const b = addCustomer({ name: "Beto Ejemplo Ruiz (EJEMPLO)", phone: "8100000002", vehicle: "City Sport", stage: "nuevo", source: "whatsapp" });
  setFollowUp(b.id, inDays(0, 18));
  const c = addCustomer({ name: "Carla Demo Pérez (EJEMPLO)", phone: "8100000003", vehicle: "HR-V Prime", stage: "vendido", source: "referido" });
  c.plates = { status: "documentos", vin: "", to: state.settings.platesEmail, docs: { "Factura del vehículo": true, "INE del titular": true }, startedAt: new Date().toISOString() };
  setFollowUp(c.id, inDays(2));
}
