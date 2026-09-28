/**
 * Adaptador BBVA — mapeado contra el PDF REAL que entregó Mario
 * ("Solicitud de Crédito BBVA", AcroForm de 2 páginas, 101 campos).
 *
 * `field` = nombre exacto del campo AcroForm; "campo#n" = n-ésima opción de una casilla múltiple
 * (Género, Nacionalidad, Estado civil, Estudios, Vivienda, Tipo de empresa, Situación laboral).
 *
 * Reglas: PEP y "actúa por cuenta de un tercero" = HUMAN_CONFIRMATION (nunca se marcan);
 * firmas = SIGNATURE (nunca se insertan). Los campos que no están aquí (folio, fecha de la
 * solicitud, tipo/número de identificación, compañía telefónica, banco de domiciliación, FIEL,
 * país del domicilio) los llena Mario a mano: Sofía no los supone.
 */
import type { ApplicationSlot, CreditAdapter } from "./types";

type Extra = Partial<ApplicationSlot>;
const t = (slot: string, section: string, label: string, profileKeys: string[], cls: ApplicationSlot["class"], field: string, extra: Extra = {}): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: cls,
  profileKeys,
  pdfType: "text",
  field,
  ...extra,
});
/** Casilla de datos: la primera opción del grupo pregunta si falta; las demás no duplican el faltante. */
const opt = (slot: string, section: string, label: string, profileKey: string, checkedWhen: string, field: string, first = false): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: first ? "ASK_IF_MISSING" : "AUTO_FILL",
  profileKeys: [profileKey],
  pdfType: "checkbox",
  checkedWhen,
  field,
});
const human = (slot: string, section: string, label: string, field: string, pdfType: "text" | "checkbox" = "checkbox"): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: "HUMAN_CONFIRMATION",
  pdfType,
  field,
  note: "Lo responde el cliente personalmente. Sofía nunca lo marca.",
});
const sign = (slot: string, label: string, field: string): ApplicationSlot => ({
  slot: `bbva.${slot}`,
  section: "firmas",
  label,
  class: "SIGNATURE",
  pdfType: "text",
  field,
  note: "Firma autógrafa del cliente. Nunca se inserta.",
});

const PREV_EMPLOYMENT = { profileKey: "employment_years", lessThan: 2, description: "Aplica si la antigüedad actual es menor a 2 años." };
const RENTED = { profileKey: "housing_status", equals: "rented", description: "Aplica solo si la vivienda es rentada." };

export const BBVA_ADAPTER: CreditAdapter = {
  institutionCode: "BBVA",
  institutionName: "BBVA",
  sections: [
    { id: "cliente", label: "Datos del cliente" },
    { id: "domicilio", label: "Domicilio" },
    { id: "empleo", label: "Empleo" },
    { id: "empleo_anterior", label: "Empleo anterior" },
    { id: "referencias", label: "Referencias" },
    { id: "pep", label: "PEP / terceros" },
    { id: "firmas", label: "Firmas" },
  ],
  slots: [
    // Cliente
    t("cliente.primer_nombre", "cliente", "Primer nombre", ["first_name"], "ASK_IF_MISSING", "primer nombre", { transform: "upper" }),
    t("cliente.segundo_nombre", "cliente", "Segundo nombre", ["middle_name"], "AUTO_FILL", "segundo nombre", { transform: "upper" }),
    t("cliente.apellido_paterno", "cliente", "Apellido paterno", ["paternal_last_name"], "ASK_IF_MISSING", "Apellido paterno", { transform: "upper" }),
    t("cliente.apellido_materno", "cliente", "Apellido materno", ["maternal_last_name"], "AUTO_FILL", "Apellido materno", { transform: "upper" }),
    t("cliente.nacimiento_dia", "cliente", "Fecha de nacimiento (día)", ["birth_date"], "ASK_IF_MISSING", "nacimiento dia", { transform: "date_dd" }),
    t("cliente.nacimiento_mes", "cliente", "Fecha de nacimiento (mes)", ["birth_date"], "AUTO_FILL", "nacimiento mes", { transform: "date_mm" }),
    t("cliente.nacimiento_anio", "cliente", "Fecha de nacimiento (año)", ["birth_date"], "AUTO_FILL", "nacimiento año", { transform: "date_yyyy" }),
    t("cliente.rfc", "cliente", "RFC", ["rfc"], "ASK_IF_MISSING", "rfc", { transform: "upper" }),
    t("cliente.curp", "cliente", "CURP", ["curp"], "ASK_IF_MISSING", "curp", { transform: "upper" }),
    t("cliente.tel_celular", "cliente", "Teléfono celular", ["mobile_phone"], "ASK_IF_MISSING", "Teléfono celular", { transform: "phone10" }),
    t("cliente.tel_fijo", "cliente", "Teléfono fijo", ["home_phone"], "AUTO_FILL", "teléfono fijo", { transform: "phone10" }),
    t("cliente.email", "cliente", "Correo electrónico", ["email"], "ASK_IF_MISSING", "correo electronico"),
    opt("cliente.genero_m", "cliente", "Género: M", "gender", "male", "gen#0", true),
    opt("cliente.genero_f", "cliente", "Género: F", "gender", "female", "gen#1"),
    opt("cliente.nacionalidad_mexicana", "cliente", "Nacionalidad: Mexicana", "nationality", "MEXICANA|MEXICANO|MEXICO", "nac#0", true),
    opt("cliente.civil_soltero", "cliente", "Estado civil: Soltero", "marital_status", "single", "estado civil#0", true),
    opt("cliente.civil_union_libre", "cliente", "Estado civil: Unión libre", "marital_status", "free_union", "estado civil#1"),
    opt("cliente.civil_viudo", "cliente", "Estado civil: Viudo", "marital_status", "widowed", "estado civil#2"),
    opt("cliente.civil_casado_separados", "cliente", "Estado civil: Casado bienes separados", "marital_status", "married_separate", "estado civil#3"),
    opt("cliente.civil_casado_mancomunados", "cliente", "Estado civil: Casado bienes mancomunados", "marital_status", "married_joint", "estado civil#4"),
    opt("cliente.civil_separado", "cliente", "Estado civil: Separado", "marital_status", "separated", "estado civil#5"),
    opt("cliente.civil_divorciado", "cliente", "Estado civil: Divorciado", "marital_status", "divorced", "estado civil#6"),
    t("cliente.dependientes", "cliente", "Dependientes económicos", ["dependents"], "ASK_IF_MISSING", "Dependientes económicos", { transform: "int" }),
    opt("cliente.estudios_primaria", "cliente", "Estudios: Primaria", "education_level", "primary", "estudios#0", true),
    opt("cliente.estudios_secundaria", "cliente", "Estudios: Secundaria", "education_level", "secondary", "estudios#1"),
    opt("cliente.estudios_preparatoria", "cliente", "Estudios: Preparatoria", "education_level", "high_school", "estudios#2"),
    opt("cliente.estudios_universidad", "cliente", "Estudios: Universidad", "education_level", "bachelor", "estudios#3"),
    opt("cliente.estudios_maestria", "cliente", "Estudios: Maestría", "education_level", "masters", "estudios#4"),
    opt("cliente.estudios_doctorado", "cliente", "Estudios: Doctorado", "education_level", "doctorate", "estudios#5"),
    opt("cliente.estudios_sin", "cliente", "Estudios: Sin estudios", "education_level", "none", "estudios#6"),
    t("cliente.profesion", "cliente", "Profesión", ["profession"], "AUTO_FILL", "profesion", { transform: "upper" }),
    t("cliente.pais_nacimiento", "cliente", "País de nacimiento", ["birth_country"], "AUTO_FILL", "País de nac", { transform: "upper" }),
    t("cliente.estado_nacimiento", "cliente", "Estado de nacimiento", ["birth_state"], "AUTO_FILL", "estado de nac", { transform: "upper" }),
    t("cliente.ciudad_nacimiento", "cliente", "Ciudad de nacimiento", ["birth_city"], "AUTO_FILL", "Ciudad de nac", { transform: "upper" }),
    // Domicilio (BBVA: calle y números en un solo campo)
    t("domicilio.calle_numero", "domicilio", "Domicilio (calle y número)", ["street", "exterior_number", "interior_number"], "ASK_IF_MISSING", "domicilio", { transform: "upper" }),
    t("domicilio.cp", "domicilio", "Código postal", ["postal_code"], "ASK_IF_MISSING", "Código postal"),
    t("domicilio.colonia", "domicilio", "Colonia", ["neighborhood"], "ASK_IF_MISSING", "colonia", { transform: "upper" }),
    t("domicilio.municipio", "domicilio", "Alcaldía o municipio", ["municipality"], "ASK_IF_MISSING", "Alcaldía o Municipio", { transform: "upper" }),
    t("domicilio.ciudad", "domicilio", "Ciudad", ["city"], "AUTO_FILL", "ciudad", { transform: "upper" }),
    t("domicilio.estado", "domicilio", "Estado", ["state"], "ASK_IF_MISSING", "Estado", { transform: "upper" }),
    opt("domicilio.vivienda_propia", "domicilio", "Vivienda: Propia", "housing_status", "owned", "vivienda#0", true),
    opt("domicilio.vivienda_rentada", "domicilio", "Vivienda: Rentada", "housing_status", "rented", "vivienda#1"),
    opt("domicilio.vivienda_hipoteca", "domicilio", "Vivienda: Hipoteca", "housing_status", "mortgaged", "vivienda#2"),
    opt("domicilio.vivienda_familia", "domicilio", "Vivienda: Vive con familia", "housing_status", "family", "vivienda#3"),
    opt("domicilio.vivienda_otros", "domicilio", "Vivienda: Otros", "housing_status", "other", "vivienda#4"),
    t("domicilio.anios_residencia", "domicilio", "Tiempo de residencia (años)", ["residence_years"], "ASK_IF_MISSING", "residencia años", { transform: "int" }),
    t("domicilio.meses_residencia", "domicilio", "Tiempo de residencia (meses)", ["residence_months"], "AUTO_FILL", "residencia meses", { transform: "int" }),
    // Empleo
    t("empleo.ingreso_fijo", "empleo", "Ingreso fijo mensual", ["monthly_fixed_income"], "ASK_IF_MISSING", "ingreso fijo", { transform: "money" }),
    t("empleo.ingreso_variable", "empleo", "Ingreso variable mensual", ["monthly_variable_income"], "AUTO_FILL", "ingreso variable", { transform: "money" }),
    t("empleo.empresa", "empleo", "Nombre de la empresa", ["company_name"], "ASK_IF_MISSING", "Nombre de la empresa razón social  nombre comercial", { transform: "upper" }),
    // En el PDF real el campo se llama "Tipo de empresa" pero está junto a la etiqueta "Actividad o giro de la empresa".
    t("empleo.giro", "empleo", "Actividad o giro de la empresa", ["company_activity"], "ASK_IF_MISSING", "Tipo de empresa", { transform: "upper" }),
    opt("empleo.tipo_publica", "empleo", "Tipo de empresa: Pública", "company_type", "public", "empresa#0", true),
    opt("empleo.tipo_privada", "empleo", "Tipo de empresa: Privada", "company_type", "private", "empresa#1"),
    opt("empleo.situacion_fijo", "empleo", "Situación laboral: Fijo", "employment_status", "employed", "laboral#0", true),
    opt("empleo.situacion_independiente", "empleo", "Situación laboral: Independiente", "employment_status", "self_employed|business_owner", "laboral#1"),
    opt("empleo.situacion_jubilado", "empleo", "Situación laboral: Jubilado", "employment_status", "retired", "laboral#2"),
    t("empleo.cargo", "empleo", "Cargo", ["job_title"], "ASK_IF_MISSING", "cargo", { transform: "upper" }),
    t("empleo.antiguedad_anios", "empleo", "Antigüedad (años)", ["employment_years"], "ASK_IF_MISSING", "laboral años", { transform: "int" }),
    t("empleo.antiguedad_meses", "empleo", "Antigüedad (meses)", ["employment_months"], "AUTO_FILL", "laboral meses", { transform: "int" }),
    t("empleo.telefono", "empleo", "Teléfono del empleo", ["work_phone"], "ASK_IF_MISSING", "telefono empleo", { transform: "phone10" }),
    t("empleo.extension", "empleo", "Extensión", ["work_extension"], "AUTO_FILL", "Extensión"),
    t("empleo.domicilio", "empleo", "Domicilio del empleo (calle y número)", ["work_street", "work_exterior_number", "work_interior_number"], "ASK_IF_MISSING", "dom empleo", { transform: "upper" }),
    t("empleo.cp", "empleo", "Código postal (empleo)", ["work_postal_code"], "ASK_IF_MISSING", "Código postal empleo"),
    t("empleo.colonia", "empleo", "Colonia (empleo)", ["work_neighborhood"], "ASK_IF_MISSING", "colonia empleo", { transform: "upper" }),
    t("empleo.municipio", "empleo", "Alcaldía o municipio (empleo)", ["work_municipality"], "ASK_IF_MISSING", "Alcaldía o Municipio empleo", { transform: "upper" }),
    t("empleo.ciudad", "empleo", "Ciudad (empleo)", ["work_city"], "AUTO_FILL", "ciudad empleo", { transform: "upper" }),
    t("empleo.estado", "empleo", "Estado (empleo)", ["work_state"], "ASK_IF_MISSING", "estado empleo", { transform: "upper" }),
    // Empleo anterior
    t("empleo_anterior.empresa", "empleo_anterior", "Empresa anterior", ["previous_company"], "CONDITIONAL", "nom empresa anterior", { transform: "upper", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.telefono", "empleo_anterior", "Teléfono empleo anterior", ["previous_phone"], "CONDITIONAL", "tel empleo anterior", { transform: "phone10", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.antiguedad_anios", "empleo_anterior", "Antigüedad anterior (años)", ["previous_employment_years"], "CONDITIONAL", "laboral ant años", { transform: "int", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.antiguedad_meses", "empleo_anterior", "Antigüedad anterior (meses)", ["previous_employment_months"], "CONDITIONAL", "laboral ant meses", { transform: "int", condition: PREV_EMPLOYMENT }),
    // Referencias: un conocido y un familiar; arrendador solo si renta
    t("referencias.conocido_nombre", "referencias", "Referencia personal (conocido) · nombre", ["reference_2_name"], "ASK_IF_MISSING", "nom conocido", { transform: "upper" }),
    t("referencias.conocido_telefono", "referencias", "Referencia personal · teléfono", ["reference_2_phone"], "ASK_IF_MISSING", "Tel conocido", { transform: "phone10" }),
    t("referencias.conocido_direccion", "referencias", "Referencia personal · dirección", ["reference_2_address"], "ASK_IF_MISSING", "Dirección conocido", { transform: "upper" }),
    t("referencias.familiar_nombre", "referencias", "Referencia familiar · nombre", ["reference_1_name"], "ASK_IF_MISSING", "nom familiar", { transform: "upper" }),
    t("referencias.familiar_telefono", "referencias", "Referencia familiar · teléfono", ["reference_1_phone"], "ASK_IF_MISSING", "Tel familiar", { transform: "phone10" }),
    t("referencias.familiar_direccion", "referencias", "Referencia familiar · dirección", ["reference_1_address"], "ASK_IF_MISSING", "Dirección familiar", { transform: "upper" }),
    t("referencias.arrendador_nombre", "referencias", "Arrendador · nombre", ["landlord_name"], "CONDITIONAL", "nom arrendador", { transform: "upper", condition: RENTED }),
    t("referencias.arrendador_telefono", "referencias", "Arrendador · teléfono", ["landlord_phone"], "CONDITIONAL", "Teléfono arrendador", { transform: "phone10", condition: RENTED }),
    t("referencias.arrendador_direccion", "referencias", "Arrendador · dirección", ["landlord_address"], "CONDITIONAL", "Dirección arrendador", { transform: "upper", condition: RENTED }),
    // PEP y terceros (humano)
    human("pep.es_pep_si", "pep", "¿Es Persona Políticamente Expuesta? — Sí", "pep#0"),
    human("pep.es_pep_no", "pep", "¿Es Persona Políticamente Expuesta? — No", "pep#1"),
    human("pep.funcion", "pep", "Función desempeñada (PEP)", "funcion desempeñada"),
    human("pep.funcion_otra", "pep", "Otra función (PEP)", "funcion pep", "text"),
    human("pep.familiar_si", "pep", "¿Tiene parentesco con una PEP? — Sí", "rel pep#0"),
    human("pep.familiar_no", "pep", "¿Tiene parentesco con una PEP? — No", "rel pep#1"),
    human("pep.parentesco", "pep", "Parentesco con la PEP", "relacion pep"),
    human("pep.nombre_familiar", "pep", "Nombre de la PEP con la que tiene parentesco", "Cuál es el nombre de la PEP con la que tienes parentesco", "text"),
    human("pep.funcion_familiar", "pep", "Función de la PEP con la que tiene parentesco", "Qué función desempeña o ha desempeñado la PEP con la que tienes parentesco", "text"),
    human("pep.tercero_si", "pep", "¿Actúa por cuenta de un tercero? — Sí", "tercero#0"),
    human("pep.tercero_no", "pep", "¿Actúa por cuenta de un tercero? — No", "tercero#1"),
    human("pep.tercero_especifica", "pep", "Especifica (tercero)", "Especifica", "text"),
    // Firmas (página 2)
    sign("firmas.solicitante", "Firma del solicitante", "Firma del solicitante"),
    sign("firmas.acreditado_1", "Firma del acreditado", "Firma del acreditado"),
    sign("firmas.acreditado_2", "Firma del acreditado (2)", "Firma del acreditado 02"),
    sign("firmas.acreditado_3", "Firma del acreditado (3)", "Firma del acreditado 03"),
  ],
};

/** Campos del PDF real que Sofía NO llena (los captura Mario o el banco). */
export const BBVA_MANUAL_FIELDS = ["operacion", "folio anterior", "dia", "mes", "año", "compañia celular", "Compañía teléfono fijo", "identificacion", "Núm 01…Núm 16", "banco domicialiacion", "fiel", "pais domicilio", "Folio"];
