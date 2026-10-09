/**
 * Reverso de la INE (MRZ) y reparaciones del lector gratuito (sin IA).
 * Todo es SINTÉTICO: personas inexistentes, CURP/clave/MRZ fabricadas con estructura y dígitos
 * verificadores válidos. Ningún dato real.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { parseIne } from "@/server/extraction/ine";
import { curpCheckDigit, isValidCurp, mrzCheck, mrzRowTexts, normalizeMrzLine, parseMrz } from "@/server/extraction/mx-id";
import { ineFront, obs, obsFromRows, SYNTH } from "./fixtures/ine";

/** MRZ TD1 de la INE con todos sus dígitos verificadores (sexo como lo imprime la INE: H / M). */
function mrz({ birth = "850505", sex = "M", expiry = "331231", names = "SINTETICO<EJEMPLO<<PRUEBA<ANA" } = {}): [string, string, string] {
  const l1 = `IDMEX123456789${mrzCheck("123456789")}<<0123456789012`;
  const core = `${birth}${mrzCheck(birth)}${sex}${expiry}${mrzCheck(expiry)}MEX<01<<12345<`;
  const composite = l1.slice(5, 30) + core.slice(0, 7) + core.slice(8, 15) + core.slice(18, 29);
  return [l1, core + mrzCheck(composite), names.padEnd(30, "<")];
}

/** Reverso como lo entrega el OCR: un renglón por línea MRZ. */
const back = (lines: string[]) => obsFromRows(lines.map((text, i) => ({ text, x: 40, y: 480 + 40 * i })));
const get = (r: ReturnType<typeof parseIne>, key: string) => r.fields.find((f) => f.key === key);
const val = (r: ReturnType<typeof parseIne>, key: string) => get(r, key)?.value;

describe("MRZ de la INE (reverso)", () => {
  it("sexo: la INE usa H (hombre) / M (mujer), no el M/F de ICAO; F se acepta como mujer", () => {
    expect(parseMrz(mrz({ sex: "H" }))!.sex).toBe("male");
    expect(parseMrz(mrz({ sex: "M" }))!.sex).toBe("female");
    expect(parseMrz(mrz({ sex: "F" }))!.sex).toBe("female");
    expect(parseMrz(mrz({ sex: "<" }))!.sex).toBeNull();
  });

  it("estructura completa: nacimiento, vencimiento (vigencia), nombre y verificador compuesto", () => {
    const m = parseMrz(mrz())!;
    expect(m).toMatchObject({ birthYYMMDD: "850505", expiryYYMMDD: "331231", surnames: ["SINTETICO", "EJEMPLO"], givenNames: ["PRUEBA", "ANA"], repaired: false, nameRepaired: false, nameTruncated: false, compositeOk: true });
    // 30 letras sin relleno: el último nombre pudo quedar recortado (no se usa para corregir el frente).
    expect(parseMrz(mrz({ names: "SINTETICO<EJEMPLO<<PRUEBA<ANAM" }))!.nameTruncated).toBe(true);
  });

  it("letras muy espaciadas y '<' mal leídos («, ‹, minúsculas) se normalizan", () => {
    expect(normalizeMrzLine("I D M E X 1 2 3 4 5 6 7 8 9 7 « 0 1 2 3")).toBe("IDMEX1234567897<<0123");
    const [l1, l2, l3] = mrz();
    const spaced = [l1, l2, l3].map((l) => l.split("").join(" ").replace(/< </g, "«").toLowerCase());
    expect(parseMrz(spaced)).toMatchObject({ birthYYMMDD: "850505", sex: "female", surnames: ["SINTETICO", "EJEMPLO"] });
  });

  it("O/0, I/1… en fechas se corrigen SOLO si los dígitos verificadores cuadran (y se marca)", () => {
    const [l1, l2, l3] = mrz();
    const misread = l2.slice(0, 6).replace(/0/g, "O") + l2.slice(6);
    const m = parseMrz([l1, misread, l3])!;
    expect(m.birthYYMMDD).toBe("850505");
    expect(m.repaired).toBe(true);
    // Un dígito equivocado (no una letra) nunca se "arregla": el verificador lo rechaza.
    const wrong = "850506" + l2.slice(6);
    expect(parseMrz([l1, wrong, l3])).toBeNull();
  });

  it("nombre con dígitos (0 por O): se corrige pero se marca (ese renglón no tiene verificador)", () => {
    const m = parseMrz(mrz({ names: "SINTETIC0<EJEMPL0<<PRUEBA<ANA" }))!;
    expect(m.surnames).toEqual(["SINTETICO", "EJEMPLO"]);
    expect(m.nameRepaired).toBe(true);
    // "<<" leído como "KK" (ningún nombre en español lleva "KK")
    expect(parseMrz(mrz({ names: "SINTETICO<EJEMPLOKKPRUEBA<ANA" }))).toMatchObject({ surnames: ["SINTETICO", "EJEMPLO"], givenNames: ["PRUEBA", "ANA"], nameRepaired: true });
  });

  it("un caracter de más al inicio (borde de la credencial) y renglón 1 ilegible", () => {
    const [l1, l2, l3] = mrz();
    expect(parseMrz([l1, "I" + l2, l3])).toMatchObject({ birthYYMMDD: "850505", repaired: true });
    // Sin renglón 1, el 2 se acepta solo con nacionalidad MEX y verificadores correctos.
    expect(parseMrz([l2, l3])).toMatchObject({ birthYYMMDD: "850505", compositeOk: false });
    expect(parseMrz([l2.replace("MEX", "XXX"), l3])).toBeNull();
  });

  it("renglones partidos en pedazos (ML Kit con letras espaciadas) se unen por altura", () => {
    const [l1, l2, l3] = mrz();
    const pieces = [l1, l2, l3].flatMap((t, i) => [
      { text: t.slice(0, 14), box: { left: 40, top: 480 + 40 * i, right: 400, bottom: 500 + 40 * i } },
      { text: t.slice(14), box: { left: 420, top: 482 + 40 * i, right: 800, bottom: 501 + 40 * i } },
    ]);
    expect(mrzRowTexts(pieces)).toEqual([l1, l2, l3]);
    const r = parseIne(obs({ width: 1000, height: 630, blocks: pieces.map((l) => ({ text: l.text, box: l.box, lines: [l] })) }));
    expect(r.mrz?.birthYYMMDD).toBe("850505");
  });
});

describe("parseIne con la MRZ corregida", () => {
  it("regresión: frente 'SEXO M' (mujer) + reverso M ya no se contradicen", () => {
    const r = parseIne(obs(ineFront(), back(mrz({ sex: "M" }))));
    expect(r.warnings).toEqual([]);
    expect(val(r, "gender")).toBe("female");
    expect(get(r, "gender")!.confidence).toBe("medium");
    expect(r.mrz?.expiryYYMMDD).toBe("331231");
  });

  it("reverso con sexo distinto al frente → aviso y confianza baja", () => {
    const r = parseIne(obs(ineFront(), back(mrz({ sex: "H" }))));
    expect(r.warnings.join(" ")).toMatch(/sexo no coincide/);
    expect(get(r, "gender")!.confidence).toBe("low");
  });

  it("MRZ corregida (O/0) se usa pero se avisa", () => {
    const [l1, l2, l3] = mrz();
    const r = parseIne(obs(ineFront(), back([l1, l2.replace(/^85/, "8S"), l3])));
    expect(r.mrz?.repaired).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/MRZ\) traía letras y números confundidos/);
  });

  it("nombre del reverso corregido: no sube la confianza del nombre", () => {
    const front = ineFront({ curp: "SIEP850505MDFNJR0X" }); // CURP ilegible: el nombre solo lo respalda la MRZ
    const clean = parseIne(obs(front, back(mrz())));
    expect(get(clean, "paternal_last_name")!.confidence).toBe("medium");
    const fixed = parseIne(obs(front, back(mrz({ names: "SINTETIC0<EJEMPL0<<PRUEBA<ANA" }))));
    expect(get(fixed, "paternal_last_name")!.confidence).toBe("low");
  });

  it("calle con la 'C' pegada (CFALSA) y abreviaturas que sí empiezan con C", () => {
    expect(val(parseIne(obs(ineFront({ street: "CFALSA 123" }))), "street")).toBe("FALSA");
    expect(val(parseIne(obs(ineFront({ street: "CDA ROBLES 5" }))), "street")).toBe("CDA ROBLES");
    expect(val(parseIne(obs(ineFront({ street: "CHOPOS 12" }))), "street")).toBe("CHOPOS");
  });

  it("caracter suelto de la orilla antes de la 'C' (foto en ángulo, sombra): no entra en la calle", () => {
    expect(val(parseIne(obs(ineFront({ street: "1 C FALSA 123" }))), "street")).toBe("FALSA");
    expect(val(parseIne(obs(ineFront({ street: "| C FALSA 123" }))), "street")).toBe("FALSA");
    expect(val(parseIne(obs(ineFront({ street: "C 16 DE SEPTIEMBRE 45" }))), "street")).toBe("16 DE SEPTIEMBRE");
  });

  it("nombre del reverso que llena el renglón: se avisa que pudo quedar cortado; el frente completo coincide", () => {
    const full = mrz({ names: "SINTETICO<EJEMPLO<<PRUEBA<ANAM" });
    expect(parseIne(obs(back(full))).warnings.join(" ")).toMatch(/pudo quedar cortado/);
    const r = parseIne(obs(ineFront({ given: "PRUEBA ANAMARIA" }), back(full)));
    expect(r.warnings).toEqual([]);
    expect(get(r, "first_name")!.confidence).toBe("medium");
  });

  it("sin etiqueta NOMBRE legible: el nombre se toma por posición SOLO si la CURP (o la MRZ) lo confirma", () => {
    const r = parseIne(obs(ineFront({ drop: ["NOMBRE"] })));
    expect(val(r, "paternal_last_name")).toBe("SINTETICO");
    expect(val(r, "first_name")).toBe("PRUEBA");
    // Sin CURP válida ni reverso, no hay con qué confirmar: no se adivina.
    const noCurp = parseIne(obs(ineFront({ drop: ["NOMBRE"], curp: "SIEP850505MDFNJR0X" })));
    expect(val(noCurp, "paternal_last_name")).toBeUndefined();
    const withBack = parseIne(obs(ineFront({ drop: ["NOMBRE"], curp: "SIEP850505MDFNJR0X" }), back(mrz())));
    expect(val(withBack, "paternal_last_name")).toBe("SINTETICO");
  });

  it("sin etiqueta DOMICILIO legible: el domicilio se toma si el CP corresponde al estado", () => {
    const r = parseIne(obs(ineFront({ drop: ["DOMICILIO"] })));
    expect(val(r, "postal_code")).toBe("06000");
    expect(val(r, "street")).toBe("FALSA");
    expect(val(r, "state")).toBe("Ciudad de México");
    const mismatch = parseIne(obs(ineFront({ drop: ["DOMICILIO"], munState: "ZAPOPAN, JAL." })));
    expect(val(mismatch, "postal_code")).toBeUndefined();
  });

  it("dos lecturas con distinto CP (mismo estado): se avisa y baja la confianza", () => {
    const r = parseIne(obs(ineFront(), ineFront({ colonia: "COL CENTRO 06080" })));
    expect(val(r, "postal_code")).toBe("06000");
    expect(get(r, "postal_code")!.confidence).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/código postal se leyó distinto/);
  });

  it("dos lecturas con distinto nombre (letra que la CURP no revisa): se avisa y baja la confianza", () => {
    const r = parseIne(obs(ineFront({ maternal: "EJEMRLO" }), ineFront()));
    expect(val(r, "maternal_last_name")).toBe("EJEMRLO");
    expect(get(r, "maternal_last_name")!.confidence).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/nombre se leyó distinto/);
  });

  it("foto que no dejó leer ni CURP ni nombre: el domicilio no pasa de confianza baja (CP ↔ estado es débil)", () => {
    const r = parseIne(obs(ineFront({ curp: "SIEP850505MDFNJR0X", paternal: "S1NTETICO" })));
    expect(val(r, "postal_code")).toBe("06000");
    expect(get(r, "postal_code")!.confidence).toBe("low");
    expect(get(r, "street")!.confidence).toBe("low");
  });

  it("fecha impresa con espacios del OCR ('0 5/05/ 1985')", () => {
    expect(val(parseIne(obs(ineFront({ birth: "0 5/05/ 1985" }))), "birth_date")).toBe("1985-05-05");
  });

  it("dos lecturas de la misma cara: se usa la primera con nombre y domicilio limpios", () => {
    const bad = ineFront({ paternal: "S1NTETICO", colonia: "COL CENTRO" });
    const r = parseIne(obs(bad, ineFront()));
    expect(val(r, "paternal_last_name")).toBe("SINTETICO");
    expect(val(r, "postal_code")).toBe("06000");
    expect(r.warnings).toEqual([]);
  });
});

// ───────── Lector de la app de prueba (prueba/js/ine.js): reparaciones con aviso ─────────

type ReadIne = (o: unknown) => { detected: boolean; values: Record<string, string>; confidence: Record<string, string>; warnings: string[] };
let readIne: ReadIne;
beforeAll(async () => {
  // @ts-expect-error módulo JS de la app de prueba
  ({ readIne } = await import("../prueba/js/ine.js"));
});

/** Segunda persona sintética (inexistente) cuyas iniciales incluyen L, para probar I/L. */
const P17 = "PAOL900101HDFLRS0";
const OTHER = { paternal: "PALMA", maternal: "ORTEGA", given: "LUIS", curp: P17 + curpCheckDigit(P17), voterKey: "PLORLS90010109H100", birth: "01/01/1990", sex: "H" };

describe("readIne (app de prueba)", () => {
  it("vigencia en columnas: toma '2023 - 2033', no el año de nacimiento del renglón de abajo", () => {
    const page = ineFront({ drop: ["FECHA DE NACIMIENTO", SYNTH.birth, "SECCION 0001", "VIGENCIA 2023 - 2033"], extra: [
      { text: "FECHA DE NACIMIENTO SECCIÓN VIGENCIA", x: 310, y: 440 },
      { text: SYNTH.birth, x: 310, y: 468 },
      { text: "0001 2023 - 2033", x: 520, y: 468 },
    ] });
    expect(readIne(obs(page)).values.ine_validity).toBe("2033");
  });

  it("solo reverso: nombre, sexo (H/M), fecha (siglo por mayoría de edad) y vigencia desde la MRZ", () => {
    const r = readIne(obs(back(mrz({ sex: "M" }))));
    expect(r.values).toMatchObject({ paternal_last_name: "SINTETICO", maternal_last_name: "EJEMPLO", first_name: "PRUEBA", middle_name: "ANA", gender: "female", birth_date: "1985-05-05", ine_validity: "2033" });
    expect(r.confidence.birth_date).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/solo el reverso/);
  });

  it("nombre del frente con una letra mal leída (I por L): lo corrige la MRZ, con aviso", () => {
    const r = readIne(obs(ineFront({ maternal: "EJEMPIO" }), back(mrz())));
    expect(r.values.maternal_last_name).toBe("EJEMPLO");
    expect(r.confidence.maternal_last_name).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/Se corrigió con el reverso \(MRZ\): apellido materno/);
    // Otro nombre (diferencia grande) no se "corrige": solo se avisa.
    const other = readIne(obs(ineFront({ maternal: "GOMEZ" }), back(mrz())));
    expect(other.values.maternal_last_name).toBe("GOMEZ");
    expect(other.warnings.join(" ")).toMatch(/no coincide con el del reverso/);
  });

  it("la MRZ no tiene verificador en el nombre: si le falta una letra o la CURP la contradice, el frente no se toca", () => {
    const lost = readIne(obs(ineFront(), back(mrz({ names: "SINTETICO<EJEMPLO<<RUEBA<ANA" }))));
    expect(lost.values.first_name).toBe("PRUEBA");
    expect(lost.warnings.join(" ")).not.toMatch(/Se corrigió con el reverso/);
    expect(lost.warnings.join(" ")).toMatch(/no coincide con el del reverso/);
    // Misma longitud, pero la inicial no es la de la CURP (dígito verificador): no se corrige.
    const curpSays = readIne(obs(ineFront(), back(mrz({ names: "SINTETICO<EJEMPLO<<BRUEBA<ANA" }))));
    expect(curpSays.values.first_name).toBe("PRUEBA");
  });

  it("un apellido mal leído (E→F) no 'corrige' una clave de elector que estaba bien", () => {
    const r = readIne(obs(ineFront({ maternal: "FJEMPLO" })));
    expect(r.values.voter_key).toBe(SYNTH.voterKey);
    expect(r.warnings.join(" ")).not.toMatch(/letra confundida/);
  });

  it("vigencia impresa: un rango que no es de 10 años va con aviso; el año de emisión nunca pasa por vigencia", () => {
    const vig = (text: string) => readIne(obs(ineFront({ drop: ["VIGENCIA 2023 - 2033"], extra: [{ text, x: 600, y: 510 }] })));
    const misread = vig("VIGENCIA 2023 - 2031");
    expect(misread.values.ine_validity).toBe("2031");
    expect(misread.confidence.ine_validity).toBe("low");
    expect(misread.warnings.join(" ")).toMatch(/10 años después de la emisión/);
    // Segundo año ilegible ("2O33"): no se toma el 2023 de la emisión.
    expect(vig("VIGENCIA 2023 - 2O33").values.ine_validity).toBeUndefined();
    // Fecha de nacimiento y rango en el mismo renglón.
    expect(vig(`${SYNTH.birth} 2023 - 2033`).values.ine_validity).toBe("2033");
    expect(vig("EMISIÓN 2014 VIGENCIA 2024").values.ine_validity).toBe("2024");
  });

  it("vigencia impresa distinta a la MRZ → se usa la MRZ y se avisa", () => {
    const r = readIne(obs(ineFront({ drop: ["VIGENCIA 2023 - 2033"], extra: [{ text: "VIGENCIA 2023 - 2032", x: 600, y: 510 }] }), back(mrz())));
    expect(r.values.ine_validity).toBe("2033");
    expect(r.confidence.ine_validity).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/vigencia impresa no coincide/);
  });

  it("clave de elector con O/0 confundidos: se corrige por formato y fecha, con aviso", () => {
    const r = readIne(obs(ineFront({ voterKey: SYNTH.voterKey.replace(/0/g, "O") })));
    expect(r.values.voter_key).toBe(SYNTH.voterKey);
    expect(r.confidence.voter_key).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/clave de elector traía letras y números confundidos/);
  });

  it("clave de elector con letra confundida (I por L) pero formato válido: se corrige con el nombre", () => {
    const front = ineFront({ ...OTHER, voterKey: OTHER.voterKey.replace("PLOR", "PIOR"), street: "C FALSA 123", munState: "CUAUHTEMOC, CDMX." });
    expect(isValidCurp(OTHER.curp)).toBe(true);
    const r = readIne(obs(front));
    expect(r.values.voter_key).toBe(OTHER.voterKey);
    expect(r.warnings.join(" ")).toMatch(/iniciales del nombre/);
  });

  it("clave con un caracter de más: se corrige solo si el nombre respalda las letras (nunca una desplazada)", () => {
    // "SNEJPR" + "O" + resto: quitando la primera letra queda "NEJPRO85050509M100", con formato válido pero falsa.
    const extra = SYNTH.voterKey.slice(0, 6) + "O" + SYNTH.voterKey.slice(6);
    expect(readIne(obs(ineFront({ voterKey: extra }))).values.voter_key).toBe(SYNTH.voterKey);
    // Sin nombre legible no hay con qué confirmar las letras: se deja vacía.
    const r = readIne(obs(ineFront({ voterKey: extra, paternal: "S1NTETICO" })));
    expect(r.values.voter_key).toBeUndefined();
  });

  it("CURP con un caracter de más (0 leído como 'O0'): se corrige con verificador, fecha, sexo y nombre", () => {
    const extra = SYNTH.curp.slice(0, 6) + "O" + SYNTH.curp.slice(6);
    const r = readIne(obs(ineFront({ curp: extra })));
    expect(r.values.curp).toBe(SYNTH.curp);
    expect(r.confidence.curp).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/CURP traía letras y números confundidos/);
  });

  it("sin fecha legible no se corrige nada (no se inventan datos)", () => {
    const r = readIne(obs(ineFront({ curp: SYNTH.curp.replace("850505", "8SO5O5"), birth: "##/##/####", voterKey: "SNEJPR8SO5O509M1OO" })));
    expect(r.values.curp).toBeUndefined();
    expect(r.values.voter_key).toBeUndefined();
  });
});
