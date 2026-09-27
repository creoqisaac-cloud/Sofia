import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres embebido en WASM) y el driver postgres deben cargarse desde
  // node_modules en tiempo de ejecución, no empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
