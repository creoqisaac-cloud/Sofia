import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres embebido en WASM) y el driver postgres deben cargarse desde
  // node_modules en tiempo de ejecución, no empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Fotos, videos y flyers de la biblioteca de modelos pasan por el proxy de autenticación.
  experimental: { proxyClientMaxBodySize: "60mb" },
};

export default nextConfig;
