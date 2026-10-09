// Lectura de texto de la INE, del mejor método disponible al peor (ninguno usa IA ni cuesta):
//  1. APK Android: escáner nativo ML Kit (cámara guiada, recorte, OCR en el dispositivo, sin internet).
//  2. Navegador (iPhone, PC): foto → Tesseract.js incluido en la app (corre en el navegador, sin CDN).
//  3. Texto pegado (p. ej. "Texto en Vivo" del iPhone) o captura manual.
import { hasScanner, scanner } from "./native.js";
import { base64ToBlob, blobToBase64 } from "./util.js";

/** Escaneo nativo de UNA cara de la credencial. Devuelve { obs, blob } o lanza un error legible. */
export async function nativeScan() {
  if (!hasScanner()) throw new Error("El escáner solo existe en la app de Android.");
  const r = await scanner().scanAndRecognize({ pageLimit: 1, galleryImport: true });
  return { obs: { engine: r.engine, pages: r.pages ?? [] }, blob: base64ToBlob(r.file.base64, r.file.mime) };
}

/** OCR de una foto ya tomada: ML Kit si estamos en la APK; si no, Tesseract en el navegador. */
export async function photoToObservation(blob, onProgress = () => {}) {
  const sc = scanner();
  if (sc?.recognizeImage) {
    onProgress("Leyendo la foto en el dispositivo…");
    const r = await sc.recognizeImage({ base64: await blobToBase64(blob) });
    return { engine: r.engine, pages: r.pages };
  }
  return tesseract(blob, onProgress);
}

// Incluido en vendor/tesseract (tesseract.js 5.1.1 + datos en español): no depende de ningún CDN.
const VENDOR = new URL("../vendor/tesseract/", import.meta.url).href;
let loading;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${VENDOR}tesseract.min.js`;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { loading = undefined; reject(new Error("No se pudo cargar el lector de fotos. Captura los datos a mano.")); };
    document.head.append(s);
  });
  return loading;
}

async function tesseract(blob, onProgress) {
  onProgress("Preparando el lector (la primera vez tarda un poco)…");
  const T = await loadTesseract();
  const worker = await T.createWorker("spa", 1, {
    workerPath: `${VENDOR}worker.min.js`,
    corePath: VENDOR,
    langPath: `${VENDOR}lang`,
    gzip: true,
    logger: (m) => { if (m.status === "recognizing text") onProgress(`Leyendo la foto… ${Math.round((m.progress ?? 0) * 100)}%`); },
  });
  try {
    const bmp = await createImageBitmap(blob);
    const { data } = await worker.recognize(blob);
    const segs = (data.lines ?? []).flatMap(splitLine).filter((l) => l.text);
    return {
      engine: "tesseract",
      pages: [{ width: bmp.width, height: bmp.height, blocks: segs.map((l) => ({ text: l.text, box: l.box, lines: [l] })) }],
    };
  } finally {
    await worker.terminate();
  }
}

const box = (b) => ({ left: b.x0, top: b.y0, right: b.x1, bottom: b.y1 });

/**
 * Tesseract une en un renglón textos separados por un hueco grande ("NOMBRE ······ SEXO M").
 * ML Kit los entrega como bloques distintos; aquí se cortan igual para que el lector use la geometría.
 */
function splitLine(l) {
  const words = (l.words ?? []).filter((w) => w.text?.trim());
  if (words.length < 2) return [{ text: l.text.trim(), box: box(l.bbox), confidence: (l.confidence ?? 0) / 100 }];
  const h = Math.max(1, l.bbox.y1 - l.bbox.y0);
  const out = [];
  let cur = [words[0]];
  for (let i = 1; i < words.length; i++) {
    if (words[i].bbox.x0 - words[i - 1].bbox.x1 > 2.5 * h) { out.push(cur); cur = []; }
    cur.push(words[i]);
  }
  out.push(cur);
  return out.map((ws) => ({
    text: ws.map((w) => w.text).join(" ").trim(),
    box: { left: ws[0].bbox.x0, top: Math.min(...ws.map((w) => w.bbox.y0)), right: ws.at(-1).bbox.x1, bottom: Math.max(...ws.map((w) => w.bbox.y1)) },
    confidence: ws.reduce((a, w) => a + (w.confidence ?? 0), 0) / ws.length / 100,
  }));
}

export const canScanNatively = hasScanner;
