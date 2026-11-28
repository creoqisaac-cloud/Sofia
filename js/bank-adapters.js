// GENERADO por scripts/prueba-generar.mjs desde src/domain/credit (adaptadores reales BBVA/Banorte). No editar a mano.

// src/domain/credit/bbva.ts
var t = (slot, section, label, profileKeys, cls, field, extra = {}) => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: cls,
  profileKeys,
  pdfType: "text",
  field,
  ...extra
});
var opt = (slot, section, label, profileKey, checkedWhen, field, first = false) => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: first ? "ASK_IF_MISSING" : "AUTO_FILL",
  profileKeys: [profileKey],
  pdfType: "checkbox",
  checkedWhen,
  field
});
var human = (slot, section, label, field, pdfType = "checkbox") => ({
  slot: `bbva.${slot}`,
  section,
  label,
  class: "HUMAN_CONFIRMATION",
  pdfType,
  field,
  note: "Lo responde el cliente personalmente. Sof\xEDa nunca lo marca."
});
var sign = (slot, label, field) => ({
  slot: `bbva.${slot}`,
  section: "firmas",
  label,
  class: "SIGNATURE",
  pdfType: "text",
  field,
  note: "Firma aut\xF3grafa del cliente. Nunca se inserta."
});
var PREV_EMPLOYMENT = { profileKey: "employment_years", lessThan: 2, description: "Aplica si la antig\xFCedad actual es menor a 2 a\xF1os." };
var RENTED = { profileKey: "housing_status", equals: "rented", description: "Aplica solo si la vivienda es rentada." };
var BBVA_ADAPTER = {
  institutionCode: "BBVA",
  institutionName: "BBVA",
  sections: [
    { id: "cliente", label: "Datos del cliente" },
    { id: "domicilio", label: "Domicilio" },
    { id: "empleo", label: "Empleo" },
    { id: "empleo_anterior", label: "Empleo anterior" },
    { id: "referencias", label: "Referencias" },
    { id: "pep", label: "PEP / terceros" },
    { id: "firmas", label: "Firmas" }
  ],
  slots: [
    // Cliente
    t("cliente.primer_nombre", "cliente", "Primer nombre", ["first_name"], "ASK_IF_MISSING", "primer nombre", { transform: "upper" }),
    t("cliente.segundo_nombre", "cliente", "Segundo nombre", ["middle_name"], "AUTO_FILL", "segundo nombre", { transform: "upper" }),
    t("cliente.apellido_paterno", "cliente", "Apellido paterno", ["paternal_last_name"], "ASK_IF_MISSING", "Apellido paterno", { transform: "upper" }),
    t("cliente.apellido_materno", "cliente", "Apellido materno", ["maternal_last_name"], "AUTO_FILL", "Apellido materno", { transform: "upper" }),
    t("cliente.nacimiento_dia", "cliente", "Fecha de nacimiento (d\xEDa)", ["birth_date"], "ASK_IF_MISSING", "nacimiento dia", { transform: "date_dd" }),
    t("cliente.nacimiento_mes", "cliente", "Fecha de nacimiento (mes)", ["birth_date"], "AUTO_FILL", "nacimiento mes", { transform: "date_mm" }),
    t("cliente.nacimiento_anio", "cliente", "Fecha de nacimiento (a\xF1o)", ["birth_date"], "AUTO_FILL", "nacimiento a\xF1o", { transform: "date_yyyy" }),
    t("cliente.rfc", "cliente", "RFC", ["rfc"], "ASK_IF_MISSING", "rfc", { transform: "upper" }),
    t("cliente.curp", "cliente", "CURP", ["curp"], "ASK_IF_MISSING", "curp", { transform: "upper" }),
    t("cliente.tel_celular", "cliente", "Tel\xE9fono celular", ["mobile_phone"], "ASK_IF_MISSING", "Tel\xE9fono celular", { transform: "phone10" }),
    t("cliente.tel_fijo", "cliente", "Tel\xE9fono fijo", ["home_phone"], "AUTO_FILL", "tel\xE9fono fijo", { transform: "phone10" }),
    t("cliente.email", "cliente", "Correo electr\xF3nico", ["email"], "ASK_IF_MISSING", "correo electronico"),
    opt("cliente.genero_m", "cliente", "G\xE9nero: M", "gender", "male", "gen#0", true),
    opt("cliente.genero_f", "cliente", "G\xE9nero: F", "gender", "female", "gen#1"),
    opt("cliente.nacionalidad_mexicana", "cliente", "Nacionalidad: Mexicana", "nationality", "MEXICANA|MEXICANO|MEXICO", "nac#0", true),
    opt("cliente.civil_soltero", "cliente", "Estado civil: Soltero", "marital_status", "single", "estado civil#0", true),
    opt("cliente.civil_union_libre", "cliente", "Estado civil: Uni\xF3n libre", "marital_status", "free_union", "estado civil#1"),
    opt("cliente.civil_viudo", "cliente", "Estado civil: Viudo", "marital_status", "widowed", "estado civil#2"),
    opt("cliente.civil_casado_separados", "cliente", "Estado civil: Casado bienes separados", "marital_status", "married_separate", "estado civil#3"),
    opt("cliente.civil_casado_mancomunados", "cliente", "Estado civil: Casado bienes mancomunados", "marital_status", "married_joint", "estado civil#4"),
    opt("cliente.civil_separado", "cliente", "Estado civil: Separado", "marital_status", "separated", "estado civil#5"),
    opt("cliente.civil_divorciado", "cliente", "Estado civil: Divorciado", "marital_status", "divorced", "estado civil#6"),
    t("cliente.dependientes", "cliente", "Dependientes econ\xF3micos", ["dependents"], "ASK_IF_MISSING", "Dependientes econ\xF3micos", { transform: "int" }),
    opt("cliente.estudios_primaria", "cliente", "Estudios: Primaria", "education_level", "primary", "estudios#0", true),
    opt("cliente.estudios_secundaria", "cliente", "Estudios: Secundaria", "education_level", "secondary", "estudios#1"),
    opt("cliente.estudios_preparatoria", "cliente", "Estudios: Preparatoria", "education_level", "high_school", "estudios#2"),
    opt("cliente.estudios_universidad", "cliente", "Estudios: Universidad", "education_level", "bachelor", "estudios#3"),
    opt("cliente.estudios_maestria", "cliente", "Estudios: Maestr\xEDa", "education_level", "masters", "estudios#4"),
    opt("cliente.estudios_doctorado", "cliente", "Estudios: Doctorado", "education_level", "doctorate", "estudios#5"),
    opt("cliente.estudios_sin", "cliente", "Estudios: Sin estudios", "education_level", "none", "estudios#6"),
    t("cliente.profesion", "cliente", "Profesi\xF3n", ["profession"], "AUTO_FILL", "profesion", { transform: "upper" }),
    t("cliente.pais_nacimiento", "cliente", "Pa\xEDs de nacimiento", ["birth_country"], "AUTO_FILL", "Pa\xEDs de nac", { transform: "upper" }),
    t("cliente.estado_nacimiento", "cliente", "Estado de nacimiento", ["birth_state"], "AUTO_FILL", "estado de nac", { transform: "upper" }),
    t("cliente.ciudad_nacimiento", "cliente", "Ciudad de nacimiento", ["birth_city"], "AUTO_FILL", "Ciudad de nac", { transform: "upper" }),
    // Domicilio (BBVA: calle y números en un solo campo)
    t("domicilio.calle_numero", "domicilio", "Domicilio (calle y n\xFAmero)", ["street", "exterior_number", "interior_number"], "ASK_IF_MISSING", "domicilio", { transform: "upper" }),
    t("domicilio.cp", "domicilio", "C\xF3digo postal", ["postal_code"], "ASK_IF_MISSING", "C\xF3digo postal"),
    t("domicilio.colonia", "domicilio", "Colonia", ["neighborhood"], "ASK_IF_MISSING", "colonia", { transform: "upper" }),
    t("domicilio.municipio", "domicilio", "Alcald\xEDa o municipio", ["municipality"], "ASK_IF_MISSING", "Alcald\xEDa o Municipio", { transform: "upper" }),
    t("domicilio.ciudad", "domicilio", "Ciudad", ["city"], "AUTO_FILL", "ciudad", { transform: "upper" }),
    t("domicilio.estado", "domicilio", "Estado", ["state"], "ASK_IF_MISSING", "Estado", { transform: "upper" }),
    opt("domicilio.vivienda_propia", "domicilio", "Vivienda: Propia", "housing_status", "owned", "vivienda#0", true),
    opt("domicilio.vivienda_rentada", "domicilio", "Vivienda: Rentada", "housing_status", "rented", "vivienda#1"),
    opt("domicilio.vivienda_hipoteca", "domicilio", "Vivienda: Hipoteca", "housing_status", "mortgaged", "vivienda#2"),
    opt("domicilio.vivienda_familia", "domicilio", "Vivienda: Vive con familia", "housing_status", "family", "vivienda#3"),
    opt("domicilio.vivienda_otros", "domicilio", "Vivienda: Otros", "housing_status", "other", "vivienda#4"),
    t("domicilio.anios_residencia", "domicilio", "Tiempo de residencia (a\xF1os)", ["residence_years"], "ASK_IF_MISSING", "residencia a\xF1os", { transform: "int" }),
    t("domicilio.meses_residencia", "domicilio", "Tiempo de residencia (meses)", ["residence_months"], "AUTO_FILL", "residencia meses", { transform: "int" }),
    // Empleo
    t("empleo.ingreso_fijo", "empleo", "Ingreso fijo mensual", ["monthly_fixed_income"], "ASK_IF_MISSING", "ingreso fijo", { transform: "money" }),
    t("empleo.ingreso_variable", "empleo", "Ingreso variable mensual", ["monthly_variable_income"], "AUTO_FILL", "ingreso variable", { transform: "money" }),
    t("empleo.empresa", "empleo", "Nombre de la empresa", ["company_name"], "ASK_IF_MISSING", "Nombre de la empresa raz\xF3n social  nombre comercial", { transform: "upper" }),
    // En el PDF real el campo se llama "Tipo de empresa" pero está junto a la etiqueta "Actividad o giro de la empresa".
    t("empleo.giro", "empleo", "Actividad o giro de la empresa", ["company_activity"], "ASK_IF_MISSING", "Tipo de empresa", { transform: "upper" }),
    opt("empleo.tipo_publica", "empleo", "Tipo de empresa: P\xFAblica", "company_type", "public", "empresa#0", true),
    opt("empleo.tipo_privada", "empleo", "Tipo de empresa: Privada", "company_type", "private", "empresa#1"),
    opt("empleo.situacion_fijo", "empleo", "Situaci\xF3n laboral: Fijo", "employment_status", "employed", "laboral#0", true),
    opt("empleo.situacion_independiente", "empleo", "Situaci\xF3n laboral: Independiente", "employment_status", "self_employed|business_owner", "laboral#1"),
    opt("empleo.situacion_jubilado", "empleo", "Situaci\xF3n laboral: Jubilado", "employment_status", "retired", "laboral#2"),
    t("empleo.cargo", "empleo", "Cargo", ["job_title"], "ASK_IF_MISSING", "cargo", { transform: "upper" }),
    t("empleo.antiguedad_anios", "empleo", "Antig\xFCedad (a\xF1os)", ["employment_years"], "ASK_IF_MISSING", "laboral a\xF1os", { transform: "int" }),
    t("empleo.antiguedad_meses", "empleo", "Antig\xFCedad (meses)", ["employment_months"], "AUTO_FILL", "laboral meses", { transform: "int" }),
    t("empleo.telefono", "empleo", "Tel\xE9fono del empleo", ["work_phone"], "ASK_IF_MISSING", "telefono empleo", { transform: "phone10" }),
    t("empleo.extension", "empleo", "Extensi\xF3n", ["work_extension"], "AUTO_FILL", "Extensi\xF3n"),
    t("empleo.domicilio", "empleo", "Domicilio del empleo (calle y n\xFAmero)", ["work_street", "work_exterior_number", "work_interior_number"], "ASK_IF_MISSING", "dom empleo", { transform: "upper" }),
    t("empleo.cp", "empleo", "C\xF3digo postal (empleo)", ["work_postal_code"], "ASK_IF_MISSING", "C\xF3digo postal empleo"),
    t("empleo.colonia", "empleo", "Colonia (empleo)", ["work_neighborhood"], "ASK_IF_MISSING", "colonia empleo", { transform: "upper" }),
    t("empleo.municipio", "empleo", "Alcald\xEDa o municipio (empleo)", ["work_municipality"], "ASK_IF_MISSING", "Alcald\xEDa o Municipio empleo", { transform: "upper" }),
    t("empleo.ciudad", "empleo", "Ciudad (empleo)", ["work_city"], "AUTO_FILL", "ciudad empleo", { transform: "upper" }),
    t("empleo.estado", "empleo", "Estado (empleo)", ["work_state"], "ASK_IF_MISSING", "estado empleo", { transform: "upper" }),
    // Empleo anterior
    t("empleo_anterior.empresa", "empleo_anterior", "Empresa anterior", ["previous_company"], "CONDITIONAL", "nom empresa anterior", { transform: "upper", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.telefono", "empleo_anterior", "Tel\xE9fono empleo anterior", ["previous_phone"], "CONDITIONAL", "tel empleo anterior", { transform: "phone10", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.antiguedad_anios", "empleo_anterior", "Antig\xFCedad anterior (a\xF1os)", ["previous_employment_years"], "CONDITIONAL", "laboral ant a\xF1os", { transform: "int", condition: PREV_EMPLOYMENT }),
    t("empleo_anterior.antiguedad_meses", "empleo_anterior", "Antig\xFCedad anterior (meses)", ["previous_employment_months"], "CONDITIONAL", "laboral ant meses", { transform: "int", condition: PREV_EMPLOYMENT }),
    // Referencias: un conocido y un familiar; arrendador solo si renta
    t("referencias.conocido_nombre", "referencias", "Referencia personal (conocido) \xB7 nombre", ["reference_2_name"], "ASK_IF_MISSING", "nom conocido", { transform: "upper" }),
    t("referencias.conocido_telefono", "referencias", "Referencia personal \xB7 tel\xE9fono", ["reference_2_phone"], "ASK_IF_MISSING", "Tel conocido", { transform: "phone10" }),
    t("referencias.conocido_direccion", "referencias", "Referencia personal \xB7 direcci\xF3n", ["reference_2_address"], "ASK_IF_MISSING", "Direcci\xF3n conocido", { transform: "upper" }),
    t("referencias.familiar_nombre", "referencias", "Referencia familiar \xB7 nombre", ["reference_1_name"], "ASK_IF_MISSING", "nom familiar", { transform: "upper" }),
    t("referencias.familiar_telefono", "referencias", "Referencia familiar \xB7 tel\xE9fono", ["reference_1_phone"], "ASK_IF_MISSING", "Tel familiar", { transform: "phone10" }),
    t("referencias.familiar_direccion", "referencias", "Referencia familiar \xB7 direcci\xF3n", ["reference_1_address"], "ASK_IF_MISSING", "Direcci\xF3n familiar", { transform: "upper" }),
    t("referencias.arrendador_nombre", "referencias", "Arrendador \xB7 nombre", ["landlord_name"], "CONDITIONAL", "nom arrendador", { transform: "upper", condition: RENTED }),
    t("referencias.arrendador_telefono", "referencias", "Arrendador \xB7 tel\xE9fono", ["landlord_phone"], "CONDITIONAL", "Tel\xE9fono arrendador", { transform: "phone10", condition: RENTED }),
    t("referencias.arrendador_direccion", "referencias", "Arrendador \xB7 direcci\xF3n", ["landlord_address"], "CONDITIONAL", "Direcci\xF3n arrendador", { transform: "upper", condition: RENTED }),
    // PEP y terceros (humano)
    human("pep.es_pep_si", "pep", "\xBFEs Persona Pol\xEDticamente Expuesta? \u2014 S\xED", "pep#0"),
    human("pep.es_pep_no", "pep", "\xBFEs Persona Pol\xEDticamente Expuesta? \u2014 No", "pep#1"),
    human("pep.funcion", "pep", "Funci\xF3n desempe\xF1ada (PEP)", "funcion desempe\xF1ada"),
    human("pep.funcion_otra", "pep", "Otra funci\xF3n (PEP)", "funcion pep", "text"),
    human("pep.familiar_si", "pep", "\xBFTiene parentesco con una PEP? \u2014 S\xED", "rel pep#0"),
    human("pep.familiar_no", "pep", "\xBFTiene parentesco con una PEP? \u2014 No", "rel pep#1"),
    human("pep.parentesco", "pep", "Parentesco con la PEP", "relacion pep"),
    human("pep.nombre_familiar", "pep", "Nombre de la PEP con la que tiene parentesco", "Cu\xE1l es el nombre de la PEP con la que tienes parentesco", "text"),
    human("pep.funcion_familiar", "pep", "Funci\xF3n de la PEP con la que tiene parentesco", "Qu\xE9 funci\xF3n desempe\xF1a o ha desempe\xF1ado la PEP con la que tienes parentesco", "text"),
    human("pep.tercero_si", "pep", "\xBFAct\xFAa por cuenta de un tercero? \u2014 S\xED", "tercero#0"),
    human("pep.tercero_no", "pep", "\xBFAct\xFAa por cuenta de un tercero? \u2014 No", "tercero#1"),
    human("pep.tercero_especifica", "pep", "Especifica (tercero)", "Especifica", "text"),
    // Firmas (página 2)
    sign("firmas.solicitante", "Firma del solicitante", "Firma del solicitante"),
    sign("firmas.acreditado_1", "Firma del acreditado", "Firma del acreditado"),
    sign("firmas.acreditado_2", "Firma del acreditado (2)", "Firma del acreditado 02"),
    sign("firmas.acreditado_3", "Firma del acreditado (3)", "Firma del acreditado 03")
  ]
};

// src/domain/credit/banorte.ts
var t2 = (slot, section, label, profileKeys, cls, field, extra = {}) => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: cls,
  profileKeys,
  pdfType: "text",
  field,
  ...extra
});
var opt2 = (slot, section, label, profileKey, checkedWhen, field, first = false) => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: first ? "ASK_IF_MISSING" : "AUTO_FILL",
  profileKeys: [profileKey],
  pdfType: "checkbox",
  checkedWhen,
  field
});
var human2 = (slot, section, label, field, pdfType = "checkbox") => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "HUMAN_CONFIRMATION",
  pdfType,
  field,
  note: "Lo responde/acepta el cliente personalmente. Sof\xEDa nunca lo marca."
});
var sign2 = (slot, label, field, condition) => ({
  slot: `banorte.${slot}`,
  section: "firmas",
  label,
  class: "SIGNATURE",
  pdfType: "text",
  condition,
  field,
  note: "Firma aut\xF3grafa. Nunca se inserta."
});
var COBORROWER = { profileKey: "has_coborrower", equals: "yes", description: "Aplica solo si hay coacreditado." };
var OBLIGOR = { profileKey: "has_joint_obligor", equals: "yes", description: "Aplica solo si hay obligado solidario." };
var PREV_EMPLOYMENT2 = { profileKey: "employment_years", lessThan: 2, description: "Aplica si la antig\xFCedad actual es menor a 2 a\xF1os." };
var RENTED2 = { profileKey: "housing_status", equals: "rented", description: "Aplica solo si la vivienda es rentada." };
var manual = (slot, section, label, field, condition) => ({
  slot: `banorte.${slot}`,
  section,
  label,
  class: "CONDITIONAL",
  pdfType: "text",
  condition,
  field,
  note: "Datos del coacreditado/obligado: se capturan a mano en esta versi\xF3n."
});
var BANORTE_ADAPTER = {
  institutionCode: "BANORTE",
  institutionName: "Banorte",
  sections: [
    { id: "cliente", label: "Datos del cliente" },
    { id: "domicilio", label: "Domicilio" },
    { id: "empleo", label: "Empleo" },
    { id: "coacreditado", label: "Coacreditado" },
    { id: "obligado", label: "Obligado solidario" },
    { id: "medico", label: "Cuestionario m\xE9dico" },
    { id: "autorizaciones", label: "Consentimientos" },
    { id: "firmas", label: "Firmas" }
  ],
  slots: [
    // Cliente
    t2("cliente.nombres", "cliente", "Nombre(s)", ["first_name", "middle_name"], "ASK_IF_MISSING", "NOMBRES", { transform: "upper" }),
    t2("cliente.apellido_paterno", "cliente", "Apellido paterno", ["paternal_last_name"], "ASK_IF_MISSING", "APELLIDO PATERNO", { transform: "upper" }),
    t2("cliente.apellido_materno", "cliente", "Apellido materno", ["maternal_last_name"], "AUTO_FILL", "APELLIDO MATERNO", { transform: "upper" }),
    opt2("cliente.sexo_f", "cliente", "Sexo: F", "gender", "female", "Check Box145", true),
    opt2("cliente.sexo_m", "cliente", "Sexo: M", "gender", "male", "Check Box146"),
    opt2("cliente.civil_soltero", "cliente", "Estado civil: Soltero", "marital_status", "single", "Check Box3", true),
    opt2("cliente.civil_viudo", "cliente", "Estado civil: Viudo", "marital_status", "widowed", "Check Box4"),
    opt2("cliente.civil_casado_conyugal", "cliente", "Estado civil: Casado sociedad conyugal", "marital_status", "married_joint", "Check Box6"),
    opt2("cliente.civil_casado_separacion", "cliente", "Estado civil: Casado separaci\xF3n de bienes", "marital_status", "married_separate", "Check Box5"),
    opt2("cliente.civil_divorciado", "cliente", "Estado civil: Divorciado", "marital_status", "divorced", "Check Box8"),
    t2("cliente.nacionalidad", "cliente", "Nacionalidad", ["nationality"], "ASK_IF_MISSING", "NACIONALIDAD", { transform: "upper" }),
    t2("cliente.rfc", "cliente", "RFC con homoclave", ["rfc"], "ASK_IF_MISSING", "RFC con homoclave si cuenta con ella", { transform: "upper" }),
    t2("cliente.ciudad_nacimiento", "cliente", "Ciudad de nacimiento", ["birth_city"], "AUTO_FILL", "cd de nac 001", { transform: "upper" }),
    t2("cliente.curp", "cliente", "CURP", ["curp"], "ASK_IF_MISSING", "CURP", { transform: "upper" }),
    t2("cliente.nss", "cliente", "N\xFAmero de seguro social", ["nss"], "AUTO_FILL", "seguro socila numero"),
    t2("cliente.tel_casa", "cliente", "Tel\xE9fono casa", ["home_phone"], "AUTO_FILL", "TEL\xC9FONO CASA incluyendo LADA", { transform: "phone10" }),
    t2("cliente.tel_celular", "cliente", "Tel\xE9fono celular", ["mobile_phone"], "ASK_IF_MISSING", "TEL\xC9FONO CELULAR", { transform: "phone10" }),
    t2("cliente.correo", "cliente", "Correo electr\xF3nico", ["email"], "ASK_IF_MISSING", "DIRECCI\xD3N DE CORREO ELECTR\xD3NICO EMAIL"),
    // Domicilio
    t2("domicilio.calle_numero", "domicilio", "Domicilio (calle y n\xFAmero)", ["street", "exterior_number", "interior_number"], "ASK_IF_MISSING", "DOMICILIO calle n\xFAmero exterior e interior", { transform: "upper" }),
    t2("domicilio.colonia", "domicilio", "Colonia", ["neighborhood"], "ASK_IF_MISSING", "COLONIA", { transform: "upper" }),
    t2("domicilio.poblacion", "domicilio", "Poblaci\xF3n", ["city"], "ASK_IF_MISSING", "POBLACI\xD3N", { transform: "upper" }),
    t2("domicilio.estado", "domicilio", "Estado", ["state"], "ASK_IF_MISSING", "ESTADO", { transform: "upper" }),
    t2("domicilio.cp", "domicilio", "C\xF3digo postal", ["postal_code"], "ASK_IF_MISSING", "C\xD3DIGO POSTAL"),
    opt2("domicilio.vivienda_familiar", "domicilio", "Inmueble: Casa familiar", "housing_status", "family", "Check Box10", true),
    opt2("domicilio.vivienda_propio", "domicilio", "Inmueble: Propio", "housing_status", "owned", "Check Box11"),
    opt2("domicilio.vivienda_pagandola", "domicilio", "Inmueble: Pag\xE1ndola", "housing_status", "mortgaged", "Check Box12"),
    opt2("domicilio.vivienda_rentado", "domicilio", "Inmueble: Rentado", "housing_status", "rented", "Check Box13"),
    opt2("domicilio.vivienda_otro", "domicilio", "Inmueble: Otro", "housing_status", "other", "Check Box14"),
    t2("domicilio.renta", "domicilio", "Renta mensual", ["monthly_rent"], "CONDITIONAL", "cantoidada de renta", { transform: "money", condition: RENTED2 }),
    // Empleo
    t2("empleo.empresa", "empleo", "Nombre de la empresa", ["company_name"], "ASK_IF_MISSING", "nombre de la empresa", { transform: "upper" }),
    t2("empleo.tel_oficina", "empleo", "Tel\xE9fono oficina", ["work_phone"], "ASK_IF_MISSING", "telefono oficina", { transform: "phone10" }),
    t2("empleo.domicilio", "empleo", "Domicilio de la empresa (calle y n\xFAmero)", ["work_street", "work_exterior_number", "work_interior_number"], "ASK_IF_MISSING", "domicilio de la empresa", { transform: "upper" }),
    t2("empleo.colonia", "empleo", "Colonia (empresa)", ["work_neighborhood"], "ASK_IF_MISSING", "colonia de la empresa", { transform: "upper" }),
    t2("empleo.poblacion", "empleo", "Poblaci\xF3n (empresa)", ["work_city"], "ASK_IF_MISSING", "poblacion de la empresa 001", { transform: "upper" }),
    t2("empleo.estado", "empleo", "Estado (empresa)", ["work_state"], "ASK_IF_MISSING", "estado de la empresa", { transform: "upper" }),
    t2("empleo.cp", "empleo", "C\xF3digo postal (empresa)", ["work_postal_code"], "ASK_IF_MISSING", "cp de la empresa"),
    t2("empleo.antiguedad_anios", "empleo", "Antig\xFCedad en el empleo (a\xF1os)", ["employment_years"], "ASK_IF_MISSING", "ant empresa", { transform: "int" }),
    t2("empleo.antiguedad_meses", "empleo", "Antig\xFCedad en el empleo (meses)", ["employment_months"], "AUTO_FILL", "ant  2empresa", { transform: "int" }),
    t2("empleo.actividad", "empleo", "Actividad de la empresa", ["company_activity"], "ASK_IF_MISSING", "actividad empresa 234", { transform: "upper" }),
    opt2("empleo.posicion_empleado", "empleo", "Posici\xF3n: Empleado", "employment_status", "employed", "Check Box29", true),
    opt2("empleo.posicion_profesionista", "empleo", "Posici\xF3n: Profesionista independiente", "employment_status", "self_employed", "Check Box30"),
    opt2("empleo.posicion_negocio", "empleo", "Posici\xF3n: Negocio propio", "employment_status", "business_owner", "Check Box32"),
    t2("empleo.puesto", "empleo", "Puesto", ["job_title"], "ASK_IF_MISSING", "puesto empresa 00", { transform: "upper" }),
    t2("empleo.ant_anterior_anios", "empleo", "Antig\xFCedad empleo anterior (a\xF1os)", ["previous_employment_years"], "CONDITIONAL", "ant empresa an", { transform: "int", condition: PREV_EMPLOYMENT2 }),
    t2("empleo.ant_anterior_meses", "empleo", "Antig\xFCedad empleo anterior (meses)", ["previous_employment_months"], "CONDITIONAL", "ant  2empresa ant", { transform: "int", condition: PREV_EMPLOYMENT2 }),
    t2("empleo.ingreso_bruto", "empleo", "Ingreso bruto mensual", ["monthly_fixed_income"], "ASK_IF_MISSING", "ingreso bruto 22", { transform: "money" }),
    t2("empleo.otros_ingresos", "empleo", "Otros ingresos mensuales brutos", ["monthly_variable_income"], "AUTO_FILL", "ingreso bruto del con", { transform: "money" }),
    // Coacreditado / obligado (a mano)
    manual("coacreditado.nombres", "coacreditado", "Coacreditado \xB7 nombre(s)", "NOMBRES DEL C\xD3NYUGE", COBORROWER),
    manual("coacreditado.apellido_paterno", "coacreditado", "Coacreditado \xB7 apellido paterno", "APELLIDO PATERNO_2", COBORROWER),
    manual("coacreditado.apellido_materno", "coacreditado", "Coacreditado \xB7 apellido materno", "APELLIDO MATERNO_2", COBORROWER),
    manual("coacreditado.nacionalidad", "coacreditado", "Coacreditado \xB7 nacionalidad", "nac del coacre", COBORROWER),
    manual("coacreditado.rfc", "coacreditado", "Coacreditado \xB7 RFC", "RFC con", COBORROWER),
    manual("coacreditado.curp", "coacreditado", "Coacreditado \xB7 CURP", "CURP dos", COBORROWER),
    manual("coacreditado.correo", "coacreditado", "Coacreditado \xB7 correo", "nacio", COBORROWER),
    manual("coacreditado.ingreso", "coacreditado", "Coacreditado \xB7 ingreso bruto mensual", "ingreso bruto del sin", COBORROWER),
    manual("coacreditado.empresa", "coacreditado", "Coacreditado \xB7 empresa", "nombre de la empresa 7", COBORROWER),
    manual("obligado.nombres", "obligado", "Obligado solidario \xB7 nombre(s)", "mane", OBLIGOR),
    manual("obligado.apellido_paterno", "obligado", "Obligado solidario \xB7 apellido paterno", "apellidos obligado", OBLIGOR),
    manual("obligado.apellido_materno", "obligado", "Obligado solidario \xB7 apellido materno", "obligados del credito importe", OBLIGOR),
    // Humano
    human2("medico.cuestionario", "medico", "Cuestionario m\xE9dico (5 preguntas S\xED/No)", "Check Box41"),
    human2("medico.peso_estatura", "medico", "Peso y estatura", "Text79", "text"),
    human2("autorizaciones.consentimiento_1", "autorizaciones", "Consentimiento (S\xED/No) 1", "Check Box61"),
    human2("autorizaciones.consentimiento_2", "autorizaciones", "Consentimiento (S\xED/No) 2", "Check Box63"),
    human2("autorizaciones.consentimiento_3", "autorizaciones", "Consentimiento (S\xED/No) 3", "Check Box65"),
    // Firmas
    sign2("firmas.solicitante", "Firma del solicitante", "Signature71_es_:signer:signature"),
    sign2("firmas.coacreditado", "Firma del coacreditado", "Signature72_es_:signer:signature", COBORROWER),
    sign2("firmas.obligado", "Firma del obligado solidario", "Signature7456_:signer:signature", OBLIGOR)
  ]
};

// src/domain/money.ts
var UNITS = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900
};
var NUMBER_WORDS = Object.keys(UNITS);
var WORD = NUMBER_WORDS.join("|");
var WORD_THOUSANDS = new RegExp(`\\b((?:(?:${WORD})(?:\\s+y\\s+|\\s+)?)+)\\s*mil\\b`, "g");

// src/domain/profile-fields.ts
var GENDER = { male: "Masculino", female: "Femenino" };
var MARITAL = { single: "Soltero(a)", married: "Casado(a) (r\xE9gimen sin especificar)", married_joint: "Casado(a) bienes mancomunados / sociedad conyugal", married_separate: "Casado(a) separaci\xF3n de bienes", divorced: "Divorciado(a)", separated: "Separado(a)", widowed: "Viudo(a)", free_union: "Uni\xF3n libre" };
var EDUCATION = { none: "Sin estudios", primary: "Primaria", secondary: "Secundaria", high_school: "Preparatoria", technical: "T\xE9cnica", bachelor: "Licenciatura / universidad", masters: "Maestr\xEDa", doctorate: "Doctorado", postgraduate: "Posgrado (sin especificar)" };
var HOUSING = { owned: "Propia", mortgaged: "Propia (hipotecada)", rented: "Rentada", family: "Familiar", other: "Otra" };
var COMPANY_TYPE = { private: "Privada", public: "P\xFAblica / gobierno", own_business: "Negocio propio", other: "Otra" };
var EMPLOYMENT_STATUS = { employed: "Asalariado", self_employed: "Independiente / honorarios", business_owner: "Empresario (PFAE)", retired: "Jubilado / pensionado", other: "Otra" };
var YES_NO = { yes: "S\xED", no: "No" };
var SPECS = [
  // Datos personales
  { key: "first_name", label: "Primer nombre", section: "personal" },
  { key: "middle_name", label: "Segundo nombre", section: "personal" },
  { key: "paternal_last_name", label: "Apellido paterno", section: "personal" },
  { key: "maternal_last_name", label: "Apellido materno", section: "personal" },
  { key: "birth_date", label: "Fecha de nacimiento", kind: "date", section: "personal", sensitive: true },
  { key: "birth_city", label: "Ciudad de nacimiento", section: "personal" },
  { key: "birth_state", label: "Estado de nacimiento", section: "personal" },
  { key: "birth_country", label: "Pa\xEDs de nacimiento", section: "personal" },
  { key: "nationality", label: "Nacionalidad", section: "personal" },
  { key: "gender", label: "Sexo", kind: "enum", section: "personal", enumValues: Object.keys(GENDER), enumLabels: GENDER },
  { key: "marital_status", label: "Estado civil", kind: "enum", section: "personal", enumValues: Object.keys(MARITAL), enumLabels: MARITAL },
  { key: "dependents", label: "Dependientes econ\xF3micos", kind: "number", section: "personal", min: 0, max: 20, inputMode: "numeric" },
  { key: "rfc", label: "RFC", section: "personal", pattern: /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, upper: true, sensitive: true },
  { key: "curp", label: "CURP", section: "personal", pattern: /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/, upper: true, sensitive: true },
  { key: "voter_key", label: "Clave de elector (INE)", section: "personal", pattern: /^[A-Z]{6}\d{8}[HM]\d{3}$/, upper: true, sensitive: true },
  { key: "nss", label: "NSS", section: "personal", pattern: /^\d{11}$/, sensitive: true, inputMode: "numeric" },
  { key: "profession", label: "Profesi\xF3n", section: "personal" },
  { key: "education_level", label: "Escolaridad", kind: "enum", section: "personal", enumValues: Object.keys(EDUCATION), enumLabels: EDUCATION },
  // Contacto
  { key: "mobile_phone", label: "Celular", kind: "phone", section: "contact", sensitive: true, inputMode: "tel" },
  { key: "home_phone", label: "Tel\xE9fono de casa", kind: "phone", section: "contact", sensitive: true, inputMode: "tel" },
  { key: "email", label: "Correo electr\xF3nico", kind: "email", section: "contact", sensitive: true, inputMode: "email" },
  // Domicilio
  { key: "street", label: "Calle", section: "address", sensitive: true },
  { key: "exterior_number", label: "N\xFAmero exterior", section: "address", sensitive: true },
  { key: "interior_number", label: "N\xFAmero interior", section: "address", sensitive: true },
  { key: "neighborhood", label: "Colonia", section: "address", sensitive: true },
  { key: "municipality", label: "Municipio / alcald\xEDa", section: "address" },
  { key: "city", label: "Ciudad / poblaci\xF3n", section: "address" },
  { key: "state", label: "Estado", section: "address" },
  { key: "postal_code", label: "C\xF3digo postal", section: "address", pattern: /^\d{5}$/, inputMode: "numeric" },
  { key: "housing_status", label: "Tipo de vivienda", kind: "enum", section: "address", enumValues: Object.keys(HOUSING), enumLabels: HOUSING },
  { key: "residence_years", label: "A\xF1os en el domicilio", kind: "number", section: "address", min: 0, max: 99, inputMode: "numeric" },
  { key: "monthly_rent", label: "Renta mensual", kind: "money", section: "address", min: 0, max: 1e6, sensitive: true, inputMode: "decimal" },
  { key: "residence_months", label: "Meses en el domicilio", kind: "number", section: "address", min: 0, max: 11, inputMode: "numeric" },
  // Empleo actual
  { key: "company_name", label: "Empresa", section: "employment" },
  { key: "company_activity", label: "Actividad / giro", section: "employment" },
  { key: "company_type", label: "Tipo de empresa", kind: "enum", section: "employment", enumValues: Object.keys(COMPANY_TYPE), enumLabels: COMPANY_TYPE },
  { key: "employment_status", label: "Situaci\xF3n laboral", kind: "enum", section: "employment", enumValues: Object.keys(EMPLOYMENT_STATUS), enumLabels: EMPLOYMENT_STATUS },
  { key: "occupation_type", label: "Ocupaci\xF3n", section: "employment" },
  { key: "job_title", label: "Puesto / cargo", section: "employment" },
  { key: "monthly_fixed_income", label: "Ingreso fijo mensual", kind: "money", section: "employment", min: 1, max: 1e7, sensitive: true, inputMode: "decimal" },
  { key: "monthly_variable_income", label: "Ingreso variable mensual", kind: "money", section: "employment", min: 0, max: 1e7, sensitive: true, inputMode: "decimal" },
  { key: "employment_years", label: "Antig\xFCedad (a\xF1os)", kind: "number", section: "employment", min: 0, max: 60, inputMode: "numeric" },
  { key: "employment_months", label: "Antig\xFCedad (meses)", kind: "number", section: "employment", min: 0, max: 11, inputMode: "numeric" },
  { key: "employment_start_date", label: "Fecha de ingreso", kind: "date", section: "employment" },
  { key: "work_phone", label: "Tel\xE9fono del trabajo", kind: "phone", section: "employment", inputMode: "tel" },
  { key: "work_extension", label: "Extensi\xF3n", section: "employment", pattern: /^\d{1,6}$/, inputMode: "numeric" },
  { key: "work_street", label: "Calle (trabajo)", section: "employment" },
  { key: "work_exterior_number", label: "N\xFAmero exterior (trabajo)", section: "employment" },
  { key: "work_interior_number", label: "N\xFAmero interior (trabajo)", section: "employment" },
  { key: "work_neighborhood", label: "Colonia (trabajo)", section: "employment" },
  { key: "work_municipality", label: "Municipio (trabajo)", section: "employment" },
  { key: "work_city", label: "Ciudad (trabajo)", section: "employment" },
  { key: "work_state", label: "Estado (trabajo)", section: "employment" },
  { key: "work_postal_code", label: "C\xF3digo postal (trabajo)", section: "employment", pattern: /^\d{5}$/, inputMode: "numeric" },
  // Empleo anterior
  { key: "previous_company", label: "Empresa anterior", section: "previous_employment" },
  { key: "previous_phone", label: "Tel\xE9fono empleo anterior", kind: "phone", section: "previous_employment", inputMode: "tel" },
  { key: "previous_employment_years", label: "Antig\xFCedad anterior (a\xF1os)", kind: "number", section: "previous_employment", min: 0, max: 60, inputMode: "numeric" },
  { key: "previous_employment_months", label: "Antig\xFCedad anterior (meses)", kind: "number", section: "previous_employment", min: 0, max: 11, inputMode: "numeric" },
  // Referencias
  { key: "reference_1_name", label: "Referencia familiar \xB7 nombre", section: "references", sensitive: true },
  { key: "reference_1_phone", label: "Referencia familiar \xB7 tel\xE9fono", kind: "phone", section: "references", sensitive: true, inputMode: "tel" },
  { key: "reference_1_relationship", label: "Referencia familiar \xB7 parentesco", section: "references" },
  { key: "reference_1_address", label: "Referencia familiar \xB7 direcci\xF3n", section: "references", sensitive: true },
  { key: "reference_2_name", label: "Referencia personal (conocido) \xB7 nombre", section: "references", sensitive: true },
  { key: "reference_2_phone", label: "Referencia personal \xB7 tel\xE9fono", kind: "phone", section: "references", sensitive: true, inputMode: "tel" },
  { key: "reference_2_relationship", label: "Referencia personal \xB7 relaci\xF3n", section: "references" },
  { key: "reference_2_address", label: "Referencia personal \xB7 direcci\xF3n", section: "references", sensitive: true },
  { key: "landlord_name", label: "Arrendador \xB7 nombre (si renta)", section: "references", sensitive: true },
  { key: "landlord_phone", label: "Arrendador \xB7 tel\xE9fono", kind: "phone", section: "references", sensitive: true, inputMode: "tel" },
  { key: "landlord_address", label: "Arrendador \xB7 direcci\xF3n", section: "references", sensitive: true },
  // Condicionales
  { key: "has_coborrower", label: "\xBFTendr\xE1 coacreditado?", kind: "enum", section: "conditional", enumValues: Object.keys(YES_NO), enumLabels: YES_NO },
  { key: "has_joint_obligor", label: "\xBFTendr\xE1 obligado solidario?", kind: "enum", section: "conditional", enumValues: Object.keys(YES_NO), enumLabels: YES_NO }
];
var PROFILE_FIELD_KEYS = SPECS.map((s) => s.key);
var PROFILE_FIELD_DEFS = Object.fromEntries(
  SPECS.map((spec) => [
    spec.key,
    {
      key: spec.key,
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
      inputMode: spec.inputMode
    }
  ])
);

// src/domain/facts.ts
var CONVERSATION_FACT_KEYS = [
  "name",
  "phone",
  "vehicle_interest",
  "version",
  "usage_type",
  "driving_profile",
  "annual_mileage",
  "passengers",
  "fuel_economy_importance",
  "powertrain_preference",
  "desired_features",
  "budget",
  "down_payment",
  "target_monthly_payment",
  "payment_method",
  "term_months",
  "purchase_timing",
  "current_vehicle",
  "competitors",
  "objections",
  "interest_signals"
];
var FACT_KEYS = [...CONVERSATION_FACT_KEYS, ...PROFILE_FIELD_KEYS];
var USAGE = ["personal", "family", "work", "rideshare"];
var DRIVING = ["city", "highway", "travel"];
var LEVELS = ["low", "medium", "high"];
var POWERTRAIN = ["hybrid", "gas", "open"];
var PAYMENT = ["cash", "financing", "undecided"];
var TIMING = ["immediate", "this_month", "1_3_months", "3_6_months", "exploring"];
var CONVERSATION_FACT_DEFS = {
  name: {
    key: "name",
    label: "Nombre",
    kind: "text",
    askPriority: 0,
    question: "\xBFCon qui\xE9n tengo el gusto?",
    askPatterns: [/con quien tengo el gusto/, /(como te llamas|cual es tu nombre|me compartes tu nombre|me regalas tu nombre)/]
  },
  phone: {
    key: "phone",
    label: "Tel\xE9fono",
    kind: "text",
    askPriority: null,
    askPatterns: [/(tu|un) (numero|telefono|celular|whats)/]
  },
  vehicle_interest: {
    key: "vehicle_interest",
    label: "Modelo de inter\xE9s",
    kind: "text",
    askPriority: 1,
    question: "\xBFQu\xE9 modelo tienes en mente o te gustar\xEDa que te recomiende alguno?",
    askPatterns: [/que (modelo|auto|carro|coche|vehiculo|camioneta)/, /cual (modelo|auto|carro|coche|vehiculo) te (interesa|gusta|llama)/]
  },
  version: {
    key: "version",
    label: "Versi\xF3n",
    kind: "text",
    askPriority: 7,
    question: "\xBFYa tienes alguna versi\xF3n en mente o te platico las diferencias?",
    askPatterns: [/que version/, /cual version/, /version (te interesa|buscas|prefieres)/],
    dependsOn: "vehicle_interest"
  },
  usage_type: {
    key: "usage_type",
    label: "Uso principal",
    kind: "list",
    enumValues: USAGE,
    enumLabels: { personal: "Personal", family: "Familiar", work: "Trabajo", rideshare: "Plataforma (Uber/DiDi)" },
    askPriority: 2,
    question: "\xBFPara qu\xE9 lo usar\xEDas principalmente: uso personal, familiar o de trabajo?",
    askPatterns: [/para que (lo |la )?(usarias|vas a usar|lo quieres|la quieres|lo necesitas)/, /uso (le )?(darias|vas a dar|principal)/]
  },
  driving_profile: {
    key: "driving_profile",
    label: "Tipo de manejo",
    kind: "list",
    enumValues: DRIVING,
    enumLabels: { city: "Ciudad", highway: "Carretera", travel: "Viajes" },
    askPriority: 4,
    question: "\xBFManejas m\xE1s en ciudad o tambi\xE9n sales a carretera?",
    askPatterns: [/(manejas|lo usarias|circulas) (mas )?(en )?(ciudad|carretera)/, /ciudad o (en )?carretera/]
  },
  annual_mileage: {
    key: "annual_mileage",
    label: "Kilometraje anual estimado",
    kind: "number",
    askPriority: null,
    askPatterns: [/cuantos (km|kilometros)/],
    min: 500,
    max: 25e4
  },
  passengers: {
    key: "passengers",
    label: "Pasajeros habituales",
    kind: "number",
    askPriority: 3,
    question: "\xBFCu\xE1ntas personas suelen viajar contigo?",
    askPatterns: [/cuantas personas/, /cuantos (pasajeros|son en)/, /cuantos van/],
    min: 1,
    max: 15
  },
  fuel_economy_importance: {
    key: "fuel_economy_importance",
    label: "Importancia del rendimiento",
    kind: "enum",
    enumValues: LEVELS,
    enumLabels: { low: "Baja", medium: "Media", high: "Alta" },
    askPriority: null,
    askPatterns: [/(que tan importante|te importa).*(rendimiento|gasolina|consumo)/]
  },
  powertrain_preference: {
    key: "powertrain_preference",
    label: "Preferencia h\xEDbrido/gasolina",
    kind: "enum",
    enumValues: POWERTRAIN,
    enumLabels: { hybrid: "H\xEDbrido", gas: "Gasolina", open: "Abierto" },
    askPriority: 9,
    question: "\xBFTe interesa m\xE1s la versi\xF3n h\xEDbrida o la de gasolina?",
    askPatterns: [/hibrid[oa] o (de )?gasolina/, /gasolina o hibrid/, /te interesa (mas )?(la )?(version )?hibrid/]
  },
  desired_features: {
    key: "desired_features",
    label: "Caracter\xEDsticas deseadas",
    kind: "list",
    askPriority: null,
    askPatterns: [/que (caracteristicas|equipamiento)/, /que te gustaria que (tuviera|trajera)/]
  },
  budget: {
    key: "budget",
    label: "Presupuesto",
    kind: "money",
    askPriority: 10,
    question: "\xBFQu\xE9 presupuesto tienes pensado?",
    askPatterns: [/presupuesto/],
    min: 1e3,
    max: 1e7
  },
  down_payment: {
    key: "down_payment",
    label: "Enganche",
    kind: "money",
    askPriority: 8,
    question: "\xBFCon cu\xE1nto de enganche te gustar\xEDa arrancar?",
    askPatterns: [/enganche/],
    min: 1e3,
    max: 1e7
  },
  target_monthly_payment: {
    key: "target_monthly_payment",
    label: "Mensualidad objetivo",
    kind: "money",
    askPriority: 11,
    question: "\xBFQu\xE9 mensualidad te quedar\xEDa c\xF3moda?",
    askPatterns: [/mensualidad (te |que te )?(quedaria|gustaria|comoda|ideal|buscas|puedes)/, /cuanto (quieres|puedes|te gustaria) pagar (al mes|mensual)/],
    min: 500,
    max: 5e5
  },
  payment_method: {
    key: "payment_method",
    label: "Forma de pago",
    kind: "enum",
    enumValues: PAYMENT,
    enumLabels: { cash: "Contado", financing: "Financiamiento", undecided: "Por definir" },
    askPriority: 5,
    question: "\xBFLo est\xE1s pensando de contado o con financiamiento?",
    askPatterns: [/de contado o (a credito|con financiamiento|financiado)/, /(credito|financiamiento) o (de )?contado/, /como (lo )?(piensas|pensabas|planeas) pagar/]
  },
  term_months: {
    key: "term_months",
    label: "Plazo deseado (meses)",
    kind: "number",
    askPriority: 12,
    question: "\xBFA qu\xE9 plazo te gustar\xEDa, m\xE1s o menos?",
    askPatterns: [/a (que|cuantos) (plazo|meses|anos)/, /que plazo/],
    min: 6,
    max: 96
  },
  purchase_timing: {
    key: "purchase_timing",
    label: "Tiempo de compra",
    kind: "enum",
    enumValues: TIMING,
    enumLabels: {
      immediate: "Inmediato",
      this_month: "Este mes",
      "1_3_months": "1 a 3 meses",
      "3_6_months": "3 a 6 meses",
      exploring: "Explorando"
    },
    askPriority: 6,
    question: "\xBFPara cu\xE1ndo te gustar\xEDa estrenar?",
    askPatterns: [/para cuando/, /cuando (piensas|planeas|te gustaria|quieres) (comprar|estrenar|adquirir)/]
  },
  current_vehicle: {
    key: "current_vehicle",
    label: "Auto actual",
    kind: "text",
    askPriority: 13,
    question: "\xBFActualmente qu\xE9 auto manejas?",
    askPatterns: [/que (auto|carro|coche) (tienes|manejas|traes)/, /actualmente (que )?(manejas|tienes)/]
  },
  competitors: {
    key: "competitors",
    label: "Competidores considerados",
    kind: "list",
    askPriority: null,
    askPatterns: [/que otr[oa]s? (modelos|marcas|opciones)/]
  },
  objections: {
    key: "objections",
    label: "Objeciones",
    kind: "list",
    askPriority: null,
    askPatterns: []
  },
  interest_signals: {
    key: "interest_signals",
    label: "Se\xF1ales de inter\xE9s",
    kind: "list",
    askPriority: null,
    askPatterns: []
  }
};
var FACT_DEFS = { ...CONVERSATION_FACT_DEFS, ...PROFILE_FIELD_DEFS };
function isFactKey(key) {
  return FACT_KEYS.includes(key);
}

// src/domain/credit/analyze.ts
var foldUpper = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
function checkboxMatches(checkedWhen, value) {
  if (!checkedWhen) return false;
  return checkedWhen.split("|").some((c) => foldUpper(c) === foldUpper(value));
}
function transformValue(slot, values) {
  const keys = slot.profileKeys ?? [];
  const parts = values.map((v, i) => {
    const key = keys[i];
    if (v === null || v === void 0 || v === "") return "";
    switch (slot.transform) {
      case "date_dd":
        return String(v).split("-")[2] ?? "";
      case "date_mm":
        return String(v).split("-")[1] ?? "";
      case "date_yyyy":
        return String(v).split("-")[0] ?? "";
      case "date_ddmmyyyy": {
        const [y, m, d] = String(v).split("-");
        return y && m && d ? `${d}/${m}/${y}` : String(v);
      }
      case "money":
        return typeof v === "number" ? v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
      case "phone10":
        return String(v).replace(/\D/g, "").slice(-10);
      case "int":
        return String(Math.round(Number(v)));
      case "enum_label": {
        const def = isFactKey(key) ? FACT_DEFS[key] : void 0;
        return (def?.enumLabels?.[String(v)] ?? String(v)).toUpperCase();
      }
      case "upper":
        return String(v).toUpperCase();
      default:
        return String(v);
    }
  });
  return parts.filter(Boolean).join(" ").trim();
}
export {
  BANORTE_ADAPTER,
  BBVA_ADAPTER,
  checkboxMatches,
  transformValue
};
