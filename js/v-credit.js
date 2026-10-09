// Solicitud de crédito: INE por cámara (IA + lector del teléfono, verificados entre sí) y llenado del
// formato OFICIAL del banco (BBVA/Banorte) con su mapeo real, además de la pre-solicitud de Sofía.
import { h, toast, modal, shrinkImage, debounce, fmtWhen, inDays, safeName } from "./util.js";
import { customer, save, saveFile, readFile, removeFile, log, setFollowUp, state } from "./store.js";
import { header, section, empty, btn, rerender, field, input, select, textarea, sendWhatsApp, chip } from "./ui.js";
import { FIELDS, SECTIONS, BANKS, missingFields, requiredKeys, applies, prefillFromCustomer, buildCreditPdf, fullName, migrateValues, fillOfficialForm, inspectOfficialForm } from "./credit.js";
import { readIne, checkIdentity, fromAiReading, combineReadings } from "./ine.js";
import { googleReady, ocrObservation } from "./google.js";
import { nativeScan, photoToObservation, canScanNatively } from "./ocr.js";
import { textToObservation } from "./ocr-obs.js";
import { creditEstimate, fillTemplate, template } from "./rules.js";
import { deliverFiles } from "./native.js";
import { aiForIne, aiReady, readIneWithAi } from "./ai.js";

// Cambiar estos datos muestra u oculta otros campos (arrendador, empleo anterior, obligatorios del banco).
const RESHAPE = new Set(["housing_status", "employment_years", "bank"]);
const openSections = new Set(); // secciones abiertas a mano (se conservan al redibujar)

export function ensureCredit(c) {
  if (!c.credit) {
    c.credit = { status: "borrador", values: prefillFromCustomer(c), ineFront: null, ineBack: null, obs: {}, reading: null, createdAt: new Date().toISOString() };
    log(c.id, "credito", "Solicitud de crédito iniciada");
    if (["nuevo", "seguimiento", "cotizacion"].includes(c.stage)) c.stage = "credito";
    save();
  }
  c.credit.values = migrateValues(c.credit.values ?? {});
  c.credit.obs ??= {};
  return c.credit;
}

export function renderCredit(root, id) {
  const c = customer(id);
  if (!c) { root.append(header("Crédito", { back: "/clientes" }), empty("Este cliente ya no existe.")); return; }
  const cr = ensureCredit(c);
  const v = cr.values;
  const status = h("p", { class: "muted small", role: "status" });
  const autosave = debounce(() => { cr.updatedAt = new Date().toISOString(); save(); drawAnalysis(); }, 400);

  const ineCard = section("1 · INE del solicitante",
    h("p", { class: "muted" }, aiForIne()
      ? "Toma o escanea la credencial. La IA la lee y el lector del teléfono la verifica; lo que no coincida se marca."
      : googleReady()
        ? "Toma frente y reverso. Los leen dos lectores gratis (el del teléfono y el de Google en tu cuenta) y se comparan con el reverso (MRZ con dígitos verificadores); lo que no coincida se marca."
      : canScanNatively()
        ? "Escanea con la cámara: se recorta la credencial y se lee en el teléfono. Para máxima precisión conecta la IA en Más → Conexiones."
        : "Toma una foto de la INE con buena luz. Se lee en el dispositivo. Para máxima precisión conecta la IA en Más → Conexiones."),
    h("div", { class: "grid2" }, side(c, "front", "Frente", status), side(c, "back", "Reverso (recomendado)", status)),
    h("div", { class: "row wrap gap-s" },
      btn("Pegar texto de la INE", () => pasteText(c, status), "small ghost"),
      cr.ineFront || cr.obs.front || cr.obs.text ? btn("Volver a leer", () => analyze(c, status), "small ghost") : null),
    status,
    readingBox(c));

  const analysis = h("div", { class: "stack-s" });
  function drawAnalysis() {
    const id = checkIdentity(v);
    const est = creditEstimate(v);
    const miss = missingFields(v);
    analysis.replaceChildren(
      h("ul", { class: "checks" },
        id.checks.map((ck) => h("li", { class: ck.ok === true ? "ok" : ck.ok === false ? "bad" : "pend" }, ck.text)),
        est.notes.map((n) => h("li", { class: est.ratio > 0.35 || /menor al 10%/.test(n) ? "bad" : "info" }, n))),
      miss.length
        ? h("p", { class: "warn" }, `Faltan ${miss.length} dato${miss.length === 1 ? "" : "s"}${BANKS[v.bank] ? ` que pide ${v.bank}` : ""}: ${miss.map((f) => f.label).join(", ")}.`)
        : h("p", { class: "ok-text" }, `Todos los datos que pide ${BANKS[v.bank] ? v.bank : "el banco"} están completos.`));
  }

  const req = requiredKeys(v);
  const missingNow = new Set(missingFields(v).map((f) => f.key));
  const sections = SECTIONS.map((sec, i) => {
    const fields = FIELDS.filter((f) => f.s === sec.id && applies(f, v));
    if (!fields.length) return null;
    const miss = fields.filter((f) => missingNow.has(f.key)).length;
    // Secciones plegables: abiertas solo las que tienen faltantes (o la que se está editando).
    const open = miss > 0 || openSections.has(sec.id);
    return h("details", { class: "card fold", open, ontoggle: (e) => { if (e.target.open) openSections.add(sec.id); else openSections.delete(sec.id); } },
      h("summary", {}, h("h2", {}, `${i + 2} · ${sec.label}`), miss ? chip(`Faltan ${miss}`, "") : chip("Completo", "ok")),
      sec.hint ? h("p", { class: "muted small" }, sec.hint) : null,
      h("div", { class: "grid2" }, fields.map((f) => fieldFor(f, v, req.has(f.key), autosave))));
  });

  root.append(
    header(`Crédito · ${c.name.split(" ")[0]}`, { back: `/cliente/${c.id}`, actions: [chip(cr.status === "enviada" ? "Enviada" : "Borrador")] }),
    h("div", { class: "page" },
      ineCard,
      section("Análisis automático", analysis),
      ...sections,
      finishCard(c)));
  drawAnalysis();
}

function fieldFor(f, v, required, autosave) {
  const onInput = (e) => {
    v[f.key] = f.upper ? e.target.value.toUpperCase() : e.target.value;
    if (RESHAPE.has(f.key)) { save(); rerender(); } else autosave();
  };
  let el;
  if (f.type === "select") el = select(f.options, v[f.key] ?? "", { onchange: onInput });
  else {
    const t = { date: "date", tel: "tel", email: "email" }[f.type] ?? "text";
    // En campos que cambian el formulario se espera a que termine de escribir (change); en los demás, al teclear.
    const listen = RESHAPE.has(f.key) ? { onchange: onInput } : { oninput: onInput };
    el = input({ type: t, value: v[f.key] ?? "", inputmode: f.type === "int" || f.type === "money" ? "decimal" : f.type === "tel" ? "tel" : undefined, autocapitalize: f.upper ? "characters" : undefined, class: `input ${f.mono ? "mono" : ""}`, ...listen });
  }
  return field(`${f.label}${required ? " *" : ""}`, el);
}

// ───────── Terminar: formato oficial + pre-solicitud ─────────

function finishCard(c) {
  const cr = c.credit;
  const v = cr.values;
  const bank = BANKS[v.bank] ? v.bank : null;
  const form = bank ? state.settings.bankForms[bank] : null;
  const upload = h("input", { type: "file", accept: "application/pdf", hidden: true, onchange: async (e) => { if (await uploadBankForm(bank, e.target.files?.[0])) rerender(); } });
  return section("Terminar",
    bank
      ? form
        ? h("div", { class: "stack-s" },
          h("p", { class: "muted small" }, `Formato oficial ${bank}: ${form.name} (${form.found}/${form.total} campos reconocidos). Se llena una copia; PEP, consentimientos y firmas los completa el cliente.`),
          h("div", { class: "row" }, btn(`Llenar solicitud oficial ${bank}`, () => makeOfficial(c, bank), "primary")))
        : h("div", { class: "stack-s" },
          h("p", { class: "muted small" }, `Para llenar la solicitud OFICIAL de ${bank}, sube una vez el PDF en blanco que te dio el banco (queda guardado en este dispositivo).`),
          upload,
          h("div", { class: "row" }, btn(`Subir PDF oficial de ${bank}`, () => upload.click(), "primary")))
      : h("p", { class: "muted small" }, "Elige BBVA o Banorte en «Auto y crédito» para llenar su formato oficial."),
    h("div", { class: "row wrap gap-s" },
      btn("Pre-solicitud Sofía (resumen + INE)", () => makePdf(c), bank && form ? "ghost" : "primary"),
      btn("Pedir documentos por WhatsApp", () => sendWhatsApp(c, fillTemplate(template("documentos").text, c), { learn: false }), "ghost"),
      cr.status !== "enviada" ? btn("Marcar enviada al banco", () => {
        cr.status = "enviada";
        cr.sentAt = new Date().toISOString();
        log(c.id, "credito", `Solicitud enviada${v.bank ? ` a ${v.bank}` : ""}`);
        setFollowUp(c.id, inDays(2), "Revisar respuesta del banco");
        toast("Enviada. Te recuerdo revisar la respuesta en 2 días.");
        rerender();
      }, "ghost") : h("span", { class: "muted small" }, `Enviada ${fmtWhen(cr.sentAt)}`)));
}

/** Guarda el PDF oficial en blanco de un banco y verifica que sea la versión conocida. */
export async function uploadBankForm(bank, file) {
  if (!file) return false;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = await inspectOfficialForm(bank, bytes);
    if (!info.found) { toast(`Ese PDF no tiene los campos del formato de ${bank}. ¿Es el PDF rellenable oficial?`, 6000); return false; }
    const old = state.settings.bankForms[bank];
    if (old?.fileId) await removeFile(old.fileId).catch(() => {});
    const fileId = await saveFile(new Blob([bytes], { type: "application/pdf" }), file.name);
    state.settings.bankForms[bank] = { fileId, name: file.name, found: info.found, total: info.total, uploadedAt: new Date().toISOString() };
    save();
    toast(info.found === info.total ? `Formato ${bank} listo: reconoce los ${info.total} campos.` : `Formato ${bank} cargado: reconoce ${info.found} de ${info.total} campos (puede ser otra versión).`, 5000);
    return true;
  } catch (e) {
    toast(`No se pudo leer el PDF: ${e.message}`, 5000);
    return false;
  }
}

async function makeOfficial(c, bank) {
  const v = c.credit.values;
  try {
    const f = await readFile(state.settings.bankForms[bank].fileId);
    if (!f) throw new Error("No encuentro el PDF oficial guardado. Súbelo otra vez.");
    const r = await fillOfficialForm(bank, await f.blob.arrayBuffer(), v);
    log(c.id, "credito", `Solicitud oficial ${bank} llenada (${r.filled.length} campos)`);
    save();
    const miss = missingFields(v);
    modal(`Solicitud ${bank} lista`, h("div", { class: "stack-s" },
      h("p", {}, `Se llenaron ${r.filled.length} campos del formato oficial.`),
      miss.length ? h("p", { class: "warn small" }, `Quedaron en blanco (faltan datos): ${miss.map((x) => x.label).join(", ")}.`) : null,
      r.notInPdf.length ? h("p", { class: "warn small" }, `No están en este PDF: ${r.notInPdf.join(", ")}.`) : null,
      h("p", { class: "muted small" }, `Los completa y firma el cliente: ${r.human.join(", ")}.`)), [
      { label: "Cerrar" },
      { label: "Abrir / compartir PDF", kind: "primary", onClick: () => deliverFiles([{ blob: r.blob, name: `Solicitud-${bank}-${safeName(fullName(v) || c.name)}.pdf` }], { title: `Solicitud ${bank} · ${c.name}` }) },
    ]);
  } catch (e) {
    toast(e.message ?? String(e), 6000);
  }
}

async function makePdf(c) {
  const cr = c.credit;
  try {
    toast("Generando PDF…", 1500);
    const front = cr.ineFront ? (await readFile(cr.ineFront))?.blob : undefined;
    const back = cr.ineBack ? (await readFile(cr.ineBack))?.blob : undefined;
    const pdf = await buildCreditPdf(cr.values, c, { front, back });
    cr.pdfAt = new Date().toISOString();
    log(c.id, "credito", "Pre-solicitud PDF generada");
    save();
    const r = await deliverFiles([{ blob: pdf, name: `Solicitud-credito-${safeName(fullName(cr.values) || c.name)}.pdf` }], { title: `Solicitud de crédito · ${c.name}`, text: `Solicitud de crédito de ${c.name}` });
    toast(r === "downloaded" ? "PDF descargado" : r === "shared" ? "PDF listo para compartir" : "Cancelado");
  } catch (e) {
    console.error(e);
    toast(`No se pudo generar el PDF: ${e.message ?? e}`);
  }
}

// ───────── Captura de la INE ─────────

function side(c, which, label, status) {
  const cr = c.credit;
  const fileId = which === "front" ? cr.ineFront : cr.ineBack;
  const box = h("div", { class: "ine-slot" }, h("span", { class: "muted small" }, label));
  if (fileId) {
    readFile(fileId).then((f) => {
      if (!f?.blob) return;
      box.insertBefore(h("img", { src: URL.createObjectURL(f.blob), alt: `INE ${label}` }), box.children[1] ?? null);
    });
  }
  const camera = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => onPhoto(c, which, e.target.files?.[0], status) });
  const gallery = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => onPhoto(c, which, e.target.files?.[0], status) });
  box.append(camera, gallery,
    h("div", { class: "row wrap gap-s" },
      canScanNatively()
        ? btn(fileId ? "Escanear de nuevo" : "Escanear", async () => {
          try {
            status.textContent = "Abriendo el escáner…";
            const { obs, blob } = await nativeScan();
            await store(c, which, blob, obs);
            await analyze(c, status);
          } catch (e) { status.textContent = e.message ?? "No se pudo escanear."; }
        }, "small primary")
        : btn(fileId ? "Otra foto" : "Tomar foto", () => camera.click(), "small primary"),
      btn("Galería", () => gallery.click(), "small ghost"),
      fileId ? btn("Quitar", async () => { await removeFile(fileId); if (which === "front") c.credit.ineFront = null; else c.credit.ineBack = null; delete c.credit.obs[which]; save(); rerender(); }, "small ghost") : null));
  return box;
}

/** Foto de la INE (cámara, galería o recibida por WhatsApp): se guarda y se lee. */
export async function applyIneImage(c, which, file, status) {
  ensureCredit(c);
  const obs = await photoToObservation(file, (m) => { status.textContent = m; }).catch(() => null);
  await store(c, which, await shrinkImage(file, 2000, 0.88), obs);
  await analyze(c, status);
}

async function onPhoto(c, which, file, status) {
  if (!file) return;
  status.textContent = "Leyendo la INE…";
  try { await applyIneImage(c, which, file, status); } catch (e) { status.textContent = e.message ?? "No se pudo leer la foto."; rerender(); }
}

async function store(c, which, blob, obs) {
  const cr = c.credit;
  const old = which === "front" ? cr.ineFront : cr.ineBack;
  if (old) await removeFile(old).catch(() => {});
  const fid = await saveFile(blob, `ine-${which}.jpg`);
  if (which === "front") cr.ineFront = fid; else cr.ineBack = fid;
  if (obs) cr.obs[which] = obs; else delete cr.obs[which];
  delete cr.obs[`google_${which}`]; // foto nueva: Google la vuelve a leer
  save();
}

async function analyze(c, status) {
  const cr = c.credit;
  const pages = [...(cr.obs.front?.pages ?? []), ...(cr.obs.back?.pages ?? []), ...(cr.obs.text?.pages ?? [])];
  let ocr = pages.length ? readIne({ engine: "mix", pages }) : null;
  // Segunda lectura GRATIS con el OCR de Google Drive (en la cuenta del propio asesor), si está conectada.
  if (googleReady() && (cr.ineFront || cr.ineBack)) {
    for (const [which, fid] of [["front", cr.ineFront], ["back", cr.ineBack]]) {
      if (!fid || cr.obs[`google_${which}`]) continue;
      status.textContent = "Google también está leyendo la credencial (gratis, en tu cuenta)…";
      try { cr.obs[`google_${which}`] = await ocrObservation((await readFile(fid)).blob); }
      catch (e) { status.textContent = `Google no pudo leerla (${e.message}). Sigo con el lector del teléfono.`; break; }
    }
    const gpages = [...(cr.obs.google_front?.pages ?? []), ...(cr.obs.google_back?.pages ?? [])];
    if (gpages.length) ocr = combineReadings(ocr, readIne({ engine: "google", pages: gpages }));
  }
  let r = ocr;
  if (aiForIne() && (cr.ineFront || cr.ineBack)) {
    status.textContent = "La IA está leyendo la credencial…";
    try {
      const blobs = await Promise.all([cr.ineFront, cr.ineBack].filter(Boolean).map(async (fid) => (await readFile(fid))?.blob));
      r = fromAiReading(await readIneWithAi(blobs), ocr);
    } catch (e) {
      status.textContent = `IA no disponible (${e.message}). Se usa el lector del teléfono.`;
    }
  }
  if (!r) { status.textContent = "No hay texto para leer. Toma otra foto o captura a mano."; rerender(); return; }
  cr.reading = { ...r, at: new Date().toISOString() };
  save();
  status.textContent = r.detected ? `Se leyeron ${Object.keys(r.values).length} datos. Revísalos abajo y aplícalos.` : "No parece una INE o no se leyó bien. Intenta otra foto con más luz, o captura a mano.";
  rerender();
}

function pasteText(c, status) {
  const t = textarea({ rows: 8, placeholder: "En iPhone: abre la foto de la INE en Fotos → mantén presionado el texto → Seleccionar todo → Copiar. Pégalo aquí." });
  modal("Pegar texto de la INE", h("div", { class: "stack-s" }, t), [
    { label: "Cancelar" },
    { label: "Leer", kind: "primary", onClick: () => {
      if (!t.value.trim()) return false;
      c.credit.obs.text = textToObservation(t.value);
      analyze(c, status);
    } },
  ]);
}

const ENGINE = { ocr: "Lector del teléfono", "ocr+google": "Teléfono + Google", google: "Lector de Google", ia: "Leído con IA", "ia+ocr": "IA + lectores gratis" };

function readingBox(c) {
  const r = c.credit.reading;
  if (!r || !r.detected) return null;
  const v = c.credit.values;
  const keys = Object.keys(r.values);
  const label = (k) => FIELDS.find((f) => f.key === k)?.label ?? k;
  const show = (k) => FIELDS.find((f) => f.key === k)?.options?.find((o) => o[0] === r.values[k])?.[1] ?? r.values[k];
  const conflicts = keys.filter((k) => v[k] && String(v[k]).toUpperCase() !== String(r.values[k]).toUpperCase());
  const apply = (overwrite) => {
    for (const k of keys) if (overwrite || !v[k]) v[k] = r.values[k];
    log(c.id, "credito", `Datos de la INE aplicados (${keys.length})`);
    c.credit.reading.appliedAt = new Date().toISOString();
    save();
    toast("Datos aplicados. Revisa cada campo.");
    rerender();
  };
  return h("div", { class: "reading" },
    h("div", { class: "row between" }, h("h3", {}, "Datos leídos de la INE"), chip(ENGINE[r.engine] ?? "Leído", r.engine?.startsWith("ia") ? "ok" : "")),
    h("table", { class: "kv" }, keys.map((k) => h("tr", {}, h("th", {}, label(k)), h("td", {},
      h("span", { class: "mono" }, show(k)),
      r.confidence[k] === "high" ? h("div", { class: "ok-text small" }, "✓ verificado") : r.confidence[k] === "low" ? h("div", { class: "warn small" }, "revísalo") : null)))),
    r.warnings.length ? h("ul", { class: "checks" }, r.warnings.map((w) => h("li", { class: "bad" }, w))) : null,
    !aiReady() ? h("p", { class: "muted small" }, "Consejo: conecta la IA para leer con máxima precisión. ", h("a", { href: "#/conexiones" }, "Conectar")) : null,
    h("div", { class: "row wrap gap-s" },
      btn(r.appliedAt ? "Aplicar otra vez" : "Usar estos datos", () => apply(false), "small primary"),
      conflicts.length ? btn(`Reemplazar también ${conflicts.length} dato(s) ya capturado(s)`, () => apply(true), "small ghost") : null));
}
