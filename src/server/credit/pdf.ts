/**
 * PDFs de solicitud (AcroForm) con pdf-lib. Determinista, sin OCR ni coordenadas.
 *
 *  - `inspectPdfFields`: lista los campos reales de un PDF (para construir el mapeo).
 *  - `buildDemoTemplate`: genera una plantilla AcroForm SINTÉTICA (DEMO) cuyo nombre
 *    de campo = slot del adaptador. No es el formato real de ninguna financiera.
 *  - `fillPdf`: carga la plantilla y produce una COPIA nueva con los valores del plan.
 *    Nunca aplana ni toca campos que no estén en el plan (consentimientos, PEP, firmas).
 */
import { PDFButton, PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFRadioGroup, PDFSignature, PDFTextField, StandardFonts, rgb, type PDFField } from "pdf-lib";
import type { CreditAdapter, FillInstruction } from "@/domain/credit";
import { normalize } from "@/domain/text";

export interface PdfFieldInfo {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "signature" | "button" | "other";
}

export async function inspectPdfFields(bytes: Uint8Array): Promise<PdfFieldInfo[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc
    .getForm()
    .getFields()
    .map((f) => {
      const type: PdfFieldInfo["type"] =
        f instanceof PDFTextField ? "text" : f instanceof PDFCheckBox ? "checkbox" : f instanceof PDFRadioGroup ? "radio" : f instanceof PDFDropdown ? "dropdown" : f instanceof PDFSignature ? "signature" : f instanceof PDFButton ? "button" : "other";
      return { name: f.getName(), type };
    });
}

/** "campo#n" → { base: "campo", widget: n }. */
export function splitFieldRef(ref: string): { base: string; widget: number | null } {
  const m = ref.match(/^(.*)#(\d+)$/);
  return m ? { base: m[1]!, widget: Number(m[2]) } : { base: ref, widget: null };
}

/** Mapeo conocido para la versión REAL del PDF (definido en el adaptador, campo por campo). */
export function realMapping(adapter: CreditAdapter): Record<string, string> {
  return Object.fromEntries(adapter.slots.filter((sl) => sl.field).map((sl) => [sl.slot, sl.field!]));
}

/** ¿El PDF tiene todos los campos del mapeo real conocido? (misma versión del formato) */
export function matchesRealMapping(adapter: CreditAdapter, fields: PdfFieldInfo[]): boolean {
  const names = new Set(fields.map((f) => f.name));
  const refs = Object.values(realMapping(adapter));
  return refs.length > 0 && refs.every((r) => names.has(splitFieldRef(r).base));
}

/** Marca SOLO el widget n de una casilla con varias opciones (el resto queda en Off). */
function checkWidget(field: PDFCheckBox, index: number): boolean {
  const widgets = field.acroField.getWidgets();
  const w = widgets[index];
  const on = w?.getOnValue();
  if (!w || !on) return false;
  field.acroField.dict.set(PDFName.of("V"), on);
  widgets.forEach((wd, i) => wd.setAppearanceState(i === index ? on : PDFName.of("Off")));
  return true;
}

/** ¿El campo trae algún valor? (incluye casillas de varias opciones con un widget encendido) */
export function fieldHasValue(field: PDFField): boolean {
  if (field instanceof PDFTextField) return Boolean((field.getText() ?? "").trim());
  if (field instanceof PDFCheckBox) {
    const v = field.acroField.dict.get(PDFName.of("V"));
    return (v instanceof PDFName && v !== PDFName.of("Off")) || field.acroField.getWidgets().some((w) => { const as = w.getAppearanceState(); return as !== undefined && as !== PDFName.of("Off"); });
  }
  if (field instanceof PDFRadioGroup) return Boolean(field.getSelected());
  if (field instanceof PDFDropdown) return field.getSelected().length > 0;
  return false;
}

/** Deja el campo vacío (texto "", casillas en Off). */
export function clearField(field: PDFField) {
  if (field instanceof PDFTextField) field.setText("");
  else if (field instanceof PDFCheckBox) {
    field.acroField.dict.set(PDFName.of("V"), PDFName.of("Off"));
    field.acroField.getWidgets().forEach((w) => w.setAppearanceState(PDFName.of("Off")));
  } else if (field instanceof PDFRadioGroup) field.clear();
  else if (field instanceof PDFDropdown) field.clear();
}

export function isWidgetChecked(field: PDFField, index: number | null): boolean {
  if (!(field instanceof PDFCheckBox)) return false;
  if (index === null) return field.isChecked();
  const w = field.acroField.getWidgets()[index];
  const on = w?.getOnValue();
  return Boolean(w && on && w.getAppearanceState() === on);
}

/**
 * Sugerencia de mapeo slot → campo real por similitud de nombres (para revisión humana).
 * Nunca se usa sin que Mario/desarrollo lo revise y lo guarde en la plantilla.
 */
export function suggestMapping(adapter: CreditAdapter, fields: PdfFieldInfo[]): Record<string, string> {
  const out: Record<string, string> = {};
  const tokens = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length > 2);
  for (const slot of adapter.slots) {
    const exact = fields.find((f) => f.name === slot.slot);
    if (exact) {
      out[slot.slot] = exact.name;
      continue;
    }
    const want = new Set([...tokens(slot.label), ...tokens(slot.slot.split(".").slice(1).join(" "))]);
    let best: { name: string; score: number } | null = null;
    for (const f of fields) {
      if ((slot.pdfType === "checkbox") !== (f.type === "checkbox")) continue;
      const have = tokens(f.name);
      const score = have.filter((t) => want.has(t)).length / Math.max(1, want.size);
      if (score > 0.5 && (!best || score > best.score)) best = { name: f.name, score };
    }
    if (best) out[slot.slot] = best.name;
  }
  return out;
}

export async function buildDemoTemplate(adapter: CreditAdapter): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();
  doc.setTitle(`PLANTILLA DEMO ${adapter.institutionName} — no es el formato real`);
  doc.setProducer("Sofía (plantilla DEMO sintética)");
  let page = doc.addPage([612, 792]);
  let y = 750;
  const header = () => {
    page.drawText(`PLANTILLA DEMO — Solicitud de crédito ${adapter.institutionName}`, { x: 40, y: 765, size: 12, font: bold, color: rgb(0.5, 0, 0) });
    page.drawText("Estructura sintética para pruebas. NO es el formato real de la financiera.", { x: 40, y: 752, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    y = 730;
  };
  header();
  const groups = new Map<string, PDFCheckBox>();
  for (const section of adapter.sections) {
    const slots = adapter.slots.filter((s) => s.section === section.id);
    if (y < 80) {
      page = doc.addPage([612, 792]);
      header();
    }
    page.drawText(section.label.toUpperCase(), { x: 40, y, size: 9, font: bold });
    y -= 16;
    for (const slot of slots) {
      if (y < 50) {
        page = doc.addPage([612, 792]);
        header();
      }
      page.drawText(slot.label.slice(0, 60), { x: 40, y: y + 3, size: 7, font });
      // Mismos nombres de campo que el PDF real (si el adaptador los conoce); si no, el slot.
      const { base, widget } = splitFieldRef(slot.field ?? slot.slot);
      if (slot.pdfType === "checkbox") {
        const cb = widget !== null ? (groups.get(base) ?? form.createCheckBox(base)) : form.createCheckBox(base);
        if (widget !== null) groups.set(base, cb);
        cb.addToPage(page, { x: 330, y, width: 10, height: 10 });
      } else {
        const tf = form.createTextField(base);
        tf.addToPage(page, { x: 330, y: y - 2, width: 240, height: 14, font });
        tf.setFontSize(8);
      }
      y -= 18;
    }
    y -= 8;
  }
  return doc.save();
}

export interface FillResult {
  bytes: Uint8Array;
  filled: FillInstruction[];
  missingInPdf: string[];
  /** Campos con residuos en la plantilla que se limpiaron en la copia. */
  clearedResidue: number;
}

/** Llena una COPIA de la plantilla. Los bytes de entrada nunca se modifican. */
export async function fillPdf(templateBytes: Uint8Array, plan: FillInstruction[], meta: { title: string }): Promise<FillResult> {
  const doc = await PDFDocument.load(templateBytes.slice(), { ignoreEncryption: true });
  const form = doc.getForm();
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]));
  // Garantía: el borrador contiene SOLO datos confirmados. Si el PDF "vacío" traía residuos
  // (p. ej. una respuesta PEP marcada o datos de otro cliente), se limpian en la copia.
  let cleared = 0;
  for (const f of byName.values()) {
    if (fieldHasValue(f)) {
      clearField(f);
      cleared++;
    }
  }
  const filled: FillInstruction[] = [];
  const missingInPdf: string[] = [];
  for (const instr of plan) {
    const { base, widget } = splitFieldRef(instr.pdfField);
    const field = byName.get(base);
    if (!field) {
      missingInPdf.push(instr.slot);
      continue;
    }
    if (instr.pdfType === "checkbox" && field instanceof PDFCheckBox) {
      if (instr.checked) {
        if (widget === null) field.check();
        else if (!checkWidget(field, widget)) {
          missingInPdf.push(instr.slot);
          continue;
        }
      }
      filled.push(instr);
    } else if (instr.pdfType === "text" && field instanceof PDFTextField) {
      const max = field.getMaxLength();
      field.setText(max ? (instr.value ?? "").slice(0, max) : (instr.value ?? ""));
      filled.push(instr);
    } else {
      missingInPdf.push(instr.slot);
    }
  }
  doc.setTitle(meta.title);
  doc.setSubject("BORRADOR prellenado por Sofía — revisar, completar confirmaciones personales y firmar a mano.");
  // No se aplana: Mario puede terminar de capturar en el PDF.
  const bytes = await doc.save({ updateFieldAppearances: true });
  return { bytes, filled, missingInPdf, clearedResidue: cleared };
}
