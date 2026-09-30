/**
 * Credencial INE SINTÉTICA para pruebas del parser: persona inexistente, CURP/clave fabricadas
 * con estructura válida. Simula lo que entrega ML Kit (renglones con cajas en píxeles) sobre una
 * credencial de 1000×630, con la distribución del frente (etiquetas y valores debajo/derecha).
 * NO son datos reales de nadie.
 */
import { curpCheckDigit, mrzCheck } from "@/server/extraction/mx-id";
import type { DocumentObservation } from "@/server/extraction/observation";

const CURP17 = "SIEP850505MDFNJR0";
export const SYNTH = {
  paternal: "SINTETICO",
  maternal: "EJEMPLO",
  given: "PRUEBA ANA",
  curp: CURP17 + curpCheckDigit(CURP17),
  voterKey: "SNEJPR85050509M100",
  birth: "05/05/1985",
  sex: "M",
  street: "C FALSA 123 INT 4",
  colonia: "COL CENTRO 06000",
  munState: "CUAUHTEMOC, CDMX.",
};

type Row = { text: string; x: number; y: number; w?: number };

export function obsFromRows(rows: Row[], size = { width: 1000, height: 630 }): DocumentObservation["pages"][number] {
  const H = 22;
  return {
    ...size,
    blocks: rows.map((r) => {
      const box = { left: r.x, top: r.y, right: r.x + (r.w ?? r.text.length * 13), bottom: r.y + H };
      return { text: r.text, box, lines: [{ text: r.text, box, confidence: 0.9 }] };
    }),
  };
}

/** Frente de la INE. `over` reemplaza textos de renglones (para simular errores de OCR). */
export function ineFront(over: Partial<typeof SYNTH> & { extra?: Row[]; drop?: string[] } = {}): DocumentObservation["pages"][number] {
  const d = { ...SYNTH, ...over };
  const rows: Row[] = [
    { text: "INSTITUTO NACIONAL ELECTORAL", x: 300, y: 30 },
    { text: "CREDENCIAL PARA VOTAR", x: 300, y: 70 },
    { text: "NOMBRE", x: 310, y: 130 },
    { text: `SEXO ${d.sex}`, x: 820, y: 130 },
    { text: d.paternal, x: 310, y: 158 },
    { text: d.maternal, x: 310, y: 186 },
    { text: d.given, x: 310, y: 214 },
    { text: "DOMICILIO", x: 310, y: 252 },
    { text: d.street, x: 310, y: 280 },
    { text: d.colonia, x: 310, y: 308 },
    { text: d.munState, x: 310, y: 336 },
    { text: `CLAVE DE ELECTOR ${d.voterKey}`, x: 310, y: 380 },
    { text: `CURP ${d.curp}`, x: 310, y: 410 },
    { text: "AÑO DE REGISTRO 2003 01", x: 700, y: 410 },
    { text: "FECHA DE NACIMIENTO", x: 310, y: 440 },
    { text: d.birth, x: 310, y: 468 },
    { text: "SECCION 0001", x: 310, y: 510 },
    { text: "VIGENCIA 2023 - 2033", x: 600, y: 510 },
    ...(over.extra ?? []),
  ].filter((r) => !(over.drop ?? []).includes(r.text));
  return obsFromRows(rows);
}

/** Reverso con MRZ TD1 válida (dígitos verificadores ICAO calculados). */
export function ineBack(opts: { birth?: string; sex?: "M" | "F"; names?: string; breakCheck?: boolean } = {}): DocumentObservation["pages"][number] {
  const birth = opts.birth ?? "850505";
  const expiry = "331231";
  const bCheck = opts.breakCheck ? (mrzCheck(birth) + 1) % 10 : mrzCheck(birth);
  const l1 = "IDMEX1234567890<<0000000000000";
  const l2 = `${birth}${bCheck}${opts.sex ?? "F"}${expiry}${mrzCheck(expiry)}MEX<<<<<<<<<<<0`;
  const l3 = (opts.names ?? "SINTETICO<EJEMPLO<<PRUEBA<ANA").padEnd(30, "<");
  return obsFromRows([
    { text: l1, x: 40, y: 480 },
    { text: l2, x: 40, y: 520 },
    { text: l3, x: 40, y: 560 },
  ]);
}

export const obs = (...pages: DocumentObservation["pages"]): DocumentObservation => ({ engine: "test-fixture", pages });
