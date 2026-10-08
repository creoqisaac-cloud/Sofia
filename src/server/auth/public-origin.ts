/**
 * El host interno de Next/Render puede ser localhost:10000 aunque el usuario
 * navegue por HTTPS en sofia-app-6qo6.onrender.com.
 *
 * Nunca usar nextUrl.host como única referencia de seguridad para Origin:
 * se compara contra la URL pública configurada por el administrador.
 */
import type { NextRequest } from "next/server";

export function publicOrigin(req: NextRequest): string {
  const configured = process.env.SOFIA_PUBLIC_ORIGIN?.trim();
  if (configured) {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("SOFIA_PUBLIC_ORIGIN debe ser HTTPS");
    }
    return parsed.origin;
  }
  return req.nextUrl.origin;
}

export function sameSiteForm(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === publicOrigin(req);
    } catch {
      return false;
    }
  }
  // Navegadores antiguos pueden omitir Origin, pero no deben declarar cross-site.
  return site === "same-origin" || site === "none" || site === null;
}

export function appRedirect(req: NextRequest, pathname: string): URL {
  return new URL(pathname, publicOrigin(req));
}
