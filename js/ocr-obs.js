// Observación de OCR: páginas → bloques → renglones con caja (como la entrega ML Kit en la APK).

/** Renglones de una página en orden de lectura (arriba→abajo, izquierda→derecha). */
export function pageLines(page) {
  return page.blocks
    .flatMap((b) => b.lines)
    .filter((l) => l.text.trim())
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
}

/** Texto pegado (p. ej. "Texto en Vivo" del iPhone): un renglón por línea, apilados. */
export function textToObservation(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((t) => t.trim()).filter(Boolean).slice(0, 200);
  return {
    engine: "texto",
    pages: [{ width: 1000, height: Math.max(1, lines.length * 30), blocks: lines.map((t, i) => ({ text: t, box: { left: 0, top: i * 30, right: 600, bottom: i * 30 + 20 }, lines: [{ text: t, box: { left: 0, top: i * 30, right: 600, bottom: i * 30 + 20 } }] })) }],
  };
}

export const observationText = (obs) => obs.pages.map((p) => pageLines(p).map((l) => l.text).join("\n")).join("\n\n");
