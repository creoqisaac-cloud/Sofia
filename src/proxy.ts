/**
 * Autenticación de Sofía:
 * - Web Safari/iPhone: login propio con cookie HttpOnly firmada.
 * - APK Android: compatibilidad con HTTP Basic Auth (reto nativo WebView).
 * - /api/health y /api/alexa conservan sus controles específicos.
 */
import { NextResponse, type NextRequest } from "next/server";
import { safeNext, SESSION_COOKIE, validBasicAuthorization, validSession } from "@/server/auth/web-session";

function withMode(request: NextRequest, res: NextResponse): NextResponse {
  const modo = request.nextUrl.searchParams.get("modo");
  if (modo === "tablet" || modo === "completo") {
    res.cookies.set("sofia_modo", modo, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/api/alexa" || path === "/api/health" || path === "/acceso" || path === "/salir") {
    return NextResponse.next();
  }

  const expected = process.env.SOFIA_BASIC_AUTH;
  if (!expected) return withMode(request, NextResponse.next());

  const header = request.headers.get("authorization");
  if (
    validSession(request.cookies.get(SESSION_COOKIE)?.value, expected, process.env.SOFIA_SECRET_KEY) ||
    validBasicAuthorization(header, expected)
  ) return withMode(request, NextResponse.next());

  // La tablet Android sigue usando su diálogo de conexión y el reto HTTP Basic.
  // No redirigirla a la pantalla de Safari.
  if ((request.headers.get("user-agent") ?? "").includes("SofiaTablet")) {
    return new NextResponse("Autenticación requerida", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Sofia", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }

  // Las API reciben JSON para que el cliente no interprete HTML como una respuesta válida.
  if (path.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
    return NextResponse.json({ error: "Sesión vencida. Vuelve a iniciar sesión." }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const destination = new URL("/acceso", request.url);
  const target = safeNext(request.nextUrl.pathname + request.nextUrl.search);
  destination.searchParams.set("next", target);
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
