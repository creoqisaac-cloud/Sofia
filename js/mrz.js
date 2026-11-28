// Lectura de la INE renglón por renglón con Tesseract, sin IA. Los renglones se LOCALIZAN aquí (letras
// de altura pareja, alineadas) en vez de dejarle la página completa al lector, que se pierde con reflejos,
// fotos giradas y fondos con dibujos:
//  - Reverso: la MRZ (3 renglones "IDMEX…" de 30 caracteres, monoespaciados y muy espaciados). Se
//    enderezan, se juntan las letras y se leen con lista blanca A-Z 0-9 <. Leer la página completa
//    tarda ~10 s por los códigos QR y casi nunca la lee. Lo leído lo valida parseMrz (mxid.js) con los
//    dígitos verificadores.
//  - Frente: cada renglón enderezado y con contraste local (rescata letras pálidas bajo un reflejo).

const WORK = 1400; // px del lado mayor para localizar (más grande no ayuda y es más lento)
const CHAR_PX = 38; // altura de letra con la que se entrega cada renglón de la MRZ al lector
const TEXT_PX = 32; // … y cada renglón del frente (medido: con más, el gris se vuelve borroso)
const WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
const DEFAULT_PSM = "6"; // el predeterminado de tesseract.js (bloque único): así se deja el lector al terminar

/** Escala de grises (luminancia) de una imagen o canvas, reducida a `scale`. */
function grayOf(source, scale) {
  const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[4 * i] * 299 + d[4 * i + 1] * 587 + d[4 * i + 2] * 114) / 1000;
  return { g, w, h };
}

/**
 * Renglones a la escala de trabajo; si casi no hay (la credencial salió chica en la foto y las letras no
 * llegan al tamaño mínimo), se buscan otra vez a resolución completa. Devuelve los renglones y la escala.
 */
function rowsAtScale(source, find, enough) {
  const s = Math.min(1, WORK / Math.max(source.width, source.height));
  const rows = find(grayOf(source, s));
  if (rows.length >= enough || s === 1) return { rows, s };
  const full = find(grayOf(source, 1));
  return full.length > rows.length ? { rows: full, s: 1 } : { rows, s };
}

/** Umbral adaptativo (Bradley): oscuro = más oscuro que el promedio de su vecindario. Aguanta reflejos. */
function adaptiveDark({ g, w, h }, win, k = 0.15, smooth = 0) {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(4, win >> 1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      let v = g[y * w + x];
      if (smooth) {
        // promedio del vecindario (3×3 con smooth = 1): el ruido de la foto no parte ni pega letras
        const a0 = Math.max(0, y - smooth), a1 = Math.min(h, y + smooth + 1), b0 = Math.max(0, x - smooth), b1 = Math.min(w, x + smooth + 1);
        v = (sum[a1 * (w + 1) + b1] - sum[a0 * (w + 1) + b1] - sum[a1 * (w + 1) + b0] + sum[a0 * (w + 1) + b0]) / ((a1 - a0) * (b1 - b0));
      }
      if (v * (x1 - x0) * (y1 - y0) < s * (1 - k)) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Componentes conexas (8 vecinos): etiqueta por pixel y caja + número de pixeles de cada una. */
function components(bin, w, h) {
  const parent = [0];
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const lab = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bin[i]) continue;
      const ns = [x > 0 ? lab[i - 1] : 0, y > 0 ? lab[i - w] : 0, y > 0 && x > 0 ? lab[i - w - 1] : 0, y > 0 && x < w - 1 ? lab[i - w + 1] : 0].filter(Boolean);
      if (!ns.length) { parent.push(parent.length); lab[i] = parent.length - 1; continue; }
      let m = find(ns[0]);
      for (const n of ns) { const r = find(n); if (r !== m) { if (r < m) { parent[m] = r; m = r; } else parent[r] = m; } }
      lab[i] = m;
    }
  }
  const boxes = new Map();
  for (let i = 0; i < lab.length; i++) {
    if (!lab[i]) continue;
    const r = lab[i] = find(lab[i]);
    const x = i % w, y = (i / w) | 0;
    const b = boxes.get(r);
    if (!b) boxes.set(r, { id: r, x0: x, x1: x, y0: y, y1: y, n: 1 });
    else { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; b.n++; }
  }
  const comps = [...boxes.values()].map((b) => ({ ...b, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 }));
  return { comps, lab };
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

/** Recta por mínimos cuadrados de los centros (y = a + b·x), descartando los que se salen. */
function fitRow(chars, hc) {
  let pts = chars;
  let a = 0, b = 0;
  for (let pass = 0; pass < 2; pass++) {
    const n = pts.length;
    const mx = pts.reduce((s, c) => s + c.cx, 0) / n, my = pts.reduce((s, c) => s + c.cy, 0) / n;
    const sxx = pts.reduce((s, c) => s + (c.cx - mx) ** 2, 0) || 1;
    b = pts.reduce((s, c) => s + (c.cx - mx) * (c.cy - my), 0) / sxx;
    a = my - b * mx;
    const keep = pts.filter((c) => Math.abs(c.cy - (a + b * c.cx)) <= 0.3 * hc);
    if (keep.length < 3 || keep.length === pts.length) break;
    pts = keep;
  }
  const resid = Math.sqrt(pts.reduce((s, c) => s + (c.cy - (a + b * c.cx)) ** 2, 0) / pts.length);
  return { a, b, resid, inliers: pts.length };
}

/**
 * Renglones de texto: caracteres (componentes oscuras de tamaño de letra) enlazados con su vecino a la
 * derecha si tienen altura parecida y están a la misma altura. Coordenadas de la imagen reducida.
 * `joinGap`: hueco máximo (en alturas de letra) para unir tramos alineados del mismo renglón.
 */
export function findTextRows(img, { minChars = 3, joinGap = 1.2, k = 0.15, smooth = 0, extend = false, maxWide = 1.6 } = {}) {
  const { w, h } = img;
  const { comps } = components(adaptiveDark(img, Math.round(Math.max(w, h) / 40), k, smooth), w, h);
  const cands = comps.filter((c) => c.h >= 7 && c.h <= h / 6 && c.w <= maxWide * c.h && c.n >= 0.08 * c.w * c.h).sort((p, q) => p.x0 - q.x0);
  // Cada caracter (o palabra, si las letras se pegaron) se enlaza con su vecino más cercano a la derecha
  // en el mismo renglón: altura parecida, centros a la misma altura y un hueco de a lo más 1.5 letras.
  const next = new Map(), prev = new Map();
  for (let i = 0; i < cands.length; i++) {
    const a = cands[i];
    let best = null;
    for (let j = i + 1; j < cands.length; j++) {
      const b = cands[j];
      if (b.x0 - a.x1 > 4 * a.h) break;
      const hm = Math.max(a.h, b.h);
      const dx = b.x0 - a.x1; // hueco entre las cajas
      if (dx > 1.5 * hm || dx < -0.15 * hm || b.cx - a.cx < 0.4 * hm) continue;
      if (Math.abs(b.cy - a.cy) > 0.35 * hm || Math.min(a.h, b.h) < 0.4 * hm) continue;
      if (!best || dx < best.dx) best = { b, dx };
    }
    if (!best) continue;
    const old = prev.get(best.b);
    if (old && old.dx <= best.dx) continue;
    if (old) next.delete(old.a);
    next.set(a, best);
    prev.set(best.b, { a, dx: best.dx });
  }
  const info = (chain) => {
    const hc = pct(chain.map((c) => c.h), 0.75);
    return { chain, hc, fit: fitRow(chain, hc), x0: Math.min(...chain.map((c) => c.x0)), x1: Math.max(...chain.map((c) => c.x1)) };
  };
  let rows = [];
  for (const c of cands) {
    if (prev.has(c) || !next.has(c)) continue;
    const chain = [c];
    for (let x = next.get(c); x; x = next.get(x.b)) chain.push(x.b);
    if (chain.length >= 2) rows.push(info(chain));
  }
  // Une tramos del mismo renglón cortados por un caracter que no se separó bien.
  rows.sort((p, q) => p.x0 - q.x0);
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < rows.length && !merged; i++) {
      for (let j = 0; j < rows.length && !merged; j++) {
        const A = rows[i], B = rows[j];
        if (i === j || B.x0 < A.x1 - 0.3 * A.hc || B.x0 - A.x1 > joinGap * A.hc || Math.abs(A.hc - B.hc) > 0.3 * A.hc) continue;
        const c0 = B.chain[0];
        if (Math.abs(c0.cy - (A.fit.a + A.fit.b * c0.cx)) > 0.4 * A.hc) continue;
        rows[i] = info([...A.chain, ...B.chain]);
        rows.splice(j, 1);
        merged = true;
      }
    }
  }
  const out = rows
    .filter(({ chain, hc, fit }) => chain.length >= minChars && fit.resid <= 0.2 * hc)
    .map(({ chain, hc, fit, x0, x1 }) => {
      const steps = chain.slice(1).map((c, k) => c.cx - chain[k].cx);
      const pitch = pct(steps, 0.5);
      return {
        x0, x1, hc, a: fit.a, b: fit.b, n: chain.length, y: fit.a + fit.b * (x0 + x1) / 2,
        resid: fit.resid / hc, inliers: fit.inliers / chain.length, pitch: pitch / hc,
        regular: steps.filter((d) => Math.abs(d - pitch) <= 0.15 * pitch).length / steps.length,
        tall: chain.filter((c) => c.h >= 0.7 * hc).length / chain.length,
      };
    })
    .sort((p, q) => p.y - q.y);
  if (extend) extendRows(out, adaptiveDark(img, Math.round(Math.max(w, h) / 40), 0.07, 1), w, h);
  return out;
}

/**
 * Bajo un reflejo las letras quedan tan pálidas que no se separan como caracteres: cada renglón se
 * alarga a los lados mientras haya tinta tenue en su franja (umbral más sensible) y limpio arriba y abajo
 * (así no se mete en la foto, hologramas u orillas). Luego se unen los tramos que quedaron juntos.
 */
function extendRows(rows, dark, w, h) {
  for (const r of rows) {
    // Fracción de tinta en la franja de las letras y en las franjas de arriba/abajo, en la columna x.
    const inkAt = (x, from, to) => {
      const yc = r.a + r.b * x;
      let n = 0, t = 0;
      for (const sign of from < 0 ? [1] : [-1, 1]) {
        for (let y = Math.round(yc + sign * from * r.hc); sign * (y - yc) <= to * r.hc; y += sign) {
          if (y >= 0 && y < h) n += dark[y * w + x];
          t++;
        }
      }
      return n / Math.max(1, t);
    };
    const same = rows.filter((o) => o !== r && Math.abs(o.y - r.y) < 0.5 * r.hc);
    const right = Math.min(w - 1, ...same.filter((o) => o.x0 > r.x1).map((o) => o.x0));
    const left = Math.max(0, ...same.filter((o) => o.x1 < r.x0).map((o) => o.x1));
    for (const dir of [1, -1]) {
      let last = dir > 0 ? r.x1 : r.x0, messy = 0;
      for (let x = Math.round(last) + dir; x >= left && x <= right && Math.abs(x - last) <= 1.5 * r.hc; x += dir) {
        const core = inkAt(x, -0.45, 0.45), outer = inkAt(x, 0.7, 1.05);
        if (outer > 0.25 || core > 0.85) { if (++messy > 0.5 * r.hc) break; continue; } // no parece texto
        messy = 0;
        if (core > 0) last = x;
      }
      if (dir > 0) r.x1 = last; else r.x0 = last;
    }
  }
  // Tramos del mismo renglón que quedaron pegados (una letra pálida o partida los separaba).
  rows.sort((p, q) => p.x0 - q.x0);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const A = rows[i], B = rows[j];
      if (Math.abs(A.y - B.y) >= 0.5 * A.hc || Math.abs(A.hc - B.hc) > 0.3 * A.hc || B.x0 - A.x1 > 0.8 * A.hc || B.x0 < A.x0) continue;
      const main = A.n >= B.n ? A : B;
      rows[i] = { ...main, x0: A.x0, x1: Math.max(A.x1, B.x1), n: A.n + B.n };
      rows.splice(j, 1);
      j = i;
    }
  }
  rows.sort((p, q) => p.y - q.y);
}

/**
 * Renglones con forma de MRZ: ≥ 18 caracteres de altura pareja, sobre una recta, con paso fijo y
 * espaciado amplio (la MRZ es monoespaciada; el texto del frente es proporcional y más junto).
 * Medido: MRZ con paso ≈ 1.15–1.25 × altura y regularidad ≥ 0.96; texto del frente con paso
 * ≤ 0.87 × altura y regularidad ≤ 0.8.
 */
export const findMrzRows = (img) =>
  findTextRows(img, { minChars: 18, joinGap: 4 }).filter((r) => r.resid <= 0.15 && r.inliers >= 0.8 && r.pitch >= 0.92 && r.pitch <= 1.8 && r.regular >= 0.8 && r.tall >= 0.6);

/**
 * Recorta un renglón de la foto ORIGINAL, enderezado y escalado a CHAR_PX de altura de letra.
 * `s` = escala de la imagen donde se localizó. Devuelve el canvas y la caja en la foto original.
 */
function rowImage(source, row, s, { flip = false, band = 1, margin = 1.2, px = CHAR_PX } = {}) {
  const k = px / (row.hc / s); // px de salida por px original
  const len = (row.x1 - row.x0) / s + 2 * margin * row.hc / s;
  const theta = Math.atan(row.b) + (flip ? Math.PI : 0);
  const cxW = (row.x0 + row.x1) / 2;
  const cx = cxW / s, cy = (row.a + row.b * cxW) / s;
  const W = Math.round(len * k), H = Math.round(2 * band * px);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(W / 2, H / 2);
  ctx.scale(k, k);
  ctx.rotate(-theta);
  ctx.translate(-cx, -cy);
  ctx.drawImage(source, 0, 0);
  const half = len / 2, hh = (H / 2) / k;
  const box = { left: Math.round(cx - half), right: Math.round(cx + half), top: Math.round(cy - hh), bottom: Math.round(cy + hh) };
  return { canvas: c, box };
}

/** Tinta de un renglón con contraste local por columnas: aguanta reflejos y fondos de colores. */
function rowInk(canvas, px = CHAR_PX) {
  const W = canvas.width, H = canvas.height;
  const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = (d[4 * i] * 299 + d[4 * i + 1] * 587 + d[4 * i + 2] * 114) / 1000;
  // Fondo por columna (lo más claro de la banda) y tinta (lo más oscuro), tomados en una ventana a lo ancho.
  const R = px;
  const colMax = new Float32Array(W), colMin = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let mx = 0, mn = 255;
    for (let y = 0; y < H; y++) { const v = g[y * W + x]; if (v > mx) mx = v; if (v < mn) mn = v; }
    colMax[x] = mx; colMin[x] = mn;
  }
  // `on`: tinta sí/no; `tone`: gris con el contraste estirado entre tinta y fondo (conserva el suavizado de
  // los bordes, que al lector le sirve con fotos borrosas).
  const on = new Uint8Array(W * H), tone = new Uint8Array(W * H).fill(255);
  for (let x = 0; x < W; x++) {
    let bg = 0, ink = 255;
    for (let t = Math.max(0, x - R); t < Math.min(W, x + R + 1); t++) { if (colMax[t] > bg) bg = colMax[t]; if (colMin[t] < ink) ink = colMin[t]; }
    if (bg - ink < 25) continue; // sin tinta suficiente en el vecindario: fondo
    const t = ink + (bg - ink) * 0.55;
    for (let y = 0; y < H; y++) {
      const v = g[y * W + x];
      if (v < t) on[y * W + x] = 1;
      tone[y * W + x] = Math.max(0, Math.min(255, Math.round((255 * (v - ink)) / (bg - ink) * 1.15)));
    }
  }
  return { on, tone, W, H };
}

/** Dibuja las columnas `cols` del renglón (en negro o en gris), separadas por `gap` y con margen `pad`. */
function paint({ on, tone, W, H }, cols, gap, pad, gray = false) {
  const OW = cols.reduce((n, [a, b]) => n + b - a + 1 + gap, 2 * pad);
  const out = document.createElement("canvas");
  out.width = OW; out.height = H;
  const octx = out.getContext("2d");
  const o = octx.createImageData(OW, H);
  o.data.fill(255);
  let ox = pad;
  for (const [a, b] of cols) {
    for (let x = a; x <= b; x++, ox++) {
      for (let y = 0; y < H; y++) {
        const v = gray ? tone[y * W + x] : on[y * W + x] ? 0 : 255;
        if (v === 255) continue;
        const p = 4 * (y * OW + ox);
        o.data[p] = o.data[p + 1] = o.data[p + 2] = v;
      }
    }
    ox += gap;
  }
  octx.putImageData(o, 0, 0);
  return out;
}

/**
 * Renglón de la MRZ: cada caracter es un tramo de columnas con tinta en la franja central (los trazos del
 * renglón vecino quedan arriba o abajo); se descartan bordes de la credencial y basura (altura que no es de
 * letra) y se JUNTAN las letras con un hueco fijo: vienen tan separadas que el lector las parte.
 */
function cleanMrzRow(canvas) {
  const bin = rowInk(canvas);
  const { on, W, H } = bin;
  const y0 = Math.round(H * 0.2), y1 = Math.round(H * 0.8);
  const used = (x) => { for (let y = y0; y < y1; y++) if (on[y * W + x]) return true; return false; };
  const slots = [];
  for (let x = 0; x < W; x++) {
    if (!used(x)) continue;
    const a = x;
    while (x + 1 < W && used(x + 1)) x++;
    let top = H, bottom = -1, px = 0;
    for (let t = a; t <= x; t++) for (let y = 0; y < H; y++) if (on[y * W + t]) { px++; if (y < top) top = y; if (y > bottom) bottom = y; }
    const tall = bottom - top + 1;
    if (tall >= 0.3 * CHAR_PX && tall <= 1.45 * CHAR_PX && x - a + 1 <= 3 * CHAR_PX && px >= 0.04 * CHAR_PX * CHAR_PX) slots.push([a, x]);
  }
  return paint(bin, slots, Math.round(CHAR_PX * 0.3), CHAR_PX);
}

/**
 * Renglón de texto normal (frente): se conserva el espaciado y la puntuación; solo se quitan manchas que
 * tocan el borde de arriba o de abajo (renglones vecinos, orillas de la credencial o de la foto).
 */
function cleanTextRow(canvas, px) {
  const bin = rowInk(canvas, px);
  const { on, W, H } = bin;
  const { comps, lab } = components(on, W, H);
  const drop = new Set(comps.filter((c) => c.y0 === 0 || c.y1 === H - 1).map((c) => c.id));
  // Lo que se quita se blanquea con un pixel de holgura (el gris de su orilla tampoco es letra).
  for (let i = 0; i < on.length; i++) {
    if (!drop.has(lab[i])) continue;
    on[i] = 0;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) { bin.tone[yy * W + xx] = 255; }
    }
  }
  return paint(bin, [[0, W - 1]], 0, 0, true);
}

/**
 * Busca y lee la MRZ. null si la foto no tiene renglones con forma de MRZ (p. ej. es el frente). Si los
 * tiene, devuelve los renglones leídos (texto + caja en la foto): los primeros que `accept` dé por buenos
 * (estructura y dígitos verificadores), probando también la foto de cabeza (entonces las cajas van en la
 * foto girada media vuelta, mismo tamaño); si ninguno, la lectura derecha. Deja el lector como estaba.
 */
export async function readMrzRows(source, worker, accept) {
  const { rows, s } = rowsAtScale(source, findMrzRows, 2);
  if (rows.length < 2) return null;
  const { width: W, height: H } = source;
  await worker.setParameters({ tessedit_char_whitelist: WHITELIST, tessedit_pageseg_mode: "7" });
  try {
    let first = null;
    for (const flip of [false, true]) {
      // La MRZ va al pie de la credencial: son los últimos renglones en orden de lectura (de cabeza, al revés).
      const ordered = (flip ? [...rows].reverse() : rows).slice(-4);
      const out = [];
      for (const row of ordered) {
        const { canvas, box } = rowImage(source, row, s, { flip });
        const { data } = await worker.recognize(cleanMrzRow(canvas));
        const text = data.text.replace(/\s+/g, "");
        // De cabeza, las cajas se dan en la foto ya girada: así el orden de lectura (renglón 1, 2, 3) se conserva.
        if (text) out.push({ text, box: flip ? { left: W - box.right, right: W - box.left, top: H - box.bottom, bottom: H - box.top } : box, confidence: (data.confidence ?? 0) / 100 });
      }
      if (accept(out.map((r) => r.text))) return out;
      first ??= out;
    }
    return first;
  } finally {
    await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: DEFAULT_PSM });
  }
}

/**
 * Lee renglón por renglón (localizados aquí, no por Tesseract): cada uno enderezado y con contraste
 * local, lo que rescata texto bajo reflejos o con la foto girada. Devuelve renglones con caja en la foto.
 */
export async function readTextRows(source, worker, { maxRows = 40, onRow = () => {} } = {}) {
  // Letras pegadas (texto chico o borroso) también cuentan como caracteres de un renglón.
  const found = rowsAtScale(source, (img) => findTextRows(img, { minChars: 2, extend: true, maxWide: 3 }).filter((r) => r.tall >= 0.5), 12);
  const s = found.s;
  // Los renglones más largos primero (los datos de la INE), hasta `maxRows`; luego en orden de lectura.
  const rows = found.rows
    .sort((a, b) => b.n - a.n)
    .slice(0, maxRows)
    .sort((a, b) => a.y - b.y);
  await worker.setParameters({ tessedit_pageseg_mode: "7" });
  try {
    const out = [];
    for (const [i, row] of rows.entries()) {
      onRow(i, rows.length);
      const { canvas, box } = rowImage(source, row, s, { band: 0.85, margin: 0.5, px: TEXT_PX });
      const { data } = await worker.recognize(cleanTextRow(canvas, TEXT_PX));
      const text = tidy(data.text);
      if (text) out.push({ text, box, confidence: (data.confidence ?? 0) / 100 });
    }
    return out;
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: DEFAULT_PSM });
  }
}

/** Quita la basura de las orillas del renglón ("- MÉXICO —", "EJEMPLO :"): signos sueltos al inicio o al final. */
function tidy(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const junk = (w) => !/[\p{L}\p{N}]/u.test(w);
  while (words.length && junk(words[0])) words.shift();
  while (words.length && junk(words.at(-1))) words.pop();
  return words.join(" ").replace(/^[^\p{L}\p{N}]+/u, "");
}

/**
 * Ángulo (radianes) que hay que girar la foto para que los renglones queden horizontales: la inclinación
 * (mediana de los renglones, pesada por caracteres) y, si el texto sale vertical, un cuarto de vuelta.
 * De cabeza no se distingue sin leer: eso lo prueba quien llama.
 */
export function textAngle(source) {
  const s = Math.min(1, WORK / Math.max(source.width, source.height));
  const first = angleOf(grayOf(source, s));
  if (first.sure || s === 1) return first.angle;
  // Pocos renglones: la credencial salió chica en la foto; se mide a resolución completa.
  const full = angleOf(grayOf(source, 1));
  return full.sure ? full.angle : first.angle;
}

function angleOf(img) {
  const { g, w, h } = img;
  const t = new Uint8Array(w * h); // imagen con un cuarto de vuelta (transpuesta)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + (h - 1 - y)] = g[y * w + x];
  const turnedImg = { g: t, w: h, h: w };
  const measure = (im) => {
    // Los módulos de los códigos QR forman "renglones" apilados casi sin separación: no cuentan.
    const rows = findTextRows(im, { minChars: 6 });
    const text = rows.filter((r) => !rows.some((o) => o !== r && Math.abs(o.y - r.y) < 1.2 * r.hc && o.x0 < r.x1 && o.x1 > r.x0));
    const angles = text.flatMap((r) => Array(r.n).fill(Math.atan(r.b))).sort((a, b) => a - b);
    return { chars: angles.length, skew: angles.length ? angles[angles.length >> 1] : 0 };
  };
  // La MRZ del reverso es la señal más clara de hacia dónde van los renglones.
  const flat = measure(img);
  if (findMrzRows(img).length >= 2) return { angle: flat.skew, sure: true };
  const mrzTurned = findMrzRows(turnedImg).length;
  if (mrzTurned < 2 && flat.chars >= 60) return { angle: flat.skew, sure: true };
  const turned = measure(turnedImg);
  if (mrzTurned >= 2 || turned.chars > 2 * Math.max(20, flat.chars)) return { angle: -Math.PI / 2 + turned.skew, sure: mrzTurned >= 2 || turned.chars >= 60 };
  return { angle: flat.chars >= 20 ? flat.skew : 0, sure: false };
}

/** Copia de la foto girada `-angle` (los renglones quedan horizontales), con fondo blanco en las esquinas. */
export function straighten(source, angle) {
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const W = Math.round(source.width * cos + source.height * sin), H = Math.round(source.width * sin + source.height * cos);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-angle);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return c;
}
