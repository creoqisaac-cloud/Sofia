/**
 * Perfil universal del cliente (datos personales, contacto, domicilio, empleo,
 * empleo anterior, referencias). Se captura UNA vez y lo reutilizan crédito,
 * solicitudes (BBVA, Banorte, …), ventas y entrega.
 *
 * Estos campos viven en la misma bitácora `customer_facts` que la memoria
 * conversacional de Sprint 1 (no es un sistema paralelo).
 */
import type { FactDef, FactKind } from "./facts";

export const PROFILE_SECTIONS = ["personal", "contact", "address", "employment", "previous_employment", "references", "conditional"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  personal: "Datos personales",
  contact: "Contacto",
  address: "Domicilio",
  employment: "Empleo actual",
  previous_employment: "Empleo anterior",
  references: "Referencias",
  conditional: "Coacreditado / obligado solidario",
};

interface Spec {
  key: string;
  label: string;
  kind?: FactKind;
  section: ProfileSection;
  enumValues?: readonly string[];
  enumLabels?: Record<string, string>;
  pattern?: RegExp;
  upper?: boolean;
  sensitive?: boolean;
  min?: number;
  max?: number;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
}

const GENDER = { male: "Masculino", female: "Femenino" };
const MARITAL = { single: "Soltero(a)", married: "Casado(a) (régimen sin especificar)", married_joint: "Casado(a) bienes mancomunados / sociedad conyugal", married_separate: "Casado(a) separación de bienes", divorced: "Divorciado(a)", separated: "Separado(a)", widowed: "Viudo(a)", free_union: "Unión libre" };
const EDUCATION = { none: "Sin estudios", primary: "Primaria", secondary: "Secundaria", high_school: "Preparatoria", technical: "Técnica", bachelor: "Licenciatura / universidad", masters: "Maestría", doctorate: "Doctorado", postgraduate: "Posgrado (sin especificar)" };
const HOUSING = { owned: "Propia", mortgaged: "Propia (hipotecada)", rented: "Rentada", family: "Familiar", other: "Otra" };
const COMPANY_TYPE = { private: "Privada", public: "Pública / gobierno", own_business: "Negocio propio", other: "Otra" };
const EMPLOYMENT_STATUS = { employed: "Asalariado", self_employed: "Independiente / honorarios", business_owner: "Empresario (PFAE)", retired: "Jubilado / pensionado", other: "Otra" };
const YES_NO = { yes: "Sí", no: "No" };

const SPECS: Spec[] = [
  // Datos personales
  { key: "first_name", label: "Primer nombre", section: "personal" },
  { key: "middle_name", label: "Segundo nombre", section: "personal" },
  { key: "paternal_last_name", label: "Apellido paterno", section: "personal" },
  { key: "maternal_last_name", label: "Apellido materno", section: "personal" },
  { key: "birth_date", label: "Fecha de nacimiento", kind: "date", section: "personal", sensitive: true },
  { key: "birth_city", label: "Ciudad de nacimiento", section: "personal" },
  { key: "birth_state", label: "Estado de nacimiento", section: "personal" },
  { key: "birth_country", label: "País de nacimiento", section: "personal" },
  { key: "nationality", label: "Nacionalidad", section: "personal" },
  { key: "gender", label: "Sexo", kind: "enum", section: "personal", enumValues: Object.keys(GENDER), enumLabels: GENDER },
  { key: "marital_status", label: "Estado civil", kind: "enum", section: "personal", enumValues: Object.keys(MARITAL), enumLabels: MARITAL },
  { key: "dependents", label: "Dependientes económicos", kind: "number", section: "personal", min: 0, max: 20, inputMode: "numeric" },
  { key: "rfc", label: "RFC", section: "personal", pattern: /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, upper: true, sensitive: true },
  { key: "curp", label: "CURP", section: "personal", pattern: /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/, upper: true, sensitive: true },
  { key: "voter_key", label: "Clave de elector (INE)", section: "personal", pattern: /^[A-Z]{6}\d{8}[HM]\d{3}$/, upper: true, sensitive: true },
  { key: "nss", label: "NSS", section: "personal", pattern: /^\d{11}$/, sensitive: true, inputMode: "numeric" },
  { key: "profession", label: "Profesión", section: "personal" },
  { key: "education_level", label: "Escolaridad", kind: "enum", section: "personal", enumValues: Object.keys(EDUCATION), enumLabels: EDUCATION },
  // Contacto
  { key: "mobile_phone", label: "Celular", kind: "phone", section: "contact", sensitive: true, inputMode: "tel" },
  { key: "home_phone", label: "Teléfono de casa", kind: "phone", section: "contact", sensitive: true, inputMode: "tel" },
  { key: "email", label: "Correo electrónico", kind: "email", section: "contact", sensitive: true, inputMode: "email" },
  // Domicilio
  { key: "street", label: "Calle", section: "address", sensitive: true },
  { key: "exterior_number", label: "Número exterior", section: "address", sensitive: true },
  { key: "interior_number", label: "Número interior", section: "address", sensitive: true },
  { key: "neighborhood", label: "Colonia", section: "address", sensitive: true },
  { key: "municipality", label: "Municipio / alcaldía", section: "address" },
  { key: "city", label: "Ciudad / población", section: "address" },
  { key: "state", label: "Estado", section: "address" },
  { key: "postal_code", label: "Código postal", section: "address", pattern: /^\d{5}$/, inputMode: "numeric" },
  { key: "housing_status", label: "Tipo de vivienda", kind: "enum", section: "address", enumValues: Object.keys(HOUSING), enumLabels: HOUSING },
  { key: "residence_years", label: "Años en el domicilio", kind: "number", section: "address", min: 0, max: 99, inputMode: "numeric" },
  { key: "monthly_rent", label: "Renta mensual", kind: "money", section: "address", min: 0, max: 1_000_000, sensitive: true, inputMode: "decimal" },
  { key: "residence_months", label: "Meses en el domicilio", kind: "number", section: "address", min: 0, max: 11, inputMode: "numeric" },
  // Empleo actual
  { key: "company_name", label: "Empresa", section: "employment" },
  { key: "company_activity", label: "Actividad / giro", section: "employment" },
  { key: "company_type", label: "Tipo de empresa", kind: "enum", section: "employment", enumValues: Object.keys(COMPANY_TYPE), enumLabels: COMPANY_TYPE },
  { key: "employment_status", label: "Situación laboral", kind: "enum", section: "employment", enumValues: Object.keys(EMPLOYMENT_STATUS), enumLabels: EMPLOYMENT_STATUS },
  { key: "occupation_type", label: "Ocupación", section: "employment" },
  { key: "job_title", label: "Puesto / cargo", section: "employment" },
  { key: "monthly_fixed_income", label: "Ingreso fijo mensual", kind: "money", section: "employment", min: 1, max: 10_000_000, sensitive: true, inputMode: "decimal" },
  { key: "monthly_variable_income", label: "Ingreso variable mensual", kind: "money", section: "employment", min: 0, max: 10_000_000, sensitive: true, inputMode: "decimal" },
  { key: "employment_years", label: "Antigüedad (años)", kind: "number", section: "employment", min: 0, max: 60, inputMode: "numeric" },
  { key: "employment_months", label: "Antigüedad (meses)", kind: "number", section: "employment", min: 0, max: 11, inputMode: "numeric" },
  { key: "employment_start_date", label: "Fecha de ingreso", kind: "date", section: "employment" },
  { key: "work_phone", label: "Teléfono del trabajo", kind: "phone", section: "employment", inputMode: "tel" },
  { key: "work_extension", label: "Extensión", section: "employment", pattern: /^\d{1,6}$/, inputMode: "numeric" },
  { key: "work_street", label: "Calle (trabajo)", section: "employment" },
  { key: "work_exterior_number", label: "Número exterior (trabajo)", section: "employment" },
  { key: "work_interior_number", label: "Número interior (trabajo)", section: "employment" },
  { key: "work_neighborhood", label: "Colonia (trabajo)", section: "employment" },
  { key: "work_municipality", label: "Municipio (trabajo)", section: "employment" },
  { key: "work_city", label: "Ciudad (trabajo)", section: "employment" },
  { key: "work_state", label: "Estado (trabajo)", section: "employment" },
  { key: "work_postal_code", label: "Código postal (trabajo)", section: "employment", pattern: /^\d{5}$/, inputMode: "numeric" },
  // Empleo anterior
  { key: "previous_company", label: "Empresa anterior", section: "previous_employment" },
  { key: "previous_phone", label: "Teléfono empleo anterior", kind: "phone", section: "previous_employment", inputMode: "tel" },
  { key: "previous_employment_years", label: "Antigüedad anterior (años)", kind: "number", section: "previous_employment", min: 0, max: 60, inputMode: "numeric" },
  { key: "previous_employment_months", label: "Antigüedad anterior (meses)", kind: "number", section: "previous_employment", min: 0, max: 11, inputMode: "numeric" },
  // Referencias
  { key: "reference_1_name", label: "Referencia familiar · nombre", section: "references", sensitive: true },
  { key: "reference_1_phone", label: "Referencia familiar · teléfono", kind: "phone", section: "references", sensitive: true, inputMode: "tel" },
  { key: "reference_1_relationship", label: "Referencia familiar · parentesco", section: "references" },
  { key: "reference_1_address", label: "Referencia familiar · dirección", section: "references", sensitive: true },
  { key: "reference_2_name", label: "Referencia personal (conocido) · nombre", section: "references", sensitive: true },
  { key: "reference_2_phone", label: "Referencia personal · teléfono", kind: "phone", section: "references", sensitive: true, inputMode: "tel" },
  { key: "reference_2_relationship", label: "Referencia personal · relación", section: "references" },
  { key: "reference_2_address", label: "Referencia personal · dirección", section: "references", sensitive: true },
  { key: "landlord_name", label: "Arrendador · nombre (si renta)", section: "references", sensitive: true },
  { key: "landlord_phone", label: "Arrendador · teléfono", kind: "phone", section: "references", sensitive: true, inputMode: "tel" },
  { key: "landlord_address", label: "Arrendador · dirección", section: "references", sensitive: true },
  // Condicionales
  { key: "has_coborrower", label: "¿Tendrá coacreditado?", kind: "enum", section: "conditional", enumValues: Object.keys(YES_NO), enumLabels: YES_NO },
  { key: "has_joint_obligor", label: "¿Tendrá obligado solidario?", kind: "enum", section: "conditional", enumValues: Object.keys(YES_NO), enumLabels: YES_NO },
];

export const PROFILE_FIELD_KEYS = SPECS.map((s) => s.key) as unknown as readonly [
  "first_name", "middle_name", "paternal_last_name", "maternal_last_name", "birth_date", "birth_city", "birth_state", "birth_country",
  "nationality", "gender", "marital_status", "dependents", "rfc", "curp", "voter_key", "nss", "profession", "education_level",
  "mobile_phone", "home_phone", "email",
  "street", "exterior_number", "interior_number", "neighborhood", "municipality", "city", "state", "postal_code", "housing_status",
  "residence_years", "monthly_rent", "residence_months",
  "company_name", "company_activity", "company_type", "employment_status", "occupation_type", "job_title", "monthly_fixed_income",
  "monthly_variable_income", "employment_years", "employment_months", "employment_start_date", "work_phone", "work_extension",
  "work_street", "work_exterior_number", "work_interior_number", "work_neighborhood", "work_municipality", "work_city", "work_state",
  "work_postal_code",
  "previous_company", "previous_phone", "previous_employment_years", "previous_employment_months",
  "reference_1_name", "reference_1_phone", "reference_1_relationship", "reference_1_address", "reference_2_name", "reference_2_phone", "reference_2_relationship",
  "reference_2_address", "landlord_name", "landlord_phone", "landlord_address",
  "has_coborrower", "has_joint_obligor",
];
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

export const PROFILE_FIELD_DEFS: Record<string, FactDef & { section: ProfileSection; inputMode?: Spec["inputMode"] }> = Object.fromEntries(
  SPECS.map((spec) => [
    spec.key,
    {
      key: spec.key as never,
      label: spec.label,
      kind: spec.kind ?? "text",
      enumValues: spec.enumValues,
      enumLabels: spec.enumLabels,
      pattern: spec.pattern,
      upper: spec.upper,
      sensitive: spec.sensitive,
      min: spec.min,
      max: spec.max,
      askPriority: null,
      askPatterns: [],
      section: spec.section,
      inputMode: spec.inputMode,
    },
  ]),
);

export function fieldsBySection(section: ProfileSection) {
  return SPECS.filter((s) => s.section === section).map((s) => PROFILE_FIELD_DEFS[s.key]!);
}
