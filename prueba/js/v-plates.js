// Trámite de placas: checklist de documentos, correo a la gestoría con adjuntos y seguimiento.
import { h, toast, fmtWhen, inDays, shrinkImage, safeName } from "./util.js";
import { customer, state, save, saveFile, readFile, removeFile, log, setFollowUp, PLATE_STATUS, plateLabel } from "./store.js";
import { header, section, empty, btn, rerender, field, input, select, textarea, sendWhatsApp } from "./ui.js";
import { platesEmail, fillTemplate, template } from "./rules.js";
import { deliverFiles, openExternal, isNative } from "./native.js";

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
    if (p.status === "entregadas") setFollowUp(c.id, null);
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

  root.append(
    header(`Placas · ${c.name.split(" ")[0]}`, { back: `/cliente/${c.id}` }),
    h("div", { class: "page" },
      section("Estado del trámite",
        h("div", { class: "grid2" }, field("Estado", statusSel), field("VIN / serie", vin)),
        p.sentAt ? h("p", { class: "muted small" }, `Enviado a gestoría ${fmtWhen(p.sentAt)}`) : null,
        h("div", { class: "row wrap gap-s" },
          btn("Avisar al cliente por WhatsApp", () => sendWhatsApp(c, fillTemplate(template("placas").text, c)), "small wa"))),
      section(`Documentos (${have}/${reqs.length})`,
        h("p", { class: "muted small" }, "Marca lo recibido y adjunta foto o PDF de cada documento. La lista se cambia en Ajustes."),
        h("div", { class: "list" }, reqs.map((r) => docRow(c, r)))),
      section("Correo a la gestoría",
        field("Para", to),
        field("Asunto", subject),
        field("Mensaje", body),
        h("div", { class: "row wrap gap-s" },
          btn("Enviar con adjuntos", () => sendWithAttachments(c, subject.value, body.value, to.value), "primary"),
          btn("Abrir en mi correo (sin adjuntos)", () => {
            openExternal(`mailto:${encodeURIComponent(to.value)}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`);
          }, "ghost"),
          btn("Copiar texto", async () => { await navigator.clipboard?.writeText(`${subject.value}\n\n${body.value}`); toast("Copiado"); }, "ghost")),
        h("div", { class: "row wrap gap-s" },
          btn("Rehacer con lo recibido", () => loadDraft(platesEmail(c)), "small ghost"),
          btn("Correo de seguimiento", () => loadDraft(platesEmail(c, { followUp: true })), "small ghost"),
          btn("Ya lo envié", () => {
            p.sentAt = new Date().toISOString();
            if (p.status === "documentos") p.status = "enviado";
            log(c.id, "correo", `Correo de placas enviado a ${to.value || "gestoría"}: ${subject.value}`);
            setFollowUp(c.id, inDays(3), "Pedir estatus de placas");
            toast("Registrado. Te recuerdo pedir el estatus en 3 días.");
            rerender();
          }, "small"))),
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

async function sendWithAttachments(c, subject, body, to) {
  const files = [];
  for (const [req, v] of Object.entries(c.plates.docs)) {
    if (typeof v !== "string") continue;
    const f = await readFile(v);
    if (f?.blob) files.push({ blob: f.blob, name: f.name || `${safeName(req)}.jpg` });
  }
  if (!files.length) { toast("No hay documentos adjuntos todavía. Usa \"Abrir en mi correo\" o adjunta fotos."); return; }
  if (to) await navigator.clipboard?.writeText(to).catch(() => {});
  toast(to ? `Elige Gmail/Correo. El destinatario (${to}) quedó copiado para pegarlo.` : "Elige Gmail o tu app de correo.", 4000);
  const r = await deliverFiles(files, { title: subject, text: body });
  if (r === "downloaded") toast("Se descargaron los archivos: adjúntalos en tu correo.");
}
