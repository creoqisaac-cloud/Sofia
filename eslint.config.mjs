import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".data/**", "drizzle/**", "prueba/vendor/**", "prueba/js/mxid.js", "prueba/js/ine-parser.js", "prueba/js/bank-adapters.js", "prueba/servidor/cloudflare/worker-un-archivo.js"]),
]);

export default eslintConfig;
