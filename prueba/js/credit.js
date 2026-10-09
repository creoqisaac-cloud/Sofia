// Solicitud de crédito automotriz: campos, faltantes y PDF (se genera en el propio dispositivo).
import { state } from "./store.js";
import { checkIdentity } from "./ine.js";
import { creditEstimate } from "./rules.js";
import { money } from "./util.js";

export const SECTIONS = [
  { id: "solicitante", label: "Solicitante" },
  { id: "domicilio", label: "Domicilio" },
  { id: "empleo", label: "Empleo e ingresos" },
  { id: "referencias", label: "Referencias" },
  { id: "auto", label: "Auto y crédito" },
];

// required: necesario para mandar la solicitud. type: text | date | select | money | int | tel | email
export const FIELDS = [
  { s: "solicitante", key: "firstName", label: "Primer nombre", required: true, upper: true },
  { s: "solicitante", key: "middleName", label: "Segundo nombre", upper: true },
  { s: "solicitante", key: "lastName1", label: "Apellido paterno", required: true, upper: true },
  { s: "solicitante", key: "lastName2", label: "Apellido materno", upper: true },
  { s: "solicitante", key: "birthDate", label: "Fecha de nacimiento", type: "date", required: true },
  { s: "solicitante", key: "sex", label: "Sexo", type: "select", options: [["", "—"], ["H", "Hombre"], ["M", "Mujer"]], required: true },
  { s: "solicitante", key: "curp", label: "CURP", required: true, upper: true, mono: true },
  { s: "solicitante", key: "rfc", label: "RFC (con homoclave)", required: true, upper: true, mono: true },
  { s: "solicitante", key: "voterKey", label: "Clave de elector", upper: true, mono: true },
  { s: "solicitante", key: "ineValidity", label: "Vigencia INE (año)", type: "int", required: true },
  { s: "solicitante", key: "maritalStatus", label: "Estado civil", type: "select", options: [["", "—"], ["soltero", "Soltero(a)"], ["casado", "Casado(a)"], ["union", "Unión libre"], ["divorciado", "Divorciado(a)"], ["viudo", "Viudo(a)"]] },
  { s: "solicitante", key: "dependents", label: "Dependientes económicos", type: "int" },
  { s: "solicitante", key: "phone", label: "Celular", type: "tel", required: true },
  { s: "solicitante", key: "email", label: "Correo", type: "email" },

  { s: "domicilio", key: "street", label: "Calle", required: true, upper: true },
  { s: "domicilio", key: "extNumber", label: "Número exterior", required: true },
  { s: "domicilio", key: "intNumber", label: "Número interior" },
  { s: "domicilio", key: "neighborhood", label: "Colonia", required: true, upper: true },
  { s: "domicilio", key: "postalCode", label: "Código postal", required: true, type: "int" },
  { s: "domicilio", key: "municipality", label: "Municipio / alcaldía", required: true, upper: true },
  { s: "domicilio", key: "state", label: "Estado", required: true },
  { s: "domicilio", key: "housing", label: "La vivienda es", type: "select", options: [["", "—"], ["propia", "Propia"], ["rentada", "Rentada"], ["familiar", "De familiares"], ["hipotecada", "Hipotecada"]] },
  { s: "domicilio", key: "residenceYears", label: "Años en el domicilio", type: "int" },

  { s: "empleo", key: "occupation", label: "Tipo de ingreso", type: "select", options: [["", "—"], ["asalariado", "Asalariado"], ["negocio", "Negocio propio"], ["profesionista", "Profesionista independiente"], ["pensionado", "Pensionado"]], required: true },
  { s: "empleo", key: "employer", label: "Empresa / negocio", required: true },
  { s: "empleo", key: "position", label: "Puesto" },
  { s: "empleo", key: "employmentYears", label: "Antigüedad (años)", type: "int", required: true },
  { s: "empleo", key: "workPhone", label: "Teléfono del trabajo", type: "tel" },
  { s: "empleo", key: "incomeFixed", label: "Ingreso fijo mensual", type: "money", required: true },
  { s: "empleo", key: "incomeVariable", label: "Ingreso variable mensual", type: "money" },

  { s: "referencias", key: "ref1Name", label: "Referencia 1 · nombre", required: true },
  { s: "referencias", key: "ref1Phone", label: "Referencia 1 · teléfono", type: "tel", required: true },
  { s: "referencias", key: "ref1Relation", label: "Referencia 1 · parentesco" },
  { s: "referencias", key: "ref2Name", label: "Referencia 2 · nombre", required: true },
  { s: "referencias", key: "ref2Phone", label: "Referencia 2 · teléfono", type: "tel", required: true },
  { s: "referencias", key: "ref2Relation", label: "Referencia 2 · parentesco" },

  { s: "auto", key: "bank", label: "Institución", type: "select", options: [["", "—"], ["BBVA", "BBVA"], ["Banorte", "Banorte"], ["Financiera de marca", "Financiera de la marca"], ["Otra", "Otra"]] },
  { s: "auto", key: "vehicle", label: "Auto (modelo y versión)", required: true },
  { s: "auto", key: "price", label: "Precio", type: "money", required: true },
  { s: "auto", key: "downPayment", label: "Enganche", type: "money", required: true },
  { s: "auto", key: "months", label: "Plazo (meses)", type: "select", options: [["", "—"], ["12", "12"], ["24", "24"], ["36", "36"], ["48", "48"], ["60", "60"], ["72", "72"]], required: true },
  { s: "auto", key: "rate", label: "Tasa anual % (para estimar)", type: "money" },
];

export function missingFields(v) {
  return FIELDS.filter((f) => f.required && !String(v[f.key] ?? "").trim());
}

/** Datos del cliente que ya conocemos para no volver a pedirlos. */
export function prefillFromCustomer(c) {
  return { phone: c.phone ?? "", email: c.email ?? "", vehicle: c.vehicle ?? "" };
}

export const fullName = (v) => [v.firstName, v.middleName, v.lastName1, v.lastName2].filter(Boolean).join(" ");

// ───────── PDF ─────────

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

  // Encabezado
  const s = state.settings;
  text("SOLICITUD DE CRÉDITO AUTOMOTRIZ", M, y - 4, 15, bold);
  text(`${s.agency || ""}${v.bank ? ` · ${v.bank}` : ""}`, M, y - 20, 10, font, dim);
  const today = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  text(`Fecha: ${today}`, W - M - 160, y - 4, 9, font, dim);
  text(`Asesor: ${s.advisorName || "—"}`, W - M - 160, y - 18, 9, font, dim);
  y -= 34;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: accent });
  y -= 16;

  // Secciones a dos columnas
  const colW = (W - 2 * M - 20) / 2;
  for (const sec of SECTIONS) {
    const fields = FIELDS.filter((f) => f.s === sec.id);
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
        text(val || (f.required ? "PENDIENTE" : "—"), x, y - 11, 10, val ? bold : font, val ? ink : rgb(0.75, 0.3, 0.2));
      }
      y -= 26;
    }
    y -= 6;
  }

  // Estimación y análisis
  const est = creditEstimate(v);
  const id = checkIdentity(v);
  ensure(60);
  text("ANÁLISIS (AUTOMÁTICO, SIN IA)", M, y, 10, bold, accent);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
  y -= 14;
  const bullets = [
    ...id.checks.map((c) => `${c.ok === true ? "OK" : c.ok === false ? "REVISAR" : "FALTA"} · ${c.text}`),
    ...est.notes,
    ...missingFields(v).map((f) => `FALTA · ${f.label}`),
  ];
  for (const b of bullets) {
    for (const ln of wrap(b, W - 2 * M, 9)) { ensure(14); text(ln, M, y, 9); y -= 12; }
  }
  y -= 8;

  // Firmas
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

  // INE (frente y reverso)
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
