/**
 * Adaptador BBVA: perfil universal → slots de la solicitud de crédito automotriz.
 *
 * Los slots cubren las secciones de la solicitud (cliente, empleo, empleo anterior,
 * referencias, PEP, autorizaciones y firmas). Los nombres reales de campo AcroForm
 * se configuran en la plantilla registrada (ver `npm run pdf:inspect`).
 *
 * Reglas: PEP y autorizaciones = HUMAN_CONFIRMATION (nunca se infieren ni se marcan);
 * firmas = SIGNATURE (nunca se insertan).
 */
import type { ApplicationSlot, CreditAdapter } from "./types";

const t = (slot: string, section: string, label: string, profileKeys: string[], cls: ApplicationSlot["class"], extra: Partial<ApplicationSlot> = {}): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: cls,
  profileKeys,
  pdfType: "text",
  ...extra,
});
const check = (slot: string, section: string, label: string, profileKey: string, checkedWhen: string, cls: ApplicationSlot["class"] = "ASK_IF_MISSING"): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: cls,
  profileKeys: [profileKey],
  pdfType: "checkbox",
  checkedWhen,
});
const human = (slot: string, section: string, label: string, pdfType: "text" | "checkbox" = "checkbox"): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: "HUMAN_CONFIRMATION",
  pdfType,
  note: "Lo responde/acepta el cliente personalmente. Sofía nunca lo marca.",
});
const sign = (slot: string, label: string): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section: "firmas",
  label,
  class: "SIGNATURE",
  pdfType: "text",
  note: "Firma autógrafa del cliente. Nunca se inserta.",
});

const PREV_EMPLOYMENT = { profileKey: "employment_years", lessThan: 2, description: "Aplica si la antigüedad actual es menor a 2 años." };

export const BBVA_ADAPTER: CreditAdapter = {
  institutionCode: "BBVA",
  institutionName: "BBVA",
  sections: [
    { id: "cliente", label: "Datos del cliente" },
    { id: "domicilio", label: "Domicilio" },
    { id: "empleo", label: "Empleo" },
    { id: "empleo_anterior", label: "Empleo anterior" },
    { id: "referencias", label: "Referencias" },
    { id: "pep", label: "PEP" },
    { id: "autorizaciones", label: "Autorizaciones" },
    { id: "firmas", label: "Firmas" },
  ],
  slots: [
    // Cliente
    t("cliente.nombres", "cliente", "Nombre(s)", ["first_name", "middle_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.apellido_paterno", "cliente", "Apellido paterno", ["paternal_last_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.apellido_materno", "cliente", "Apellido materno", ["maternal_last_name"], "AUTO_FILL", { transform: "upper" }),
    t("cliente.fecha_nacimiento", "cliente", "Fecha de nacimiento", ["birth_date"], "ASK_IF_MISSING", { transform: "date_ddmmyyyy" }),
    t("cliente.rfc", "cliente", "RFC", ["rfc"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.curp", "cliente", "CURP", ["curp"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.nacionalidad", "cliente", "Nacionalidad", ["nationality"], "ASK_IF_MISSING", { transform: "upper" }),
    check("cliente.genero_masculino", "cliente", "Género: masculino", "gender", "male"),
    check("cliente.genero_femenino", "cliente", "Género: femenino", "gender", "female"),
    t("cliente.estado_civil", "cliente", "Estado civil", ["marital_status"], "ASK_IF_MISSING", { transform: "enum_label" }),
    t("cliente.dependientes", "cliente", "Dependientes económicos", ["dependents"], "ASK_IF_MISSING", { transform: "int" }),
    t("cliente.estudios", "cliente", "Nivel de estudios", ["education_level"], "AUTO_FILL", { transform: "enum_label" }),
    t("cliente.profesion", "cliente", "Profesión", ["profession"], "AUTO_FILL", { transform: "upper" }),
    t("cliente.tel_celular", "cliente", "Teléfono celular", ["mobile_phone"], "ASK_IF_MISSING", { transform: "phone10" }),
    t("cliente.tel_casa", "cliente", "Teléfono de casa", ["home_phone"], "AUTO_FILL", { transform: "phone10" }),
    t("cliente.email", "cliente", "Correo electrónico", ["email"], "ASK_IF_MISSING"),
    // Domicilio
    t("domicilio.calle", "domicilio", "Calle", ["street"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.num_ext", "domicilio", "Número exterior", ["exterior_number"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.num_int", "domicilio", "Número interior", ["interior_number"], "AUTO_FILL", { transform: "upper" }),
    t("domicilio.cp", "domicilio", "Código postal", ["postal_code"], "ASK_IF_MISSING"),
    t("domicilio.colonia", "domicilio", "Colonia", ["neighborhood"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.municipio", "domicilio", "Municipio / alcaldía", ["municipality"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.estado", "domicilio", "Estado", ["state"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.situacion_vivienda", "domicilio", "Situación de vivienda", ["housing_status"], "ASK_IF_MISSING", { transform: "enum_label" }),
    t("domicilio.anios_residencia", "domicilio", "Años de residencia", ["residence_years"], "ASK_IF_MISSING", { transform: "int" }),
    t("domicilio.meses_residencia", "domicilio", "Meses de residencia", ["residence_months"], "AUTO_FILL", { transform: "int" }),
    // Empleo
    t("empleo.ingreso_fijo", "empleo", "Ingreso fijo mensual", ["monthly_fixed_income"], "ASK_IF_MISSING", { transform: "money" }),
    t("empleo.ingreso_variable", "empleo", "Ingreso variable mensual", ["monthly_variable_income"], "AUTO_FILL", { transform: "money" }),
    t("empleo.empresa", "empleo", "Empresa", ["company_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.giro", "empleo", "Actividad / giro", ["company_activity"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.tipo_empresa", "empleo", "Tipo de empresa", ["company_type"], "AUTO_FILL", { transform: "enum_label" }),
    t("empleo.situacion_laboral", "empleo", "Situación laboral", ["employment_status"], "ASK_IF_MISSING", { transform: "enum_label" }),
    t("empleo.puesto", "empleo", "Cargo / puesto", ["job_title"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.antiguedad_anios", "empleo", "Antigüedad (años)", ["employment_years"], "ASK_IF_MISSING", { transform: "int" }),
    t("empleo.antiguedad_meses", "empleo", "Antigüedad (meses)", ["employment_months"], "AUTO_FILL", { transform: "int" }),
    t("empleo.telefono", "empleo", "Teléfono del empleo", ["work_phone"], "ASK_IF_MISSING", { transform: "phone10" }),
    t("empleo.extension", "empleo", "Extensión", ["work_extension"], "AUTO_FILL"),
    t("empleo.calle", "empleo", "Calle (empleo)", ["work_street"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.num_ext", "empleo", "Número exterior (empleo)", ["work_exterior_number"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.num_int", "empleo", "Número interior (empleo)", ["work_interior_number"], "AUTO_FILL", { transform: "upper" }),
    t("empleo.cp", "empleo", "Código postal (empleo)", ["work_postal_code"], "ASK_IF_MISSING"),
    t("empleo.colonia", "empleo", "Colonia (empleo)", ["work_neighborhood"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.municipio", "empleo", "Municipio (empleo)", ["work_municipality"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.estado", "empleo", "Estado (empleo)", ["work_state"], "ASK_IF_MISSING", { transform: "upper" }),
    // Empleo anterior (condicional)
    t("empleo_anterior.empresa", "empleo_anterior", "Empresa anterior", ["previous_company"], "CONDITIONAL", { transform: "upper", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.telefono", "empleo_anterior", "Teléfono empleo anterior", ["previous_phone"], "CONDITIONAL", { transform: "phone10", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.antiguedad_anios", "empleo_anterior", "Antigüedad anterior (años)", ["previous_employment_years"], "CONDITIONAL", { transform: "int", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.antiguedad_meses", "empleo_anterior", "Antigüedad anterior (meses)", ["previous_employment_months"], "CONDITIONAL", { transform: "int", condition: PREV_EMPLOYMENT }),
    // Referencias
    t("referencias.1_nombre", "referencias", "Referencia 1 · nombre", ["reference_1_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("referencias.1_telefono", "referencias", "Referencia 1 · teléfono", ["reference_1_phone"], "ASK_IF_MISSING", { transform: "phone10" }),
    t("referencias.1_parentesco", "referencias", "Referencia 1 · parentesco", ["reference_1_relationship"], "ASK_IF_MISSING", { transform: "upper" }),
    t("referencias.2_nombre", "referencias", "Referencia 2 · nombre", ["reference_2_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("referencias.2_telefono", "referencias", "Referencia 2 · teléfono", ["reference_2_phone"], "ASK_IF_MISSING", { transform: "phone10" }),
    t("referencias.2_parentesco", "referencias", "Referencia 2 · parentesco", ["reference_2_relationship"], "ASK_IF_MISSING", { transform: "upper" }),
    // PEP (humano)
    human("pep.es_pep_si", "pep", "¿Es o ha sido Persona Políticamente Expuesta? — Sí"),
    human("pep.es_pep_no", "pep", "¿Es o ha sido Persona Políticamente Expuesta? — No"),
    human("pep.familiar_pep_si", "pep", "¿Tiene familiar PEP? — Sí"),
    human("pep.familiar_pep_no", "pep", "¿Tiene familiar PEP? — No"),
    human("pep.detalle", "pep", "Detalle PEP (cargo, periodo)", "text"),
    // Autorizaciones (humano)
    human("autorizaciones.consulta_buro", "autorizaciones", "Autorización de consulta a Buró de Crédito"),
    human("autorizaciones.uso_datos_publicidad", "autorizaciones", "Consentimiento de uso de datos con fines publicitarios (opcional)"),
    human("autorizaciones.aviso_privacidad", "autorizaciones", "Acuse de aviso de privacidad"),
    // Firmas
    sign("firmas.solicitante", "Firma del solicitante"),
    sign("firmas.autorizacion_buro", "Firma de autorización de Buró"),
    sign("firmas.aviso_privacidad", "Firma de aviso de privacidad"),
  ],
};
