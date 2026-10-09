// Trámite de placas: checklist de documentos, correo a la gestoría con adjuntos y seguimiento.
// Con Google conectado, el AGENTE DE CORREO (gratis) envía desde el Gmail del asesor, lee las respuestas
// de la gestoría, sugiere el estado y manda seguimiento solo si no contestan.
import { h, toast, fmtWhen, inDays, shrinkImage, safeName } from "./util.js";
import { customer, state, save, saveFile, readFile, removeFile, log, setFollowUp, PLATE_STATUS, plateLabel } from "./store.js";
import { header, section, empty, btn, rerender, field, input, select, textarea, sendWhatsApp } from "./ui.js";
import { platesEmail, fillTemplate, template } from "./rules.js";
import { deliverFiles, openExternal, isNative } from "./native.js";
import { googleReady, sendEmail, checkEmails, closeEmailCase, lastGoogleStatus } from "./google.js";

// Estado sugerido por el agente de correo → estado del trámite
const SUGERIDO = { placas_listas: "listas", falta_documento: "documentos", en_tramite: "tramite" };

function ensurePlates(c) {
  if (!c.plates) {
    c.plates = { status: "documentos", vin: "", to: state.settings.platesEmail, docs: {}, startedAt: new Date().toISOString() };
    log(c.id, "placas", "Trámite de placas iniciado");
    save();
  }
  c.plates.docs ??= {};
  return c.plates;
}

export function renderPlates(root, id) {
  const c = customer(id);
  if (!c) { root.append(header("Placas", { back: "/clientes" }), empty("Este cliente ya no existe.")); return; }
  const p = ensurePlates(c);
  const reqs = state.settings.platesRequirements;
  const have = reqs.filter((r) => p.docs[r]).length;

  const statusSel = select(PLATE_STATUS, p.status, { onchange: (e) => {
    p.status = e.target.value;
    log(c.id, "placas", `Placas: ${plateLabel(p.status)}`);
    if (p.status === "listas") setFollowUp(c.id, inDays(1), "Coordinar entrega de placas");
    if (p.status === "entregadas") {
      setFollowUp(c.id, null);
      if (p.threadId && googleReady()) closeEmailCase(c.id).catch(() => {}); // el agente deja de dar seguimiento
    }
    save();
    toast("Estado actualizado");
    rerender();
  } });
  const vin = input({ value: p.vin ?? "", placeholder: "Número de serie (VIN)", class: "input mono", autocapitalize: "characters", onchange: (e) => { p.vin = e.target.value.toUpperCase().trim(); save(); } });

  // Correo
  const draft = p.draft ?? platesEmail(c);
  const to = input({ type: "email", value: p.to ?? state.settings.platesEmail ?? "", placeholder: "gestoria@agencia.com", onchange: (e) => { p.to = e.target.value.trim(); save(); } });
  const subject = input({ value: draft.subject, oninput: () => keepDraft() });
  const body = textarea({ rows: 12, oninput: () => keepDraft() }, draft.body);
  function keepDraft() { p.draft = { subject: subject.value, body: body.value }; save(); }
  const loadDraft = (d) => { subject.value = d.subject; body.value = d.body; keepDraft(); };
  const gmail = googleReady();
  const replies = h("div", { class: "stack-s" });

  root.append(
    header(`Placas · ${c.name.split(" ")[0]}`, { back: `/cliente/${c.id}` }),
    h("div", { class: "page" },
      section("Estado del trámite",
        h("div", { class: "grid2" }, field("Estado", statusSel), field("VIN / serie", vin)),
        p.sentAt ? h("p", { class: "muted small" }, `Enviado a gestoría ${fmtWhen(p.sentAt)}`) : null,
        h("div", { class: "row wrap gap-s" },
          btn("Avisar al cliente por WhatsApp", () => sendWhatsApp(c, fillTemplate(template("placas").text, c), { learn: false }), "small wa"))),
      section(`Documentos (${have}/${reqs.length})`,
        h("p", { class: "muted small" }, "Marca lo recibido y adjunta foto o PDF de cada documento. La lista se cambia en Ajustes."),
        h("div", { class: "list" }, reqs.map((r) => docRow(c, r)))),
      section("Correo a la gestoría",
        h("p", { class: "muted small" }, gmail
          ? `Agente de correo activo: se envía desde tu Gmail${lastGoogleStatus()?.correo?.seguimientoAuto ? `, y si no contestan en ${lastGoogleStatus().correo.dias} días manda seguimiento solo` : ""}.`
          : "Conecta tu cuenta de Google (gratis, en Más → Conexiones) para enviar desde tu Gmail y que Sofía revise las respuestas sola."),
        field("Para", to),
        field("Asunto", subject),
        field("Mensaje", body),
        h("div", { class: "row wrap gap-s" },
          btn(gmail ? "Enviar desde mi Gmail (con adjuntos)" : "Enviar con adjuntos", (e) => sendWithAttachments(c, subject.value, body.value, to.value, e.currentTarget), "primary"),
          btn("Abrir en mi correo (sin adjuntos)", () => {
            openExternal(`mailto:${encodeURIComponent(to.value)}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`);
          }, "ghost"),
          btn("Copiar texto", async () => { await navigator.clipboard?.writeText(`${subject.value}\n\n${body.value}`); toast("Copiado"); }, "ghost")),
        h("div", { class: "row wrap gap-s" },
          btn("Rehacer con lo recibido", () => loadDraft(platesEmail(c)), "small ghost"),
          btn("Correo de seguimiento", () => loadDraft(platesEmail(c, { followUp: true })), "small ghost"),
          gmail && p.threadId ? btn("Enviar seguimiento en el mismo hilo", async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            try {
              const d = platesEmail(c, { followUp: true });
              const r = await sendEmail({ to: to.value.trim(), subject: d.subject, body: d.body, ref: c.id, enHilo: true });
              log(c.id, "correo", `Seguimiento de placas enviado desde Gmail${r.aviso ? ` (${r.aviso})` : ""}`);
              setFollowUp(c.id, inDays(3), "Pedir estatus de placas");
              toast("Seguimiento enviado desde tu Gmail");
              rerender();
            } catch (err) { toast(err.message, 6000); b.disabled = false; }
          }, "small") : null,
          gmail && p.threadId ? btn("Revisar respuestas", (e) => reviewReplies(c, replies, e.currentTarget), "small") : null,
          gmail ? null : btn("Ya lo envié", () => {
            p.sentAt = new Date().toISOString();
            if (p.status === "documentos") p.status = "enviado";
            log(c.id, "correo", `Correo de placas enviado a ${to.value || "gestoría"}: ${subject.value}`);
            setFollowUp(c.id, inDays(3), "Pedir estatus de placas");
            toast("Registrado. Te recuerdo pedir el estatus en 3 días.");
            rerender();
          }, "small")),
        replies),
    ));
}

function docRow(c, req) {
  const p = c.plates;
  const val = p.docs[req];
  const fileInput = h("input", { type: "file", accept: "image/*,application/pdf", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (typeof val === "string") await removeFile(val).catch(() => {});
    const blob = await shrinkImage(f);
    const ext = blob.type === "application/pdf" ? "pdf" : "jpg";
    p.docs[req] = await saveFile(blob, `${safeName(req)}.${ext}`);
    log(c.id, "placas", `Documento recibido: ${req}`);
    save();
    rerender();
  } });
  const check = h("input", { type: "checkbox", checked: Boolean(val), "aria-label": req, onchange: async (e) => {
    if (e.target.checked) p.docs[req] = p.docs[req] || true;
    else { if (typeof val === "string") await removeFile(val).catch(() => {}); delete p.docs[req]; }
    save();
    rerender();
  } });
  return h("div", { class: "item" },
    h("label", { class: "row gap-s grow" }, check, h("span", {}, req)),
    fileInput,
    typeof val === "string" ? btn("Ver", async () => {
      const f = await readFile(val);
      if (!f) return;
      if (isNative()) await deliverFiles([{ blob: f.blob, name: f.name }], { title: req }); // Android abre "Abrir con…"
      else window.open(URL.createObjectURL(f.blob), "_blank");
    }, "small ghost") : null,
    btn(typeof val === "string" ? "Cambiar" : "Adjuntar", () => fileInput.click(), "small"));
}

async function attachedFiles(c) {
  const files = [];
  for (const [req, v] of Object.entries(c.plates.docs)) {
    if (typeof v !== "string") continue;
    const f = await readFile(v);
    if (f?.blob) files.push({ blob: f.blob, name: f.name || `${safeName(req)}.jpg` });
  }
  return files;
}

async function sendWithAttachments(c, subject, body, to, button) {
  const p = c.plates;
  const files = await attachedFiles(c);
  if (googleReady()) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) { toast("Escribe el correo de la gestoría."); return; }
    if (button) { button.disabled = true; button.textContent = "Enviando desde tu Gmail…"; }
    try {
      const r = await sendEmail({ to: to.trim(), subject, body, files, ref: c.id, seguimientoDias: lastGoogleStatus()?.correo?.dias ?? 3 });
      p.sentAt = r.enviadoAt ?? new Date().toISOString();
      p.threadId = r.threadId;
      if (p.status === "documentos") p.status = "enviado";
      log(c.id, "correo", `Correo de placas enviado desde Gmail a ${to.trim()} con ${r.adjuntos ?? files.length} adjunto(s): ${subject}`);
      setFollowUp(c.id, inDays(3), "Pedir estatus de placas");
      toast(r.aviso ? `Enviado. Aviso: ${r.aviso}` : `Enviado desde tu Gmail con ${files.length} adjunto(s). Sofía revisará la respuesta.`, 6000);
      rerender();
    } catch (e) {
      toast(e.message, 7000);
      if (button) { button.disabled = false; button.textContent = "Enviar desde mi Gmail (con adjuntos)"; }
    }
    return;
  }
  if (!files.length) { toast("No hay documentos adjuntos todavía. Usa \"Abrir en mi correo\" o adjunta fotos."); return; }
  if (to) await navigator.clipboard?.writeText(to).catch(() => {});
  toast(to ? `Elige Gmail/Correo. El destinatario (${to}) quedó copiado para pegarlo.` : "Elige Gmail o tu app de correo.", 4000);
  const r = await deliverFiles(files, { title: subject, text: body });
  if (r === "downloaded") toast("Se descargaron los archivos: adjúntalos en tu correo.");
}

/** Lee en Gmail lo que contestó la gestoría y sugiere el estado del trámite (palabras clave, sin IA). */
async function reviewReplies(c, box, button) {
  const p = c.plates;
  button.disabled = true;
  try {
    const [caso] = await checkEmails(c.id);
    if (!caso) { box.replaceChildren(h("p", { class: "muted small" }, "Sin datos de este correo en tu Gmail.")); return; }
    const nuevas = (caso.respuestas ?? []).filter((r) => !p.lastReplyAt || r.fecha > p.lastReplyAt);
    for (const r of nuevas) log(c.id, "correo", `Respuesta de ${r.de}: ${r.texto.slice(0, 300)}`);
    if (nuevas.length) { p.lastReplyAt = nuevas.at(-1).fecha; save(); }
    const sug = caso.sugerido;
    const estado = sug ? SUGERIDO[sug.clave] : null;
    box.replaceChildren(
      h("h3", {}, caso.respuestas?.length ? `Respuestas de la gestoría (${caso.respuestas.length})` : "La gestoría aún no contesta"),
      caso.esperando ? h("p", { class: "muted small" }, "La última palabra es tuya: Sofía espera su respuesta.") : null,
      ...(caso.respuestas ?? []).slice(-5).map((r) => h("div", { class: "item col" },
        h("div", { class: "row between" }, h("strong", { class: "small" }, r.de), h("span", { class: "muted small" }, fmtWhen(r.fecha))),
        h("p", { class: "pre small" }, r.texto),
        r.adjuntos?.length ? h("p", { class: "muted small" }, `Adjuntos: ${r.adjuntos.join(", ")}`) : null)),
      sug ? h("div", { class: "reading" },
        h("p", {}, `Sofía entiende: «${sug.texto}»${sug.coincidencia ? ` (por «${sug.coincidencia}»)` : ""}.`),
        estado && estado !== p.status ? btn(`Aplicar: ${plateLabel(estado)}`, () => {
          p.status = estado;
          log(c.id, "placas", `Placas: ${plateLabel(estado)} (según la respuesta de la gestoría)`);
          if (estado === "listas") setFollowUp(c.id, inDays(1), "Coordinar entrega de placas");
          if (estado === "documentos") setFollowUp(c.id, inDays(1), "Conseguir el documento que pide la gestoría");
          save();
          toast("Estado actualizado");
          rerender();
        }, "small primary") : null,
        sug.clave === "pago" ? btn("Recordarme pagar derechos", () => { setFollowUp(c.id, inDays(1), "Pagar derechos de placas"); toast("Recordatorio creado"); }, "small") : null) : null);
  } catch (e) {
    toast(e.message, 6000);
  } finally {
    button.disabled = false;
  }
}
