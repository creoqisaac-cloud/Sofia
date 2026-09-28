/**
 * Adaptador Banorte — mapeado contra el PDF REAL que entregó Mario
 * ("Solicitud de Crédito Automotriz Banorte", AcroForm de 2 páginas, 133 campos).
 *
 * El PDF real usa nombres genéricos ("Check Box145", "Text282"); cada uno se identificó por
 * su posición junto a la etiqueta impresa. Las opciones son casillas separadas.
 *
 * Coacreditado y obligado solidario = CONDITIONAL (se capturan a mano por ahora).
 * Cuestionario médico, consentimientos = HUMAN_CONFIRMATION. Firmas = SIGNATURE.
 * No se llenan: "¿Es cliente Banorte?", cuenta, actividad empresarial, acreditado/obligado,
 * fecha de la solicitud ni importe del crédito (los decide Mario).
 */
import type { ApplicationSlot, CreditAdapter } from "./types";

type Extra = Partial<ApplicationSlot>;
const t = (slot: string, section: string, label: string, profileKeys: string[], cls: ApplicationSlot["class"], field: string, extra: Extra = {}): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: cls,
  profileKeys,
  pdfType: "text",
  field,
  ...extra,
});
const opt = (slot: string, section: string, label: string, profileKey: string, checkedWhen: string, field: string, first = false): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: first ? "ASK_IF_MISSING" : "AUTO_FILL",
  profileKeys: [profileKey],
  pdfType: "checkbox",
  checkedWhen,
  field,
});
const human = (slot: string, section: string, label: string, field: string, pdfType: "text" | "checkbox" = "checkbox"): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "HUMAN_CONFIRMATION",
  pdfType,
  field,
  note: "Lo responde/acepta el cliente personalmente. Sofía nunca lo marca.",
});
const sign = (slot: string, label: string, field: string, condition?: ApplicationSlot["condition"]): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section: "firmas",
  label,
  class: "SIGNATURE",
  pdfType: "text",
  condition,
  field,
  note: "Firma autógrafa. Nunca se inserta.",
});

const COBORROWER = { profileKey: "has_coborrower", equals: "yes", description: "Aplica solo si hay coacreditado." };
const OBLIGOR = { profileKey: "has_joint_obligor", equals: "yes", description: "Aplica solo si hay obligado solidario." };
const PREV_EMPLOYMENT = { profileKey: "employment_years", lessThan: 2, description: "Aplica si la antigüedad actual es menor a 2 años." };
const RENTED = { profileKey: "housing_status", equals: "rented", description: "Aplica solo si la vivienda es rentada." };
const manual = (slot: string, section: string, label: string, field: string, condition: ApplicationSlot["condition"]): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "CONDITIONAL",
  pdfType: "text",
  condition,
  field,
  note: "Datos del coacreditado/obligado: se capturan a mano en esta versión.",
});

export const BANORTE_ADAPTER: CreditAdapter = {
  institutionCode: "BANORTE",
  institutionName: "Banorte",
  sections: [
    { id: "cliente", label: "Datos del cliente" },
    { id: "domicilio", label: "Domicilio" },
    { id: "empleo", label: "Empleo" },
    { id: "coacreditado", label: "Coacreditado" },
    { id: "obligado", label: "Obligado solidario" },
    { id: "medico", label: "Cuestionario médico" },
    { id: "autorizaciones", label: "Consentimientos" },
    { id: "firmas", label: "Firmas" },
  ],
  slots: [
    // Cliente
    t("cliente.nombres", "cliente", "Nombre(s)", ["first_name", "middle_name"], "ASK_IF_MISSING", "NOMBRES", { transform: "upper" }),
    t("cliente.apellido_paterno", "cliente", "Apellido paterno", ["paternal_last_name"], "ASK_IF_MISSING", "APELLIDO PATERNO", { transform: "upper" }),
    t("cliente.apellido_materno", "cliente", "Apellido materno", ["maternal_last_name"], "AUTO_FILL", "APELLIDO MATERNO", { transform: "upper" }),
    opt("cliente.sexo_f", "cliente", "Sexo: F", "gender", "female", "Check Box145", true),
    opt("cliente.sexo_m", "cliente", "Sexo: M", "gender", "male", "Check Box146"),
    opt("cliente.civil_soltero", "cliente", "Estado civil: Soltero", "marital_status", "single", "Check Box3", true),
    opt("cliente.civil_viudo", "cliente", "Estado civil: Viudo", "marital_status", "widowed", "Check Box4"),
    opt("cliente.civil_casado_conyugal", "cliente", "Estado civil: Casado sociedad conyugal", "marital_status", "married_joint", "Check Box6"),
    opt("cliente.civil_casado_separacion", "cliente", "Estado civil: Casado separación de bienes", "marital_status", "married_separate", "Check Box5"),
    opt("cliente.civil_divorciado", "cliente", "Estado civil: Divorciado", "marital_status", "divorced", "Check Box8"),
    t("cliente.nacionalidad", "cliente", "Nacionalidad", ["nationality"], "ASK_IF_MISSING", "NACIONALIDAD", { transform: "upper" }),
    t("cliente.rfc", "cliente", "RFC con homoclave", ["rfc"], "ASK_IF_MISSING", "RFC con homoclave si cuenta con ella", { transform: "upper" }),
    t("cliente.ciudad_nacimiento", "cliente", "Ciudad de nacimiento", ["birth_city"], "AUTO_FILL", "cd de nac 001", { transform: "upper" }),
    t("cliente.curp", "cliente", "CURP", ["curp"], "ASK_IF_MISSING", "CURP", { transform: "upper" }),
    t("cliente.nss", "cliente", "Número de seguro social", ["nss"], "AUTO_FILL", "seguro socila numero"),
    t("cliente.tel_casa", "cliente", "Teléfono casa", ["home_phone"], "AUTO_FILL", "TELÉFONO CASA incluyendo LADA", { transform: "phone10" }),
    t("cliente.tel_celular", "cliente", "Teléfono celular", ["mobile_phone"], "ASK_IF_MISSING", "TELÉFONO CELULAR", { transform: "phone10" }),
    t("cliente.correo", "cliente", "Correo electrónico", ["email"], "ASK_IF_MISSING", "DIRECCIÓN DE CORREO ELECTRÓNICO EMAIL"),
    // Domicilio
    t("domicilio.calle_numero", "domicilio", "Domicilio (calle y número)", ["street", "exterior_number", "interior_number"], "ASK_IF_MISSING", "DOMICILIO calle número exterior e interior", { transform: "upper" }),
    t("domicilio.colonia", "domicilio", "Colonia", ["neighborhood"], "ASK_IF_MISSING", "COLONIA", { transform: "upper" }),
    t("domicilio.poblacion", "domicilio", "Población", ["city"], "ASK_IF_MISSING", "POBLACIÓN", { transform: "upper" }),
    t("domicilio.estado", "domicilio", "Estado", ["state"], "ASK_IF_MISSING", "ESTADO", { transform: "upper" }),
    t("domicilio.cp", "domicilio", "Código postal", ["postal_code"], "ASK_IF_MISSING", "CÓDIGO POSTAL"),
    opt("domicilio.vivienda_familiar", "domicilio", "Inmueble: Casa familiar", "housing_status", "family", "Check Box10", true),
    opt("domicilio.vivienda_propio", "domicilio", "Inmueble: Propio", "housing_status", "owned", "Check Box11"),
    opt("domicilio.vivienda_pagandola", "domicilio", "Inmueble: Pagándola", "housing_status", "mortgaged", "Check Box12"),
    opt("domicilio.vivienda_rentado", "domicilio", "Inmueble: Rentado", "housing_status", "rented", "Check Box13"),
    opt("domicilio.vivienda_otro", "domicilio", "Inmueble: Otro", "housing_status", "other", "Check Box14"),
    t("domicilio.renta", "domicilio", "Renta mensual", ["monthly_rent"], "CONDITIONAL", "cantoidada de renta", { transform: "money", condition: RENTED }),
    // Empleo
    t("empleo.empresa", "empleo", "Nombre de la empresa", ["company_name"], "ASK_IF_MISSING", "nombre de la empresa", { transform: "upper" }),
    t("empleo.tel_oficina", "empleo", "Teléfono oficina", ["work_phone"], "ASK_IF_MISSING", "telefono oficina", { transform: "phone10" }),
    t("empleo.domicilio", "empleo", "Domicilio de la empresa (calle y número)", ["work_street", "work_exterior_number", "work_interior_number"], "ASK_IF_MISSING", "domicilio de la empresa", { transform: "upper" }),
    t("empleo.colonia", "empleo", "Colonia (empresa)", ["work_neighborhood"], "ASK_IF_MISSING", "colonia de la empresa", { transform: "upper" }),
    t("empleo.poblacion", "empleo", "Población (empresa)", ["work_city"], "ASK_IF_MISSING", "poblacion de la empresa 001", { transform: "upper" }),
    t("empleo.estado", "empleo", "Estado (empresa)", ["work_state"], "ASK_IF_MISSING", "estado de la empresa", { transform: "upper" }),
    t("empleo.cp", "empleo", "Código postal (empresa)", ["work_postal_code"], "ASK_IF_MISSING", "cp de la empresa"),
    t("empleo.antiguedad_anios", "empleo", "Antigüedad en el empleo (años)", ["employment_years"], "ASK_IF_MISSING", "ant empresa", { transform: "int" }),
    t("empleo.antiguedad_meses", "empleo", "Antigüedad en el empleo (meses)", ["employment_months"], "AUTO_FILL", "ant  2empresa", { transform: "int" }),
    t("empleo.actividad", "empleo", "Actividad de la empresa", ["company_activity"], "ASK_IF_MISSING", "actividad empresa 234", { transform: "upper" }),
    opt("empleo.posicion_empleado", "empleo", "Posición: Empleado", "employment_status", "employed", "Check Box29", true),
    opt("empleo.posicion_profesionista", "empleo", "Posición: Profesionista independiente", "employment_status", "self_employed", "Check Box30"),
    opt("empleo.posicion_negocio", "empleo", "Posición: Negocio propio", "employment_status", "business_owner", "Check Box32"),
    t("empleo.puesto", "empleo", "Puesto", ["job_title"], "ASK_IF_MISSING", "puesto empresa 00", { transform: "upper" }),
    t("empleo.ant_anterior_anios", "empleo", "Antigüedad empleo anterior (años)", ["previous_employment_years"], "CONDITIONAL", "ant empresa an", { transform: "int", condition: PREV_EMPLOYMENT }),
    t("empleo.ant_anterior_meses", "empleo", "Antigüedad empleo anterior (meses)", ["previous_employment_months"], "CONDITIONAL", "ant  2empresa ant", { transform: "int", condition: PREV_EMPLOYMENT }),
    t("empleo.ingreso_bruto", "empleo", "Ingreso bruto mensual", ["monthly_fixed_income"], "ASK_IF_MISSING", "ingreso bruto 22", { transform: "money" }),
    t("empleo.otros_ingresos", "empleo", "Otros ingresos mensuales brutos", ["monthly_variable_income"], "AUTO_FILL", "ingreso bruto del con", { transform: "money" }),
    // Coacreditado / obligado (a mano)
    manual("coacreditado.nombres", "coacreditado", "Coacreditado · nombre(s)", "NOMBRES DEL CÓNYUGE", COBORROWER),
    manual("coacreditado.apellido_paterno", "coacreditado", "Coacreditado · apellido paterno", "APELLIDO PATERNO_2", COBORROWER),
    manual("coacreditado.apellido_materno", "coacreditado", "Coacreditado · apellido materno", "APELLIDO MATERNO_2", COBORROWER),
    manual("coacreditado.nacionalidad", "coacreditado", "Coacreditado · nacionalidad", "nac del coacre", COBORROWER),
    manual("coacreditado.rfc", "coacreditado", "Coacreditado · RFC", "RFC con", COBORROWER),
    manual("coacreditado.curp", "coacreditado", "Coacreditado · CURP", "CURP dos", COBORROWER),
    manual("coacreditado.correo", "coacreditado", "Coacreditado · correo", "nacio", COBORROWER),
    manual("coacreditado.ingreso", "coacreditado", "Coacreditado · ingreso bruto mensual", "ingreso bruto del sin", COBORROWER),
    manual("coacreditado.empresa", "coacreditado", "Coacreditado · empresa", "nombre de la empresa 7", COBORROWER),
    manual("obligado.nombres", "obligado", "Obligado solidario · nombre(s)", "mane", OBLIGOR),
    manual("obligado.apellido_paterno", "obligado", "Obligado solidario · apellido paterno", "apellidos obligado", OBLIGOR),
    manual("obligado.apellido_materno", "obligado", "Obligado solidario · apellido materno", "obligados del credito importe", OBLIGOR),
    // Humano
    human("medico.cuestionario", "medico", "Cuestionario médico (5 preguntas Sí/No)", "Check Box41"),
    human("medico.peso_estatura", "medico", "Peso y estatura", "Text79", "text"),
    human("autorizaciones.consentimiento_1", "autorizaciones", "Consentimiento (Sí/No) 1", "Check Box61"),
    human("autorizaciones.consentimiento_2", "autorizaciones", "Consentimiento (Sí/No) 2", "Check Box63"),
    human("autorizaciones.consentimiento_3", "autorizaciones", "Consentimiento (Sí/No) 3", "Check Box65"),
    // Firmas
    sign("firmas.solicitante", "Firma del solicitante", "Signature71_es_:signer:signature"),
    sign("firmas.coacreditado", "Firma del coacreditado", "Signature72_es_:signer:signature", COBORROWER),
    sign("firmas.obligado", "Firma del obligado solidario", "Signature7456_:signer:signature", OBLIGOR),
  ],
};

/** Campos del PDF real que Sofía NO llena (Mario/banco o respuestas personales del cliente). */
export const BANORTE_MANUAL_FIELDS = [
  "Check Box261/262 (¿cliente Banorte?)",
  "Text282 (cuenta)",
  "Check Box2619/2628 (actividad empresarial)",
  "Check Box263/264 (acreditado / obligado solidario)",
  "Text297/2970/2971 (fecha de la solicitud)",
  "importe del crediyo (importe del crédito)",
  "TELÉFONO ALTERNO incluyendo LADA",
  "Check Box7 (estado civil: otro) · Check Box31/33 (posición: socio/otra)",
  "Sección III (empleo del coacreditado, campos *7)",
  "Cuestionario médico completo (Check Box41–60, Text79–82)",
  "Check Box61–66 (consentimientos)",
  "Resto de campos de firma (Signature67/68/73/74/75/76/100…)",
];
