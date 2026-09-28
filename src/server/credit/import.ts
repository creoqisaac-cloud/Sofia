/**
 * Importación determinista de una solicitud PREVIAMENTE LLENADA (AcroForm) al
 * perfil universal, con su fuente ("Solicitud BBVA (archivo)"). Si choca con
 * datos existentes, se generan conflictos para que Mario decida.
 *
 * Sin OCR ni IA: solo lee valores de campos AcroForm identificados en el mapeo.
 * Nunca importa PEP, consentimientos, salud ni firmas.
 */
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import type { CreditAdapter } from "@/domain/credit";
import { FACT_DEFS, isFactKey } from "@/domain/facts";
import { normalize } from "@/domain/text";

export interface ImportedEntry {
  key: string;
  value: string;
  slot: string;
}

function reverseEnum(profileKey: string, text: string): string | null {
  if (!isFactKey(profileKey)) return null;
  const def = FACT_DEFS[profileKey];
  const n = normalize(text);
  for (const v of def.enumValues ?? []) {
    if (normalize(v) === n || normalize(def.enumLabels?.[v] ?? "") === n || normalize(def.enumLabels?.[v] ?? "").replace(/\(a\)|\(o\)/g, "").trim() === n) return v;
  }
  return null;
}

export async function extractProfileEntries(bytes: Uint8Array, adapter: CreditAdapter, fieldMapping: Record<string, string>): Promise<{ entries: ImportedEntry[]; skipped: string[] }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fields = new Map(doc.getForm().getFields().map((f) => [f.getName(), f]));
  const entries: ImportedEntry[] = [];
  const skipped: string[] = [];
  for (const slot of adapter.slots) {
    if (slot.class === "HUMAN_CONFIRMATION" || slot.class === "SIGNATURE") continue;
    const keys = slot.profileKeys ?? [];
    const pdfField = fieldMapping[slot.slot];
    const field = pdfField ? fields.get(pdfField) : undefined;
    if (!field || keys.length === 0) continue;
    if (slot.pdfType === "checkbox" && field instanceof PDFCheckBox) {
      if (field.isChecked() && slot.checkedWhen) entries.push({ key: keys[0]!, value: slot.checkedWhen, slot: slot.slot });
      continue;
    }
    if (!(field instanceof PDFTextField)) continue;
    const text = (field.getText() ?? "").trim();
    if (!text) continue;
    if (keys.length > 1) {
      // Campos compuestos ("calle y número", "nombre(s)") no se parten a ciegas.
      if (slot.slot.endsWith("nombres")) entries.push({ key: "first_name", value: text.split(/\s+/)[0]!, slot: slot.slot });
      else skipped.push(slot.slot);
      continue;
    }
    const key = keys[0]!;
    if (slot.transform === "enum_label") {
      const v = reverseEnum(key, text);
      if (v) entries.push({ key, value: v, slot: slot.slot });
      else skipped.push(slot.slot);
      continue;
    }
    entries.push({ key, value: text, slot: slot.slot });
  }
  return { entries, skipped };
}
