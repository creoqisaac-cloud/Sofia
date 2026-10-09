// Regenera los archivos de prueba/ que salen del código de la app completa (misma lógica, sin duplicar):
//   node scripts/prueba-generar.mjs
//  - prueba/js/mxid.js, prueba/js/ine-parser.js   ← src/server/extraction (lector de INE)
//  - prueba/js/bank-adapters.js                   ← src/domain/credit (mapeo real BBVA/Banorte)
//  - prueba/vendor/anthropic-sdk.mjs              ← @anthropic-ai/sdk (IA en el navegador, sin CDN)
//  - prueba/servidor/cloudflare/worker-un-archivo.js ← conector en un solo archivo para Cloudflare
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (p) => path.join(root, p);
const banner = (src) => ({ js: `// GENERADO por scripts/prueba-generar.mjs desde ${src}. No editar a mano.` });

async function entry(name, code, opts) {
  const tmp = r(`src/__gen_${name}.ts`);
  fs.writeFileSync(tmp, code);
  try { await build({ entryPoints: [tmp], bundle: true, format: "esm", target: "es2020", logLevel: "warning", ...opts }); } finally { fs.rmSync(tmp); }
}

await build({ entryPoints: [r("src/server/extraction/mx-id.ts")], format: "esm", target: "es2020", outfile: r("prueba/js/mxid.js"), banner: banner("src/server/extraction/mx-id.ts"), logLevel: "warning" });
await entry("ine", 'export { parseIne, isNameLine, normOcr } from "@/server/extraction/ine";\n', {
  outfile: r("prueba/js/ine-parser.js"),
  banner: banner("src/server/extraction/ine.ts"),
  // mx-id y la geometría de OCR se comparten con la app de prueba (no se duplican en el bundle)
  plugins: [{ name: "externos", setup(b) {
    b.onResolve({ filter: /\/mx-id$/ }, () => ({ path: "./mxid.js", external: true }));
    b.onResolve({ filter: /\/observation$/ }, () => ({ path: "./ocr-obs.js", external: true }));
  } }],
});
await entry("bancos", 'export { BBVA_ADAPTER } from "@/domain/credit/bbva";\nexport { BANORTE_ADAPTER } from "@/domain/credit/banorte";\nexport { transformValue, checkboxMatches } from "@/domain/credit/analyze";\n', {
  outfile: r("prueba/js/bank-adapters.js"),
  banner: banner("src/domain/credit (adaptadores reales BBVA/Banorte)"),
});
fs.writeFileSync(r("src/__gen_sdk.mjs"), 'export { default } from "@anthropic-ai/sdk";\nexport { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";\n');
try {
  await build({ entryPoints: [r("src/__gen_sdk.mjs")], bundle: true, format: "esm", platform: "browser", target: "es2020", minify: true, legalComments: "eof", outfile: r("prueba/vendor/anthropic-sdk.mjs"), logLevel: "warning" });
} finally { fs.rmSync(r("src/__gen_sdk.mjs")); }
await build({ entryPoints: [r("prueba/servidor/cloudflare/worker.mjs")], bundle: true, format: "esm", target: "es2022", outfile: r("prueba/servidor/cloudflare/worker-un-archivo.js"), banner: { js: "// Archivo único para pegar en el editor de Cloudflare (Workers → Edit code). GENERADO desde worker.mjs + core.mjs." }, logLevel: "warning" });
console.log("Listo: archivos de prueba/ regenerados.");
