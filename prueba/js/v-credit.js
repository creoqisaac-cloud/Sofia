// Solicitud de crédito con lectura de INE por la cámara del dispositivo.
import { h, toast, modal, shrinkImage, debounce, fmtWhen, inDays, safeName } from "./util.js";
import { customer, save, saveFile, readFile, removeFile, log, setFollowUp } from "./store.js";
import { header, section, empty, btn, rerender, field, input, select, textarea, sendWhatsApp, chip } from "./ui.js";
import { FIELDS, SECTIONS, missingFields, prefillFromCustomer, buildCreditPdf, fullName } from "./credit.js";
import { readIne, checkIdentity } from "./ine.js";
import { nativeScan, photoToObservation, canScanNatively } from "./ocr.js";
import { textToObservation } from "./ocr-obs.js";
import { creditEstimate, fillTemplate, template } from "./rules.js";
import { deliverFiles } from "./native.js";

function ensureCredit(c) {
  if (!c.credit) {
    c.credit = { status: "borrador", values: prefillFromCustomer(c), ineFront: null, ineBack: null, obs: {}, reading: null, createdAt: new Date().toISOString() };
    log(c.id, "credito", "Solicitud de crédito iniciada");
    if (c.stage === "nuevo" || c.stage === "seguimiento" || c.stage === "cotizacion") c.stage = "credito";
    save();
  }
  c.credit.values ??= {};
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

  // ── INE ──
  const ineCard = section("1 · INE del solicitante",
    h("p", { class: "muted" }, canScanNatively()
      ? "Escanea con la cámara: Sofía recorta la credencial y lee los datos en el teléfono (sin internet y sin IA)."
      : "Toma una foto de la INE sobre una superficie lisa y con buena luz. Sofía lee los datos en el propio dispositivo; revísalos antes de usarlos."),
    h("div", { class: "grid2" }, side(c, "front", "Frente", status), side(c, "back", "Reverso (opcional)", status)),
    h("div", { class: "row wrap gap-s" },
      btn("Pegar texto de la INE", () => pasteText(c), "small ghost"),
      cr.obs.front || cr.obs.back ? btn("Volver a leer", () => analyze(c, status), "small ghost") : null),
    status,
    readingBox(c));

  // ── Análisis ──
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
        ? h("p", { class: "warn" }, `Faltan ${miss.length} dato${miss.length === 1 ? "" : "s"}: ${miss.map((f) => f.label).join(", ")}.`)
        : h("p", { class: "ok-text" }, "Todos los datos necesarios están completos."));
  }

  // ── Formulario ──
  const sections = SECTIONS.map((sec) =>
    section(`${SECTIONS.indexOf(sec) + 2} · ${sec.label}`,
      h("div", { class: "grid2" }, FIELDS.filter((f) => f.s === sec.id).map((f) => fieldFor(f, v, autosave)))));

  root.append(
    header(`Crédito · ${c.name.split(" ")[0]}`, { back: `/cliente/${c.id}`, actions: [chip(cr.status === "enviada" ? "Enviada" : "Borrador")] }),
    h("div", { class: "page" },
      ineCard,
      section("Análisis automático", analysis),
      ...sections,
      section("Terminar",
        h("p", { class: "muted" }, "El PDF incluye los datos, el análisis, espacio para firmas y las fotos de la INE. Se genera en este dispositivo."),
        h("div", { class: "row wrap gap-s" },
          btn("Generar PDF", () => makePdf(c), "primary"),
          btn("Pedir documentos por WhatsApp", () => sendWhatsApp(c, fillTemplate(template("documentos").text, c)), "ghost"),
          cr.status !== "enviada" ? btn("Marcar enviada al banco", () => {
            cr.status = "enviada";
            cr.sentAt = new Date().toISOString();
            log(c.id, "credito", `Solicitud enviada${v.bank ? ` a ${v.bank}` : ""}`);
            setFollowUp(c.id, inDays(2), "Revisar respuesta del banco");
            toast("Enviada. Te recuerdo revisar la respuesta en 2 días.");
            rerender();
          }, "ghost") : h("span", { class: "muted small" }, `Enviada ${fmtWhen(cr.sentAt)}`)))));
  drawAnalysis();
}

function fieldFor(f, v, autosave) {
  const onInput = (e) => { v[f.key] = f.upper ? e.target.value.toUpperCase() : e.target.value; autosave(); };
  let el;
  if (f.type === "select") el = select(f.options, v[f.key] ?? "", { onchange: onInput });
  else {
    const t = { date: "date", tel: "tel", email: "email", int: "text", money: "text" }[f.type] ?? "text";
    el = input({ type: t, value: v[f.key] ?? "", inputmode: f.type === "int" || f.type === "money" ? "decimal" : f.type === "tel" ? "tel" : undefined, autocapitalize: f.upper ? "characters" : undefined, class: `input ${f.mono ? "mono" : ""}`, oninput: onInput });
  }
  const label = `${f.label}${f.required ? " *" : ""}`;
  return field(label, el);
}

// ───────── Captura de la INE ─────────

function side(c, which, label, status) {
  const cr = c.credit;
  const fileId = which === "front" ? cr.ineFront : cr.ineBack;
  const box = h("div", { class: "ine-slot" }, h("span", { class: "muted small" }, label));
  if (fileId) {
    readFile(fileId).then((f) => {
      if (!f?.blob) return;
      const img = h("img", { src: URL.createObjectURL(f.blob), alt: `INE ${label}` });
      box.insertBefore(img, box.children[1] ?? null);
    });
  }
  const camera = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => onPhoto(c, which, e.target.files?.[0], status) });
  const gallery = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => onPhoto(c, which, e.target.files?.[0], status) });
  box.append(
    camera, gallery,
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

async function onPhoto(c, which, file, status) {
  if (!file) return;
  try {
    status.textContent = "Leyendo la INE…";
    const obs = await photoToObservation(file, (m) => { status.textContent = m; });
    await store(c, which, await shrinkImage(file), obs);
    await analyze(c, status);
  } catch (e) {
    // La foto se guarda aunque no se pueda leer: se capturan los datos a mano.
    await store(c, which, await shrinkImage(file), null);
    status.textContent = `${e.message ?? "No se pudo leer la foto."} La foto quedó guardada; captura los datos a mano o pega el texto.`;
    rerender();
  }
}

async function store(c, which, blob, obs) {
  const cr = c.credit;
  const old = which === "front" ? cr.ineFront : cr.ineBack;
  if (old) await removeFile(old).catch(() => {});
  const fid = await saveFile(blob, `ine-${which}.jpg`);
  if (which === "front") cr.ineFront = fid; else cr.ineBack = fid;
  if (obs) cr.obs[which] = obs; else delete cr.obs[which];
  save();
}

function analyze(c, status) {
  const cr = c.credit;
  const pages = [...(cr.obs.front?.pages ?? []), ...(cr.obs.back?.pages ?? []), ...(cr.obs.text?.pages ?? [])];
  if (!pages.length) { status.textContent = "No hay texto para leer."; return; }
  const r = readIne({ engine: "mix", pages });
  cr.reading = { ...r, at: new Date().toISOString() };
  save();
  status.textContent = r.detected ? `Se leyeron ${Object.keys(r.values).length} datos. Revísalos abajo y aplícalos.` : "No parece una INE o no se leyó bien. Intenta otra foto con más luz, o captura a mano.";
  rerender();
}

function pasteText(c) {
  const t = textarea({ rows: 8, placeholder: "En iPhone: abre la foto de la INE en Fotos → mantén presionado el texto → Seleccionar todo → Copiar. Pégalo aquí." });
  modal("Pegar texto de la INE", h("div", { class: "stack-s" }, t), [
    { label: "Cancelar" },
    { label: "Leer", kind: "primary", onClick: () => {
      if (!t.value.trim()) return false;
      c.credit.obs.text = textToObservation(t.value);
      analyze(c, { set textContent(m) { toast(m); } });
    } },
  ]);
}

function readingBox(c) {
  const r = c.credit.reading;
  if (!r || !r.detected) return null;
  const v = c.credit.values;
  const keys = Object.keys(r.values);
  const label = (k) => FIELDS.find((f) => f.key === k)?.label ?? k;
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
    h("h3", {}, "Datos leídos de la INE (OBSERVADOS)"),
    h("table", { class: "kv" }, keys.map((k) => h("tr", {}, h("th", {}, label(k)), h("td", {}, h("span", { class: "mono" }, r.values[k]), r.confidence[k] === "low" ? h("div", { class: "warn small" }, "confianza baja: revísalo") : null)))),
    r.warnings.length ? h("ul", { class: "checks" }, r.warnings.map((w) => h("li", { class: "bad" }, w))) : null,
    h("div", { class: "row wrap gap-s" },
      btn(r.appliedAt ? "Aplicar otra vez" : "Usar estos datos", () => apply(false), "small primary"),
      conflicts.length ? btn(`Reemplazar también ${conflicts.length} dato(s) ya capturado(s)`, () => apply(true), "small ghost") : null));
}

async function makePdf(c) {
  const cr = c.credit;
  try {
    toast("Generando PDF…", 1500);
    const front = cr.ineFront ? (await readFile(cr.ineFront))?.blob : undefined;
    const back = cr.ineBack ? (await readFile(cr.ineBack))?.blob : undefined;
    const pdf = await buildCreditPdf(cr.values, c, { front, back });
    cr.pdfAt = new Date().toISOString();
    log(c.id, "credito", "PDF de solicitud generado");
    save();
    const name = `Solicitud-credito-${safeName(fullName(cr.values) || c.name)}.pdf`;
    const r = await deliverFiles([{ blob: pdf, name }], { title: `Solicitud de crédito · ${c.name}`, text: `Solicitud de crédito de ${c.name}` });
    toast(r === "downloaded" ? "PDF descargado" : r === "shared" ? "PDF listo para compartir" : "Cancelado");
  } catch (e) {
    console.error(e);
    toast(`No se pudo generar el PDF: ${e.message ?? e}`);
  }
}

