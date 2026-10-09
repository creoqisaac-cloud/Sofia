/**
 * App de prueba: llenado del PDF OFICIAL (BBVA/Banorte) con el mapeo real de los adaptadores.
 * Se usan PDFs SINTÉTICOS con los mismos nombres de campo que los formatos reales (sin datos de nadie).
 */
import * as PDFLib from "pdf-lib";
import { PDFCheckBox, PDFDocument, PDFName, PDFTextField, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { BANORTE_ADAPTER } from "@/domain/credit/banorte";
import { BBVA_ADAPTER } from "@/domain/credit/bbva";
import type { CreditAdapter } from "@/domain/credit";

type Credit = {
  fillOfficialForm(bank: string, bytes: ArrayBuffer | Uint8Array, v: Record<string, string>): Promise<{ blob: Blob; filled: string[]; notInPdf: string[]; human: string[] }>;
  inspectOfficialForm(bank: string, bytes: Uint8Array): Promise<{ total: number; found: number; missing: string[] }>;
  missingFields(v: Record<string, string>): Array<{ key: string }>;
  requiredKeys(v: Record<string, string>): Set<string>;
};
let credit: Credit;

beforeAll(async () => {
  (globalThis as unknown as { window: unknown }).window = { PDFLib };
  // @ts-expect-error módulo JS de la app de prueba
  credit = await import("../prueba/js/credit.js");
});

/** PDF con los nombres de campo reales del adaptador (casillas "campo#n" = n-ésimo widget). */
async function syntheticForm(adapter: CreditAdapter) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 2000]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  let y = 1980;
  const widgets = new Map<string, number>();
  for (const sl of adapter.slots) {
    if (!sl.field) continue;
    const m = /^(.*)#(\d+)$/.exec(sl.field);
    const base = m ? m[1]! : sl.field;
    const idx = m ? Number(m[2]) : 0;
    if (sl.pdfType === "checkbox") {
      const cb = form.getFieldMaybe(base) as PDFCheckBox | undefined ?? form.createCheckBox(base);
      while ((widgets.get(base) ?? 0) <= idx) { cb.addToPage(page, { x: 20 + (widgets.get(base) ?? 0) * 14, y, width: 10, height: 10 }); widgets.set(base, (widgets.get(base) ?? 0) + 1); y -= 1; }
    } else if (!form.getFieldMaybe(base)) {
      form.createTextField(base).addToPage(page, { x: 200, y, width: 300, height: 12, font });
    }
    y -= 12;
  }
  return doc.save();
}

const PERSON: Record<string, string> = {
  first_name: "PRUEBA", middle_name: "ANA", paternal_last_name: "SINTETICO", maternal_last_name: "EJEMPLO", gender: "female",
  birth_date: "1985-05-05", curp: "SIEP850505MDFNJR09", rfc: "SIEP850505AB1", mobile_phone: "81 1111 1111", email: "ana@example.com",
  nationality: "MEXICANA", marital_status: "married_joint", dependents: "2", education_level: "bachelor",
  street: "FALSA", exterior_number: "123", interior_number: "4", postal_code: "06000", neighborhood: "CENTRO", municipality: "CUAUHTEMOC", city: "CDMX", state: "CIUDAD DE MEXICO",
  housing_status: "rented", monthly_rent: "8000", landlord_name: "ARRENDADOR PRUEBA", landlord_phone: "8122222222", landlord_address: "OTRA 1",
  residence_years: "3", monthly_fixed_income: "45000", company_name: "EMPRESA DEMO SA", company_activity: "COMERCIO", company_type: "private", employment_status: "employed",
  job_title: "GERENTE", employment_years: "1", employment_months: "6", previous_company: "ANTERIOR SA", previous_phone: "8166666666", previous_employment_years: "4", ine_validity: "2033",
  work_phone: "8133333333", work_street: "INDUSTRIAL", work_exterior_number: "50", work_postal_code: "64000", work_neighborhood: "OBRERA", work_municipality: "MONTERREY", work_city: "MONTERREY", work_state: "NUEVO LEON",
  reference_1_name: "REF FAMILIAR", reference_1_phone: "8144444444", reference_1_address: "CALLE 1", reference_2_name: "REF CONOCIDO", reference_2_phone: "8155555555", reference_2_address: "CALLE 2",
  bank: "BBVA", vehicle: "CR-V", price: "650000", down_payment: "130000", months: "48",
};

async function filled(bank: "BBVA" | "Banorte", adapter: CreditAdapter, v = PERSON) {
  const tpl = await syntheticForm(adapter);
  const r = await credit.fillOfficialForm(bank, tpl, v);
  const doc = await PDFDocument.load(new Uint8Array(await r.blob.arrayBuffer()));
  const form = doc.getForm();
  const text = (name: string) => (form.getField(name) as PDFTextField).getText();
  const on = (ref: string) => {
    const [base, i] = ref.split("#");
    const w = (form.getField(base!) as PDFCheckBox).acroField.getWidgets()[Number(i ?? 0)]!;
    return w.getAppearanceState() !== PDFName.of("Off") && w.getAppearanceState() !== undefined;
  };
  const field = (slot: string) => adapter.slots.find((s) => s.slot === slot)!.field!;
  return { r, text, on, field, tpl };
}

describe("formato oficial BBVA (mapeo real)", () => {
  it("reconoce todos los campos del formato conocido", async () => {
    const info = await credit.inspectOfficialForm("BBVA", new Uint8Array(await syntheticForm(BBVA_ADAPTER)));
    expect(info.found).toBe(info.total);
    expect(info.total).toBeGreaterThan(50);
  });

  it("llena texto con sus transformaciones y marca solo la opción correcta", async () => {
    const { r, text, on, field } = await filled("BBVA", BBVA_ADAPTER);
    expect(text(field("bbva.cliente.primer_nombre"))).toBe("PRUEBA");
    expect(text(field("bbva.cliente.nacimiento_dia"))).toBe("05");
    expect(text(field("bbva.cliente.nacimiento_anio"))).toBe("1985");
    expect(text(field("bbva.cliente.tel_celular"))).toBe("8111111111");
    expect(text(field("bbva.domicilio.calle_numero"))).toBe("FALSA 123 4");
    expect(text(field("bbva.empleo.ingreso_fijo"))).toBe("45,000.00");
    expect(on(field("bbva.cliente.genero_f"))).toBe(true);
    expect(on(field("bbva.cliente.genero_m"))).toBe(false);
    expect(on(field("bbva.cliente.civil_casado_mancomunados"))).toBe(true);
    expect(on(field("bbva.cliente.civil_soltero"))).toBe(false);
    expect(on(field("bbva.domicilio.vivienda_rentada"))).toBe(true);
    expect(on(field("bbva.cliente.nacionalidad_mexicana"))).toBe(true);
    // Condicionales: renta → arrendador; antigüedad < 2 → empleo anterior
    expect(text(field("bbva.referencias.arrendador_nombre"))).toBe("ARRENDADOR PRUEBA");
    expect(text(field("bbva.empleo_anterior.empresa"))).toBe("ANTERIOR SA");
    // PEP y firmas nunca se tocan; se reportan para el cliente
    expect(on(field("bbva.pep.es_pep_si"))).toBe(false);
    expect(on(field("bbva.pep.es_pep_no"))).toBe(false);
    expect(r.human.length).toBeGreaterThan(5);
    expect(r.notInPdf).toEqual([]);
  });

  it("no llena el empleo anterior si la antigüedad es de 2 años o más", async () => {
    const { text, field } = await filled("BBVA", BBVA_ADAPTER, { ...PERSON, employment_years: "5" });
    expect(text(field("bbva.empleo_anterior.empresa")) ?? "").toBe("");
  });

  it("los obligatorios siguen al banco elegido", () => {
    const req = credit.requiredKeys({ bank: "BBVA", housing_status: "rented", employment_years: "1" });
    for (const k of ["first_name", "curp", "rfc", "education_level", "company_type", "landlord_name", "previous_company"]) expect(req.has(k)).toBe(true);
    expect(credit.missingFields(PERSON)).toEqual([]);
  });
});

describe("formato oficial Banorte (mapeo real)", () => {
  it("llena nombres juntos, casillas propias y renta", async () => {
    const { text, on, field } = await filled("Banorte", BANORTE_ADAPTER, { ...PERSON, bank: "Banorte" });
    expect(text(field("banorte.cliente.nombres"))).toBe("PRUEBA ANA");
    expect(on(field("banorte.cliente.sexo_f"))).toBe(true);
    expect(on(field("banorte.cliente.sexo_m"))).toBe(false);
    expect(on(field("banorte.domicilio.vivienda_rentado"))).toBe(true);
    expect(text(field("banorte.domicilio.renta"))).toBe("8,000.00");
  });
});
