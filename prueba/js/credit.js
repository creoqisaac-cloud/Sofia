// Solicitud de crédito automotriz: campos (con las mismas claves que los formatos oficiales de BBVA y
// Banorte), faltantes según el banco, pre-solicitud en PDF y llenado del PDF OFICIAL del banco.
import { state } from "./store.js";
import { checkIdentity } from "./ine.js";
import { creditEstimate } from "./rules.js";
import { money } from "./util.js";
import { BBVA_ADAPTER, BANORTE_ADAPTER, transformValue, checkboxMatches } from "./bank-adapters.js";

export const BANKS = { BBVA: BBVA_ADAPTER, Banorte: BANORTE_ADAPTER };

const opt = (pairs) => [["", "—"], ...pairs];
const rented = (v) => v.housing_status === "rented";
const shortJob = (v) => v.employment_years !== undefined && v.employment_years !== "" && Number(v.employment_years) < 2;

export const SECTIONS = [
  { id: "solicitante", label: "Solicitante" },
  { id: "nacimiento", label: "Nacimiento y estudios" },
  { id: "domicilio", label: "Domicilio" },
  { id: "empleo", label: "Empleo e ingresos" },
  { id: "anterior", label: "Empleo anterior", hint: "Solo si tiene menos de 2 años en su empleo actual." },
  { id: "referencias", label: "Referencias" },
  { id: "auto", label: "Auto y crédito" },
];

// Claves = las del perfil que usan los adaptadores oficiales (src/domain/credit).
export const FIELDS = [
  { s: "solicitante", key: "first_name", label: "Primer nombre", upper: true },
  { s: "solicitante", key: "middle_name", label: "Segundo nombre", upper: true },
  { s: "solicitante", key: "paternal_last_name", label: "Apellido paterno", upper: true },
  { s: "solicitante", key: "maternal_last_name", label: "Apellido materno", upper: true },
  { s: "solicitante", key: "gender", label: "Sexo", type: "select", options: opt([["male", "Hombre"], ["female", "Mujer"]]) },
  { s: "solicitante", key: "curp", label: "CURP", upper: true, mono: true },
  { s: "solicitante", key: "rfc", label: "RFC (con homoclave)", upper: true, mono: true },
  { s: "solicitante", key: "voter_key", label: "Clave de elector", upper: true, mono: true },
  { s: "solicitante", key: "ine_validity", label: "Vigencia INE (año)", type: "int" },
  { s: "solicitante", key: "marital_status", label: "Estado civil", type: "select", options: opt([["single", "Soltero(a)"], ["free_union", "Unión libre"], ["married_joint", "Casado(a) bienes mancomunados / sociedad conyugal"], ["married_separate", "Casado(a) bienes separados"], ["separated", "Separado(a)"], ["divorced", "Divorciado(a)"], ["widowed", "Viudo(a)"]]) },
  { s: "solicitante", key: "dependents", label: "Dependientes económicos", type: "int" },
  { s: "solicitante", key: "mobile_phone", label: "Celular", type: "tel" },
  { s: "solicitante", key: "home_phone", label: "Teléfono de casa", type: "tel" },
  { s: "solicitante", key: "email", label: "Correo", type: "email" },
  { s: "solicitante", key: "nss", label: "NSS (IMSS)", type: "int" },

  { s: "nacimiento", key: "birth_date", label: "Fecha de nacimiento", type: "date" },
  { s: "nacimiento", key: "nationality", label: "Nacionalidad", upper: true },
  { s: "nacimiento", key: "birth_country", label: "País de nacimiento", upper: true },
  { s: "nacimiento", key: "birth_state", label: "Estado de nacimiento", upper: true },
  { s: "nacimiento", key: "birth_city", label: "Ciudad de nacimiento", upper: true },
  { s: "nacimiento", key: "education_level", label: "Estudios", type: "select", options: opt([["none", "Sin estudios"], ["primary", "Primaria"], ["secondary", "Secundaria"], ["high_school", "Preparatoria"], ["bachelor", "Universidad"], ["masters", "Maestría"], ["doctorate", "Doctorado"]]) },
  { s: "nacimiento", key: "profession", label: "Profesión", upper: true },

  { s: "domicilio", key: "street", label: "Calle", upper: true },
  { s: "domicilio", key: "exterior_number", label: "Número exterior" },
  { s: "domicilio", key: "interior_number", label: "Número interior" },
  { s: "domicilio", key: "neighborhood", label: "Colonia", upper: true },
  { s: "domicilio", key: "postal_code", label: "Código postal", type: "int" },
  { s: "domicilio", key: "municipality", label: "Municipio / alcaldía", upper: true },
  { s: "domicilio", key: "city", label: "Ciudad / población", upper: true },
  { s: "domicilio", key: "state", label: "Estado", upper: true },
  { s: "domicilio", key: "housing_status", label: "La vivienda es", type: "select", options: opt([["owned", "Propia"], ["rented", "Rentada"], ["mortgaged", "Hipotecada / pagándola"], ["family", "De familiares"], ["other", "Otra"]]) },
  { s: "domicilio", key: "residence_years", label: "Años en el domicilio", type: "int" },
  { s: "domicilio", key: "residence_months", label: "Meses (además de los años)", type: "int" },
  { s: "domicilio", key: "monthly_rent", label: "Renta mensual", type: "money", when: rented },
  { s: "domicilio", key: "landlord_name", label: "Arrendador · nombre", upper: true, when: rented },
  { s: "domicilio", key: "landlord_phone", label: "Arrendador · teléfono", type: "tel", when: rented },
  { s: "domicilio", key: "landlord_address", label: "Arrendador · dirección", upper: true, when: rented },

  { s: "empleo", key: "employment_status", label: "Situación laboral", type: "select", options: opt([["employed", "Empleado (asalariado)"], ["self_employed", "Profesionista independiente"], ["business_owner", "Negocio propio"], ["retired", "Jubilado / pensionado"]]) },
  { s: "empleo", key: "company_type", label: "Tipo de empresa", type: "select", options: opt([["private", "Privada"], ["public", "Pública"]]) },
  { s: "empleo", key: "company_name", label: "Empresa / negocio", upper: true },
  { s: "empleo", key: "company_activity", label: "Giro o actividad", upper: true },
  { s: "empleo", key: "job_title", label: "Puesto", upper: true },
  { s: "empleo", key: "employment_years", label: "Antigüedad (años)", type: "int" },
  { s: "empleo", key: "employment_months", label: "Antigüedad (meses extra)", type: "int" },
  { s: "empleo", key: "monthly_fixed_income", label: "Ingreso fijo mensual", type: "money" },
  { s: "empleo", key: "monthly_variable_income", label: "Ingreso variable mensual", type: "money" },
  { s: "empleo", key: "work_phone", label: "Teléfono del trabajo", type: "tel" },
  { s: "empleo", key: "work_extension", label: "Extensión" },
  { s: "empleo", key: "work_street", label: "Calle del trabajo", upper: true },
  { s: "empleo", key: "work_exterior_number", label: "Número exterior (trabajo)" },
  { s: "empleo", key: "work_interior_number", label: "Número interior (trabajo)" },
  { s: "empleo", key: "work_neighborhood", label: "Colonia (trabajo)", upper: true },
  { s: "empleo", key: "work_postal_code", label: "CP (trabajo)", type: "int" },
  { s: "empleo", key: "work_municipality", label: "Municipio (trabajo)", upper: true },
  { s: "empleo", key: "work_city", label: "Ciudad (trabajo)", upper: true },
  { s: "empleo", key: "work_state", label: "Estado (trabajo)", upper: true },

  { s: "anterior", key: "previous_company", label: "Empresa anterior", upper: true, when: shortJob },
  { s: "anterior", key: "previous_phone", label: "Teléfono empleo anterior", type: "tel", when: shortJob },
  { s: "anterior", key: "previous_employment_years", label: "Antigüedad anterior (años)", type: "int", when: shortJob },
  { s: "anterior", key: "previous_employment_months", label: "Antigüedad anterior (meses)", type: "int", when: shortJob },

  { s: "referencias", key: "reference_1_name", label: "Referencia familiar · nombre", upper: true },
  { s: "referencias", key: "reference_1_phone", label: "Referencia familiar · teléfono", type: "tel" },
  { s: "referencias", key: "reference_1_address", label: "Referencia familiar · dirección", upper: true },
  { s: "referencias", key: "reference_2_name", label: "Referencia personal · nombre", upper: true },
  { s: "referencias", key: "reference_2_phone", label: "Referencia personal · teléfono", type: "tel" },
  { s: "referencias", key: "reference_2_address", label: "Referencia personal · dirección", upper: true },

  { s: "auto", key: "bank", label: "Banco", type: "select", options: opt([["BBVA", "BBVA"], ["Banorte", "Banorte"], ["Otra", "Otra financiera"]]) },
  { s: "auto", key: "vehicle", label: "Auto (modelo y versión)" },
  { s: "auto", key: "price", label: "Precio", type: "money" },
  { s: "auto", key: "down_payment", label: "Enganche", type: "money" },
  { s: "auto", key: "months", label: "Plazo (meses)", type: "select", options: opt([["12", "12"], ["24", "24"], ["36", "36"], ["48", "48"], ["60", "60"], ["72", "72"]]) },
  { s: "auto", key: "rate", label: "Tasa anual % (para estimar)", type: "money" },
];

const MONEY = new Set(FIELDS.filter((f) => f.type === "money").map((f) => f.key));
const fieldOf = (key) => FIELDS.find((f) => f.key === key);
export const applies = (f, v) => !f.when || f.when(v);

// ───────── Campos obligatorios: los mismos que el banco marca como necesarios ─────────

const NEVER_REQUIRED = new Set(["interior_number", "work_interior_number", "middle_name", "work_extension", "residence_months", "employment_months", "previous_employment_months"]);
const ALWAYS = ["vehicle", "price", "down_payment", "months", "mobile_phone", "ine_validity"];

function conditionApplies(cond, v) {
  if (!cond) return true;
  const val = v[cond.profileKey];
  if (val === undefined || val === "") return false;
  if (cond.equals !== undefined) return String(val) === cond.equals;
  if (cond.lessThan !== undefined) return Number(val) < cond.lessThan;
  return true;
}

export function requiredKeys(v) {
  const adapters = BANKS[v.bank] ? [BANKS[v.bank]] : Object.values(BANKS);
  const keys = new Set(ALWAYS);
  for (const a of adapters) for (const sl of a.slots) {
    const ask = sl.class === "ASK_IF_MISSING" || (sl.class === "CONDITIONAL" && conditionApplies(sl.condition, v));
    if (!ask) continue;
    for (const k of sl.profileKeys ?? []) if (!NEVER_REQUIRED.has(k) && fieldOf(k)) keys.add(k);
  }
  return keys;
}

export function missingFields(v) {
  const req = requiredKeys(v);
  return FIELDS.filter((f) => req.has(f.key) && applies(f, v) && !String(v[f.key] ?? "").trim());
}

/** Datos del cliente que ya conocemos para no volver a pedirlos. */
export function prefillFromCustomer(c) {
  return { mobile_phone: c.phone ?? "", email: c.email ?? "", vehicle: c.vehicle ?? "", nationality: "MEXICANA", birth_country: "MÉXICO" };
}

export const fullName = (v) => [v.first_name, v.middle_name, v.paternal_last_name, v.maternal_last_name].filter(Boolean).join(" ");

// Solicitudes guardadas con la primera versión de la prueba (claves en camelCase).
const OLD = { firstName: "first_name", middleName: "middle_name", lastName1: "paternal_last_name", lastName2: "maternal_last_name", birthDate: "birth_date", voterKey: "voter_key", ineValidity: "ine_validity", phone: "mobile_phone", extNumber: "exterior_number", intNumber: "interior_number", postalCode: "postal_code", residenceYears: "residence_years", employer: "company_name", position: "job_title", employmentYears: "employment_years", workPhone: "work_phone", incomeFixed: "monthly_fixed_income", incomeVariable: "monthly_variable_income", ref1Name: "reference_1_name", ref1Phone: "reference_1_phone", ref2Name: "reference_2_name", ref2Phone: "reference_2_phone", downPayment: "down_payment" };
const OLD_ENUM = {
  sex: ["gender", { H: "male", M: "female" }],
  maritalStatus: ["marital_status", { soltero: "single", casado: "married_joint", union: "free_union", divorciado: "divorced", viudo: "widowed" }],
  housing: ["housing_status", { propia: "owned", rentada: "rented", familiar: "family", hipotecada: "mortgaged" }],
  occupation: ["employment_status", { asalariado: "employed", negocio: "business_owner", profesionista: "self_employed", pensionado: "retired" }],
};
export function migrateValues(v) {
  for (const [o, n] of Object.entries(OLD)) if (v[o] !== undefined) { v[n] ??= v[o]; delete v[o]; }
  for (const [o, [n, map]] of Object.entries(OLD_ENUM)) if (v[o] !== undefined) { v[n] ??= map[v[o]] ?? ""; delete v[o]; }
  return v;
}

// ───────── PDF OFICIAL del banco (AcroForm) ─────────

const splitRef = (ref) => { const m = /^(.*)#(\d+)$/.exec(ref); return m ? { base: m[1], widget: Number(m[2]) } : { base: ref, widget: null }; };

/** ¿Este PDF es la versión del formato que conocemos? Cuenta cuántos campos del mapeo real tiene. */
export async function inspectOfficialForm(bank, bytes) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const names = new Set(doc.getForm().getFields().map((f) => f.getName()));
  const refs = [...new Set(BANKS[bank].slots.filter((s) => s.field).map((s) => splitRef(s.field).base))];
  const found = refs.filter((r) => names.has(r));
  return { total: refs.length, found: found.length, missing: refs.filter((r) => !names.has(r)), pdfFields: names.size };
}

/**
 * Llena una COPIA del PDF oficial con el mapeo real (campo por campo). Nunca marca PEP,
 * consentimientos ni firmas: esos los responde/firma el cliente. No aplana: se puede corregir a mano.
 */
export async function fillOfficialForm(bank, templateBytes, v) {
  const { PDFDocument, PDFCheckBox, PDFTextField, PDFName } = window.PDFLib;
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]));
  const value = (k) => (MONEY.has(k) && v[k] !== "" && v[k] !== undefined ? Number(String(v[k]).replace(/[^\d.]/g, "")) : v[k]);
  const filled = [];
  const notInPdf = [];
  const human = [];
  for (const sl of BANKS[bank].slots) {
    if (sl.class === "HUMAN_CONFIRMATION" || sl.class === "SIGNATURE") { human.push(sl.label); continue; }
    if (!sl.field || !sl.profileKeys?.length || !conditionApplies(sl.condition, v)) continue;
    const { base, widget } = splitRef(sl.field);
    const f = byName.get(base);
    if (!f) { notInPdf.push(sl.label); continue; }
    if (sl.pdfType === "checkbox") {
      if (!(f instanceof PDFCheckBox) || !checkboxMatches(sl.checkedWhen, v[sl.profileKeys[0]])) continue;
      if (widget === null) f.check();
      else {
        const ws = f.acroField.getWidgets();
        const on = ws[widget]?.getOnValue();
        if (!on) { notInPdf.push(sl.label); continue; }
        f.acroField.dict.set(PDFName.of("V"), on);
        ws.forEach((w, i) => w.setAppearanceState(i === widget ? on : PDFName.of("Off")));
      }
      filled.push(sl.label);
    } else if (f instanceof PDFTextField) {
      const txt = transformValue(sl, sl.profileKeys.map(value));
      if (!txt) continue;
      const max = f.getMaxLength();
      f.setText(max ? txt.slice(0, max) : txt);
      filled.push(sl.label);
    }
  }
  doc.setTitle(`Solicitud ${bank} - ${fullName(v)}`);
  doc.setSubject("Prellenado por Sofía. Revisar, completar lo que responde el cliente y firmar a mano.");
  const bytes = await doc.save({ updateFieldAppearances: true });
  return { blob: new Blob([bytes], { type: "application/pdf" }), filled, notInPdf, human: [...new Set(human)] };
}

// ───────── Pre-solicitud propia (resumen + análisis + INE) ─────────

// Las fuentes estándar del PDF solo tienen caracteres latinos (WinAnsi): se limpian símbolos raros.
const clean = (s) => String(s ?? "").replace(/[✓✔]/g, "OK").replace(/[✗✕✖]/g, "X").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ\n]/g, "");

function valueText(f, v) {
  const raw = v[f.key];
  if (raw === undefined || raw === null || raw === "") return "";
  if (f.type === "select") return f.options.find((o) => o[0] === raw)?.[1] ?? raw;
  if (f.type === "money") return f.key === "rate" ? `${raw}%` : money(Number(raw));
  if (f.type === "date") return new Date(`${raw}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  return f.upper ? String(raw).toUpperCase() : String(raw);
}

/** Genera el PDF de la pre-solicitud. images = { front?: Blob, back?: Blob } */
export async function buildCreditPdf(v, customer, images = {}) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Solicitud de crédito - ${fullName(v) || customer.name}`));
  doc.setCreator("Sofía");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 40;
  const ink = rgb(0.1, 0.1, 0.12), dim = rgb(0.42, 0.42, 0.46), line = rgb(0.85, 0.85, 0.87), accent = rgb(0.55, 0.42, 0.2);
  let page = doc.addPage([W, H]);
  let y = H - M;
  const req = requiredKeys(v);

  const text = (t, x, yy, size = 9, f = font, color = ink) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const wrap = (t, maxW, size, f = font) => {
    const words = clean(t).split(/\s+/);
    const out = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && cur) { out.push(cur); cur = w; } else cur = test;
    }
    if (cur) out.push(cur);
    return out;
  };
  const ensure = (need) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };

  const s = state.settings;
  text("SOLICITUD DE CRÉDITO AUTOMOTRIZ", M, y - 4, 15, bold);
  text(`${s.agency || ""}${v.bank ? ` · ${v.bank}` : ""}`, M, y - 20, 10, font, dim);
  const today = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  text(`Fecha: ${today}`, W - M - 160, y - 4, 9, font, dim);
  text(`Asesor: ${s.advisorName || "-"}`, W - M - 160, y - 18, 9, font, dim);
  y -= 34;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: accent });
  y -= 16;

  const colW = (W - 2 * M - 20) / 2;
  for (const sec of SECTIONS) {
    const fields = FIELDS.filter((f) => f.s === sec.id && applies(f, v) && (req.has(f.key) || v[f.key]));
    if (!fields.length) continue;
    ensure(40);
    text(sec.label.toUpperCase(), M, y, 10, bold, accent);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
    y -= 14;
    for (let i = 0; i < fields.length; i += 2) {
      ensure(28);
      for (let j = 0; j < 2; j++) {
        const f = fields[i + j];
        if (!f) continue;
        const x = M + j * (colW + 20);
        text(f.label, x, y, 7.5, font, dim);
        const val = valueText(f, v);
        text(val || "PENDIENTE", x, y - 11, 10, val ? bold : font, val ? ink : rgb(0.75, 0.3, 0.2));
      }
      y -= 26;
    }
    y -= 6;
  }

  const est = creditEstimate(v);
  const id = checkIdentity(v);
  ensure(60);
  text("ANÁLISIS AUTOMÁTICO", M, y, 10, bold, accent);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
  y -= 14;
  const bullets = [
    ...id.checks.map((c) => `${c.ok === true ? "OK" : c.ok === false ? "REVISAR" : "FALTA"} · ${c.text}`),
    ...est.notes,
    ...missingFields(v).map((f) => `FALTA · ${f.label}`),
  ];
  for (const b of bullets) for (const ln of wrap(b, W - 2 * M, 9)) { ensure(14); text(ln, M, y, 9); y -= 12; }
  y -= 8;

  ensure(90);
  y -= 40;
  for (const [i, label] of ["Firma del solicitante", "Firma del asesor"].entries()) {
    const x = M + i * (colW + 20);
    page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.7, color: ink });
    text(label, x, y - 12, 8, font, dim);
  }
  y -= 30;
  for (const ln of wrap("Pre-solicitud para integrar el expediente. La aprobación, tasa, plazo y condiciones finales dependen exclusivamente de la institución financiera. La mensualidad mostrada es una estimación. Los datos personales se tratan conforme al aviso de privacidad de la agencia.", W - 2 * M, 7.5)) {
    ensure(10); text(ln, M, y, 7.5, font, dim); y -= 10;
  }

  const imgs = [["INE · frente", images.front], ["INE · reverso", images.back]].filter((x) => x[1]);
  if (imgs.length) {
    page = doc.addPage([W, H]);
    y = H - M;
    text("IDENTIFICACIÓN OFICIAL", M, y - 4, 13, bold);
    y -= 24;
    for (const [label, blob] of imgs) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let img;
      try { img = blob.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); } catch { continue; }
      const maxW = W - 2 * M, maxH = (H - 2 * M - 80) / 2;
      const sc = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * sc, hh = img.height * sc;
      text(label, M, y, 9, bold, dim);
      y -= hh + 8;
      page.drawImage(img, { x: M, y, width: w, height: hh });
      y -= 20;
    }
  }
  return new Blob([await doc.save()], { type: "application/pdf" });
}
