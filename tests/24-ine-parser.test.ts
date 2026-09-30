/**
 * IneParser v1 — regresiones obligatorias (independientes de ML Kit).
 * Credenciales 100% sintéticas (tests/fixtures/ine.ts). Ningún dato real.
 */
import { eq } from "drizzle-orm";
import { PDFDocument, type PDFTextField } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { createApplication, generateApplicationPdf, getGeneratedPdf } from "@/server/services/credit";
import { getInboxDocument, reviewFact, uploadDocument } from "@/server/services/inbox";
import { makeApp, newProspect, type TestApp } from "./helpers";
import { isFactKey } from "@/domain/facts";
import { onDeviceOcrProvider, runExtraction } from "@/server/extraction";
import { isNameLine, parseIne } from "@/server/extraction/ine";
import { curpCheckDigit, curpMatchesName, isValidCurp, parseMrz, stateForPostalCode, stateFromAbbr } from "@/server/extraction/mx-id";
import { parseObservation } from "@/server/extraction/observation";
import { ineBack, ineFront, obs, obsFromRows, SYNTH } from "./fixtures/ine";

const get = (r: ReturnType<typeof parseIne>, key: string) => r.fields.find((f) => f.key === key);
const val = (r: ReturnType<typeof parseIne>, key: string) => get(r, key)?.value;

describe("validaciones de identificación", () => {
  it("CURP: estructura + dígito verificador; no corrige caracteres", () => {
    expect(isValidCurp(SYNTH.curp)).toBe(true);
    const wrongDigit = SYNTH.curp.slice(0, 17) + ((Number(SYNTH.curp[17]) + 1) % 10);
    expect(isValidCurp(wrongDigit)).toBe(false);
    expect(isValidCurp(SYNTH.curp.replace("850505", "85O505"))).toBe(false); // O por 0: se rechaza, no se "arregla"
    expect(isValidCurp(SYNTH.curp.replace("DF", "XX"))).toBe(false); // estado inexistente
    expect(curpCheckDigit("SIEP850505MDFNJR0")).toBeGreaterThanOrEqual(0);
  });

  it("CURP ↔ nombre: iniciales y consonantes internas", () => {
    expect(curpMatchesName(SYNTH.curp, { paternal: "SINTETICO", maternal: "EJEMPLO", given: "PRUEBA ANA" })).toBe(true);
    expect(curpMatchesName(SYNTH.curp, { paternal: "EJEMPLO", maternal: "SINTETICO", given: "PRUEBA ANA" })).toBe(false);
  });

  it("CP ↔ estado y abreviaturas de estado", () => {
    expect(stateForPostalCode("06000")).toBe("Ciudad de México");
    expect(stateForPostalCode("44100")).toBe("Jalisco");
    expect(stateForPostalCode("00123")).toBeNull();
    expect(stateFromAbbr("CDMX.")).toBe("Ciudad de México");
    expect(stateFromAbbr("Q. ROO")).toBe("Quintana Roo");
    expect(stateFromAbbr("N.L.")).toBe("Nuevo León");
    expect(stateFromAbbr("XYZ")).toBeNull();
  });

  it("renglón de nombre: nunca con dígitos o símbolos", () => {
    expect(isNameLine("DE LA CRUZ")).toBe(true);
    expect(isNameLine("MA. DEL CARMEN")).toBe(true);
    for (const bad of ["5INTETICO", "GARC1A", "12345", "PRUEBA 2", "ANA/MARIA", "0505 1985"]) expect(isNameLine(bad)).toBe(false);
  });
});

describe("IneParser v1", () => {
  it("frente limpio: todos los campos, ninguno en confianza alta", () => {
    const r = parseIne(obs(ineFront()));
    expect(r.detected).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(val(r, "paternal_last_name")).toBe("SINTETICO");
    expect(val(r, "maternal_last_name")).toBe("EJEMPLO");
    expect(val(r, "first_name")).toBe("PRUEBA");
    expect(val(r, "middle_name")).toBe("ANA");
    expect(val(r, "curp")).toBe(SYNTH.curp);
    expect(val(r, "voter_key")).toBe(SYNTH.voterKey);
    expect(val(r, "birth_date")).toBe("1985-05-05");
    expect(val(r, "gender")).toBe("female");
    expect(val(r, "street")).toBe("FALSA");
    expect(val(r, "exterior_number")).toBe("123");
    expect(val(r, "interior_number")).toBe("4");
    expect(val(r, "neighborhood")).toBe("CENTRO");
    expect(val(r, "postal_code")).toBe("06000");
    expect(val(r, "municipality")).toBe("CUAUHTEMOC");
    expect(val(r, "state")).toBe("Ciudad de México");
    expect(r.fields.every((f) => f.confidence !== "high")).toBe(true);
    expect(r.fields.every((f) => isFactKey(f.key))).toBe(true);
    // Corroborados por otra fuente (CURP ↔ fecha/sexo/clave, CP ↔ estado) → media
    expect(get(r, "curp")!.confidence).toBe("medium");
    expect(get(r, "paternal_last_name")!.confidence).toBe("medium");
    expect(get(r, "postal_code")!.confidence).toBe("medium");
  });

  it("texto numérico JAMÁS termina como nombre (regresión del prototipo)", () => {
    for (const garbage of [{ paternal: "5INTET1CO" }, { maternal: "0505 1985" }, { given: "12345" }, { paternal: "85050509" }]) {
      const r = parseIne(obs(ineFront(garbage)));
      for (const k of ["paternal_last_name", "maternal_last_name", "first_name", "middle_name"]) {
        const v = val(r, k);
        expect(v === undefined || !/\d/.test(v)).toBe(true);
      }
      expect(val(r, "paternal_last_name")).toBeUndefined();
      expect(r.warnings.join(" ")).toMatch(/números o símbolos/);
      // El resto sigue funcionando
      expect(val(r, "curp")).toBe(SYNTH.curp);
    }
  });

  it("apellidos en orden cambiado: la CURP lo delata → confianza baja + aviso", () => {
    const r = parseIne(obs(ineFront({ paternal: "EJEMPLO", maternal: "SINTETICO" })));
    expect(get(r, "paternal_last_name")!.confidence).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/iniciales de la CURP/);
  });

  it("fecha impresa contradice CURP/clave → baja confianza y aviso (no se elige a ciegas)", () => {
    const r = parseIne(obs(ineFront({ birth: "06/05/1985" })));
    expect(get(r, "birth_date")!.confidence).toBe("low");
    expect(get(r, "curp")!.confidence).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/fecha de nacimiento no coincide/);
  });

  it("sexo impreso contradice CURP → baja confianza y aviso", () => {
    const r = parseIne(obs(ineFront({ sex: "H" })));
    expect(get(r, "gender")!.confidence).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/sexo no coincide/);
  });

  it("CURP con un carácter mal leído: se descarta (nunca se reconstruye)", () => {
    const bad = SYNTH.curp.slice(0, 12) + "Z" + SYNTH.curp.slice(13); // rompe el dígito verificador
    const r = parseIne(obs(ineFront({ curp: bad })));
    expect(val(r, "curp")).toBeUndefined();
    // Sin CURP la fecha se respalda con la clave de elector
    expect(val(r, "birth_date")).toBe("1985-05-05");
    // Sin CURP no hay cruce de nombre → confianza baja
    expect(get(r, "paternal_last_name")!.confidence).toBe("low");
  });

  it("regresión ML Kit: \"0\"→\"O\" en la posición 17 de la CURP pasa el dígito verificador, pero se rechaza por siglo", () => {
    const misread = SYNTH.curp.slice(0, 16) + "O" + SYNTH.curp[17]; // así lo leyó ML Kit en el emulador
    expect(misread).not.toBe(SYNTH.curp);
    expect(isValidCurp(misread)).toBe(false); // implica nacimiento en 2085
    const r = parseIne(obs(ineFront({ curp: misread })));
    expect(val(r, "curp")).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/CURP leída no pasa la validación/);
    // El resto sigue: la fecha impresa se respalda con la clave de elector
    expect(val(r, "birth_date")).toBe("1985-05-05");
  });

  it("CP que no corresponde al estado → baja confianza + aviso; CP inexistente → vacío", () => {
    let r = parseIne(obs(ineFront({ munState: "ZAPOPAN, JAL." })));
    expect(get(r, "postal_code")!.confidence).toBe("low");
    expect(r.warnings.join(" ")).toMatch(/código postal no corresponde/);
    r = parseIne(obs(ineFront({ colonia: "COL CENTRO 00123" })));
    expect(val(r, "postal_code")).toBeUndefined();
  });

  it("domicilio con manzana/lote no se parte a ciegas", () => {
    const r = parseIne(obs(ineFront({ street: "AND PRUEBA MZ 3 LT 12" })));
    expect(val(r, "street")).toBeUndefined();
    expect(val(r, "postal_code")).toBe("06000");
    expect(r.warnings.join(" ")).toMatch(/calle y número/);
  });

  it("etiquetas con errores de OCR y valor a la derecha en otro renglón", () => {
    const page = ineFront({ drop: [`CURP ${SYNTH.curp}`, "NOMBRE", "DOMICILIO"], extra: [{ text: "N0MBRE", x: 310, y: 130 }, { text: "DOMICILI0", x: 310, y: 252 }, { text: "CURP", x: 310, y: 410 }, { text: SYNTH.curp, x: 390, y: 411 }] });
    const r = parseIne(obs(page));
    expect(val(r, "curp")).toBe(SYNTH.curp);
    expect(val(r, "paternal_last_name")).toBe("SINTETICO");
    expect(val(r, "postal_code")).toBe("06000");
  });

  it("puede devolver vacío: texto que no es INE, o INE ilegible", () => {
    const notIne = parseIne(obs(obsFromRows([{ text: "RECIBO DE LUZ", x: 10, y: 10 }, { text: "TOTAL A PAGAR 523", x: 10, y: 40 }])));
    expect(notIne).toEqual({ detected: false, fields: [], warnings: [] });
    const blurry = parseIne(obs(obsFromRows([{ text: "CREDENCIAL PARA VOTAR", x: 10, y: 10 }, { text: "NOMBRE", x: 10, y: 50 }, { text: "#@!", x: 10, y: 78 }])));
    expect(blurry.detected).toBe(true);
    expect(blurry.fields).toEqual([]);
  });

  it("dos CURP válidas distintas sin etiqueta → ambigua, no se elige ninguna", () => {
    const other17 = "SIEP850505MDFNJR1";
    const other = other17 + curpCheckDigit(other17);
    const page = ineFront({ drop: [`CURP ${SYNTH.curp}`], extra: [{ text: SYNTH.curp, x: 310, y: 600 }, { text: other, x: 600, y: 600 }] });
    const r = parseIne(obs(page));
    expect(val(r, "curp")).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/varias CURP/);
  });

  it("reverso MRZ: solo si los dígitos verificadores son válidos; cruza fecha, sexo y nombre", () => {
    const ok = parseIne(obs(ineFront(), ineBack()));
    expect(ok.warnings).toEqual([]);
    expect(get(ok, "birth_date")!.confidence).toBe("medium");
    const contra = parseIne(obs(ineFront(), ineBack({ birth: "850506" })));
    expect(contra.warnings.join(" ")).toMatch(/reverso \(MRZ\)/);
    const broken = parseMrz(ineBack({ breakCheck: true }).blocks.map((b) => b.text));
    expect(broken).toBeNull();
    // Solo reverso: nombre desde MRZ (sin dígitos), fecha no se inventa sin segunda fuente
    const onlyBack = parseIne(obs(ineBack()));
    expect(onlyBack.detected).toBe(true);
    expect(val(onlyBack, "paternal_last_name")).toBe("SINTETICO");
    expect(get(onlyBack, "paternal_last_name")!.confidence).toBe("low");
    expect(val(onlyBack, "birth_date")).toBeUndefined();
  });

  it("nombre del reverso distinto al frente → aviso", () => {
    const r = parseIne(obs(ineFront(), ineBack({ names: "OTRO<APELLIDO<<PERSONA" })));
    expect(r.warnings.join(" ")).toMatch(/frente no coincide con el del reverso/);
    expect(get(r, "paternal_last_name")!.confidence).toBe("low");
  });
});

describe("proveedor OCR del dispositivo", () => {
  it("valida la observación (entrada no confiable)", () => {
    expect(parseObservation({ engine: "x", pages: [] })).toBeNull();
    expect(parseObservation({ engine: "x", pages: [{ width: 1, height: 1, blocks: [{ text: "a", box: {}, lines: [] }] }] })).toBeNull();
    expect(parseObservation(obs(ineFront()))).not.toBeNull();
  });

  it("INE → campos por revisar; nunca confianza alta; sin observación no hace nada", async () => {
    const r = await runExtraction({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg", docType: "ine", observation: obs(ineFront()) });
    expect(r.provider).toBe("ocr-dispositivo");
    expect(r.fields.length).toBeGreaterThanOrEqual(10);
    expect(r.fields.some((f) => f.confidence === "high")).toBe(false);
    expect(await onDeviceOcrProvider.extract({ bytes: new Uint8Array(), mime: "image/jpeg", docType: "ine" })).toBeNull();
  });

  it("otro documento: solo patrones inequívocos, confianza baja, CURP con dígito verificador", async () => {
    const other17 = "SIEP850505MDFNJR1";
    const page = obsFromRows([{ text: `CURP ${SYNTH.curp}`, x: 10, y: 10 }, { text: `CURP ${other17}${curpCheckDigit(other17)}`, x: 10, y: 60 }]);
    const r = await runExtraction({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg", docType: "proof_of_address", observation: obs(page) });
    // Dos CURP distintas en el texto → ambiguo → ninguna
    expect(r.fields.find((f) => f.key === "curp")).toBeUndefined();
    const single = await runExtraction({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg", docType: "tax_id", observation: obs(obsFromRows([{ text: `CURP ${SYNTH.curp}`, x: 10, y: 10 }])) });
    expect(single.fields).toEqual([expect.objectContaining({ key: "curp", confidence: "low" })]);
  });
});

describe("flujo completo: escanear INE → observado → confirmar → solicitud", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());
  // JPEG mínimo (solo firma de bytes; el archivo real lo produce el escáner de la tablet)
  const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

  it("todo entra OBSERVADO; lo observado no llena el PDF; al confirmar, sí", async () => {
    const p = await newProspect(app, "Escaneo INE");
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes: JPEG, fileName: "ine.jpg", docType: "ine", observation: obs(ineFront(), ineBack()) });
    expect(doc.extractionProvider).toBe("ocr-dispositivo");
    expect(doc.extractionStatus).toBe("observed");
    const rows = await app.db.select().from(s.customerFacts).where(eq(s.customerFacts.sourceRefId, doc.id));
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const r of rows) {
      expect(r.status).toBe("observed");
      expect(r.source).toBe("document");
      expect(r.confidence).not.toBe("high");
      expect(r.sourceLabel).toMatch(/escaneado en la tablet/);
    }

    const application = await createApplication(app, { customerId: p.customer.id, institutionCode: "BBVA" });
    const before = await generateApplicationPdf(app, application.id);
    expect(before.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ slot: "bbva.cliente.curp", reason: "needs_confirmation" })]));

    const { facts } = await getInboxDocument(app, doc.id);
    for (const key of ["curp", "paternal_last_name", "first_name"]) {
      const f = facts.find((x) => x.key === key)!;
      await reviewFact(app, { customerId: p.customer.id, documentId: doc.id, factId: f.id, action: "confirm" });
    }
    const after = await generateApplicationPdf(app, application.id);
    const form = (await PDFDocument.load((await getGeneratedPdf(app, after.document.id)).bytes)).getForm();
    expect((form.getField("curp") as PDFTextField).getText()).toBe(SYNTH.curp);
    expect((form.getField("Apellido paterno") as PDFTextField).getText()).toBe("SINTETICO");
    expect((form.getField("primer nombre") as PDFTextField).getText()).toBe("PRUEBA");
  });

  it("un dato escaneado que contradice uno confirmado queda en conflicto (sistema existente)", async () => {
    const p = await newProspect(app, "Escaneo Conflicto");
    const { recordFacts } = await import("@/server/services/profile");
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "postal_code", value: "44100" }], sourceType: "mario_capture", sourceLabel: "Captura" });
    const doc = await uploadDocument(app, { customerId: p.customer.id, bytes: JPEG, fileName: "ine.jpg", docType: "ine", observation: obs(ineFront()) });
    const { facts } = await getInboxDocument(app, doc.id);
    expect(facts.find((f) => f.key === "postal_code")!.status).toBe("conflicting");
  });
});
