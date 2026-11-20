// Lectura de texto de la INE, del mejor método disponible al peor (ninguno usa IA ni cuesta):
//  1. APK Android: escáner nativo ML Kit (cámara guiada, recorte, OCR en el dispositivo, sin internet).
//  2. Navegador (iPhone, PC): foto → Tesseract.js incluido en la app (corre en el navegador, sin CDN),
//     renglón por renglón con los renglones localizados en mrz.js (MRZ del reverso y frente).
//  3. Texto pegado (p. ej. "Texto en Vivo" del iPhone) o captura manual.
import { hasScanner, scanner } from "./native.js";
import { base64ToBlob, blobToBase64 } from "./util.js";
import { readMrzRows, readTextRows, straighten, textAngle } from "./mrz.js";
import { parseMrz } from "./mxid.js";
import { readIne } from "./ine.js";

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

// Datos sin los cuales la lectura no sirve: si falta alguno tras la primera lectura, se lee otra vez.
const KEY_DATA = ["curp", "voter_key", "paternal_last_name", "first_name", "birth_date", "postal_code", "street", "ine_validity"];

async function tesseract(blob, onProgress) {
  onProgress("Preparando el lector (la primera vez tarda un poco)…");
  const T = await loadTesseract();
  let fullPage = false;
  const worker = await T.createWorker("spa", 1, {
    workerPath: `${VENDOR}worker.min.js`,
    corePath: VENDOR,
    langPath: `${VENDOR}lang`,
    gzip: true,
    logger: (m) => { if (fullPage && m.status === "recognizing text") onProgress(`Leyendo la foto… ${Math.round((m.progress ?? 0) * 100)}%`); },
  });
  const page = (width, height, lines) => ({ width, height, blocks: lines.map((l) => ({ text: l.text, box: l.box, lines: [l] })) });
  try {
    const bmp = fit(await createImageBitmap(blob, { imageOrientation: "from-image" }).catch(() => createImageBitmap(blob)).catch(() => null));
    // Inclinación de los renglones (y un cuarto de vuelta si la credencial salió de lado en la foto).
    const angle = bmp ? textAngle(bmp) : 0;
    // Reverso: solo la MRZ (≈0.5 s). La página completa no aporta datos y tarda ~10 s por los códigos QR:
    // si la foto tiene renglones con forma de MRZ ya es el reverso, aunque no se hayan podido leer bien.
    if (bmp) {
      onProgress("Buscando el código del reverso…");
      const src = Math.abs(angle) > Math.PI / 4 ? straighten(bmp, angle) : bmp; // cada renglón se endereza solo
      const rows = await readMrzRows(src, worker, (texts) => Boolean(parseMrz(texts)));
      if (rows) return { engine: "tesseract", pages: [page(src.width, src.height, rows)] };
    }
    // Frente: la foto se endereza y se lee renglón por renglón (localizados aquí, con contraste local:
    // aguanta reflejos, letras pálidas y fondos con dibujos mejor que la página completa).
    const obs = { engine: "tesseract", pages: [] };
    let straight = bmp;
    if (bmp) {
      const onRow = (i, n) => onProgress(`Leyendo la foto… ${Math.round((100 * i) / n)}%`);
      // Si no aparece una INE, se prueba la foto de cabeza (sin leer no se sabe hacia dónde va el texto).
      for (const turn of [0, Math.PI]) {
        const img = Math.abs(angle + turn) > 0.01 ? straighten(bmp, angle + turn) : bmp;
        const pages = [page(img.width, img.height, await readTextRows(img, worker, { onRow }))];
        const found = readIne({ engine: "tesseract", pages }).detected;
        if (turn === 0 || found) { straight = img; obs.pages = pages; }
        if (found) break;
      }
    }
    // ¿Faltan datos clave? Segunda lectura: la página completa con la segmentación propia de Tesseract.
    // El lector de la INE toma de cada lectura lo que pasa sus validaciones.
    if (!obs.pages.length || KEY_DATA.some((k) => !readIne(obs).values[k])) {
      const { image, width, height } = await prepare(straight, blob);
      // Segmentación automática: medido, lee mejor la credencial que el bloque único predeterminado.
      await worker.setParameters({ tessedit_pageseg_mode: "3" });
      fullPage = true;
      const { data } = await worker.recognize(image);
      fullPage = false;
      obs.pages.push(page(width, height, (data.lines ?? []).flatMap(splitLine).filter((l) => l.text)));
    }
    return obs;
  } finally {
    await worker.terminate();
  }
}

/**
 * Fotos de 12 MP: se trabaja a 2400 px del lado mayor (la credencial sigue con letra de sobra) para no
 * agotar la memoria de canvas del teléfono (Safari en iPhone tiene un límite bajo).
 */
function fit(bmp, max = 2400) {
  if (!bmp || Math.max(bmp.width, bmp.height) <= max) return bmp;
  const k = max / Math.max(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/**
 * Mejora la foto antes de leerla: tamaño de trabajo de ~2000 px, escala de grises y contraste
 * estirado (las INE tienen fondos de colores y hologramas que confunden al lector).
 */
async function prepare(bmp, blob) {
  try {
    if (!bmp) throw new Error("sin imagen decodificada");
    const scale = Math.min(2.5, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
    // Recorta el 1% más oscuro y más claro y estira el resto a 0–255.
    const total = w * h;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.01) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.01) hi--;
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
    return { image: c, width: w, height: h };
  } catch {
    if (bmp instanceof HTMLCanvasElement) return { image: bmp, width: bmp.width, height: bmp.height };
    const b = bmp ?? (await createImageBitmap(blob));
    return { image: blob, width: b.width, height: b.height };
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
