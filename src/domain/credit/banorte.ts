/**
 * Adaptador Banorte: perfil universal → slots de la solicitud de crédito automotriz.
 *
 * Incluye cliente, empleo, coacreditado y obligado solidario (CONDITIONAL),
 * cuestionario médico, mercadeo/publicidad y autorizaciones (HUMAN_CONFIRMATION)
 * y firmas (SIGNATURE). Los nombres reales de campo AcroForm viven en la plantilla.
 */
import type { ApplicationSlot, CreditAdapter } from "./types";

const t = (slot: string, section: string, label: string, profileKeys: string[], cls: ApplicationSlot["class"], extra: Partial<ApplicationSlot> = {}): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: cls,
  profileKeys,
  pdfType: "text",
  ...extra,
});
const check = (slot: string, section: string, label: string, profileKey: string, checkedWhen: string): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "ASK_IF_MISSING",
  profileKeys: [profileKey],
  pdfType: "checkbox",
  checkedWhen,
});
const human = (slot: string, section: string, label: string, pdfType: "text" | "checkbox" = "checkbox"): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "HUMAN_CONFIRMATION",
  pdfType,
  note: "Lo responde/acepta el cliente personalmente. Sofía nunca lo marca.",
});
const sign = (slot: string, label: string, condition?: ApplicationSlot["condition"]): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section: "firmas",
  label,
  class: "SIGNATURE",
  pdfType: "text",
  condition,
  note: "Firma autógrafa. Nunca se inserta.",
});

const COBORROWER = { profileKey: "has_coborrower", equals: "yes", description: "Aplica solo si hay coacreditado." };
const OBLIGOR = { profileKey: "has_joint_obligor", equals: "yes", description: "Aplica solo si hay obligado solidario." };
const conditionalBlank = (slot: string, section: string, label: string, condition: ApplicationSlot["condition"]): ApplicationSlot => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "CONDITIONAL",
  pdfType: "text",
  condition,
  note: "Datos del coacreditado/obligado: se capturan aparte (pendiente para Sprint 3).",
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
    { id: "mercadeo", label: "Mercadeo / publicidad" },
    { id: "autorizaciones", label: "Autorizaciones" },
    { id: "firmas", label: "Firmas" },
  ],
  slots: [
    // Cliente
    t("cliente.nombres", "cliente", "Nombre(s)", ["first_name", "middle_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.apellido_paterno", "cliente", "Apellido paterno", ["paternal_last_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.apellido_materno", "cliente", "Apellido materno", ["maternal_last_name"], "AUTO_FILL", { transform: "upper" }),
    check("cliente.sexo_m", "cliente", "Sexo: masculino", "gender", "male"),
    check("cliente.sexo_f", "cliente", "Sexo: femenino", "gender", "female"),
    t("cliente.estado_civil", "cliente", "Estado civil", ["marital_status"], "ASK_IF_MISSING", { transform: "enum_label" }),
    t("cliente.nacionalidad", "cliente", "Nacionalidad", ["nationality"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.rfc", "cliente", "RFC", ["rfc"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.curp", "cliente", "CURP", ["curp"], "ASK_IF_MISSING", { transform: "upper" }),
    t("cliente.fecha_nacimiento", "cliente", "Fecha de nacimiento", ["birth_date"], "ASK_IF_MISSING", { transform: "date_ddmmyyyy" }),
    t("cliente.nss", "cliente", "NSS", ["nss"], "AUTO_FILL"),
    t("cliente.tel_domicilio", "cliente", "Teléfono de domicilio", ["home_phone"], "AUTO_FILL", { transform: "phone10" }),
    t("cliente.tel_celular", "cliente", "Teléfono celular", ["mobile_phone"], "ASK_IF_MISSING", { transform: "phone10" }),
    t("cliente.correo", "cliente", "Correo electrónico", ["email"], "ASK_IF_MISSING"),
    // Domicilio (Banorte usa "calle y número" en un solo campo)
    t("domicilio.calle_numero", "domicilio", "Calle y número", ["street", "exterior_number", "interior_number"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.colonia", "domicilio", "Colonia", ["neighborhood"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.poblacion", "domicilio", "Población", ["city"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.estado", "domicilio", "Estado", ["state"], "ASK_IF_MISSING", { transform: "upper" }),
    t("domicilio.cp", "domicilio", "Código postal", ["postal_code"], "ASK_IF_MISSING"),
    // Empleo
    t("empleo.empresa", "empleo", "Empresa", ["company_name"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.tel_oficina", "empleo", "Teléfono de oficina", ["work_phone"], "ASK_IF_MISSING", { transform: "phone10" }),
    t("empleo.domicilio", "empleo", "Domicilio de la empresa (calle y número)", ["work_street", "work_exterior_number", "work_interior_number"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.colonia", "empleo", "Colonia (empresa)", ["work_neighborhood"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.poblacion", "empleo", "Población (empresa)", ["work_city"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.estado", "empleo", "Estado (empresa)", ["work_state"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.cp", "empleo", "Código postal (empresa)", ["work_postal_code"], "ASK_IF_MISSING"),
    t("empleo.antiguedad_anios", "empleo", "Antigüedad (años)", ["employment_years"], "ASK_IF_MISSING", { transform: "int" }),
    t("empleo.antiguedad_meses", "empleo", "Antigüedad (meses)", ["employment_months"], "AUTO_FILL", { transform: "int" }),
    t("empleo.actividad", "empleo", "Actividad de la empresa", ["company_activity"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.ocupacion", "empleo", "Ocupación / posición", ["occupation_type"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.puesto", "empleo", "Puesto / cargo", ["job_title"], "ASK_IF_MISSING", { transform: "upper" }),
    t("empleo.ingreso_bruto", "empleo", "Ingreso bruto mensual", ["monthly_fixed_income"], "ASK_IF_MISSING", { transform: "money" }),
    t("empleo.otros_ingresos", "empleo", "Otros ingresos", ["monthly_variable_income"], "AUTO_FILL", { transform: "money" }),
    // Coacreditado / obligado solidario (condicionales)
    conditionalBlank("coacreditado.nombre", "coacreditado", "Coacreditado · nombre completo", COBORROWER),
    conditionalBlank("coacreditado.rfc", "coacreditado", "Coacreditado · RFC", COBORROWER),
    conditionalBlank("coacreditado.ingresos", "coacreditado", "Coacreditado · ingresos", COBORROWER),
    conditionalBlank("obligado.nombre", "obligado", "Obligado solidario · nombre completo", OBLIGOR),
    conditionalBlank("obligado.rfc", "obligado", "Obligado solidario · RFC", OBLIGOR),
    // Cuestionario médico (humano)
    human("medico.padecimiento_si", "medico", "¿Padece alguna enfermedad? — Sí"),
    human("medico.padecimiento_no", "medico", "¿Padece alguna enfermedad? — No"),
    human("medico.detalle", "medico", "Detalle del padecimiento", "text"),
    // Mercadeo (humano)
    human("mercadeo.acepta_si", "mercadeo", "Acepta recibir publicidad — Sí"),
    human("mercadeo.acepta_no", "mercadeo", "Acepta recibir publicidad — No"),
    // Autorizaciones (humano)
    human("autorizaciones.consulta_buro", "autorizaciones", "Autorización de consulta a Buró de Crédito"),
    human("autorizaciones.declaraciones", "autorizaciones", "Declaraciones del solicitante"),
    // Firmas
    sign("firmas.solicitante", "Firma del solicitante"),
    sign("firmas.coacreditado", "Firma del coacreditado", COBORROWER),
    sign("firmas.obligado", "Firma del obligado solidario", OBLIGOR),
  ],
};
