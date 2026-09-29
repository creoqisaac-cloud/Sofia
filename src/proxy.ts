/**
 * Protección básica opcional del panel interno.
 * Si SOFIA_BASIC_AUTH="usuario:contraseña" está definido, exige HTTP Basic Auth
 * en todas las rutas (UI y API). Pensado para exponer el simulador fuera de
 * localhost sin montar todavía un sistema de usuarios.
 * TODO(siguiente sprint): Supabase Auth con sesión por usuario/workspace.
 */
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function withMode(request: NextRequest, res: NextResponse): NextResponse {
  // ?modo=tablet | ?modo=completo → recuerda el modo en una cookie (para probar el modo tablet en un navegador).
  const modo = request.nextUrl.searchParams.get("modo");
  if (modo === "tablet" || modo === "completo") res.cookies.set("sofia_modo", modo, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export function proxy(request: NextRequest) {
  const expected = process.env.SOFIA_BASIC_AUTH;
  if (!expected) return withMode(request, NextResponse.next());
  // Alexa no puede mandar Basic Auth: /api/alexa se protege con la firma de Amazon (ver src/server/alexa/http.ts).
  if (request.nextUrl.pathname === "/api/alexa") return NextResponse.next();
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      if (safeEqual(atob(encoded), expected)) return withMode(request, NextResponse.next());
    } catch {
      // cae a 401
    }
  }
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sofia", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
