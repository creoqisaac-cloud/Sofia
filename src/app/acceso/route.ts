import { NextResponse, type NextRequest } from "next/server";
import { newSession, safeNext, SESSION_COOKIE, SESSION_SECONDS, validCredentials, validSession } from "@/server/auth/web-session";
import { appRedirect, sameSiteForm } from "@/server/auth/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Límite complementario de intentos de login por instancia. No sustituye a un
// limitador distribuido: para producción multi-instancia usar Redis/WAF.
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;

function clientKey(req: NextRequest): string {
  // Render envía la dirección del visitante en X-Forwarded-For.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unidentified").slice(0, 120);
}

function countFailure(key: string) {
  const now = Date.now();
  const current = failures.get(key);
  if (failures.size > 5000) failures.clear();
  if (!current || current.until <= now) failures.set(key, { count: 1, until: now + WINDOW_MS });
  else failures.set(key, { ...current, count: current.count + 1 });
}

function isLimited(key: string) {
  const r = failures.get(key);
  if (!r || r.until <= Date.now()) return false;
  return r.count >= MAX_FAILURES;
}

function escaped(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function screen(next: string, error = false, limited = false): Response {
  const notice = limited
    ? "Demasiados intentos. Vuelve a intentarlo en unos minutos."
    : error ? "Usuario o contraseña incorrectos. Revisa ambos datos." : "";
  const html = `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a0a0b">
  <title>Entrar a Sofía</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100dvh;background:#0a0a0b;color:#f5f2eb;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom))}
    main{width:100%;max-width:420px}h1{font-size:36px;letter-spacing:.12em;color:#e7d3ae;margin:0}h2{font-size:24px;font-weight:600;margin:28px 0 8px}p{color:#b0aaa2;line-height:1.5;margin:0 0 26px}
    label{display:block;font-size:14px;color:#cac4ba;margin:16px 0 7px}input{display:block;width:100%;min-height:54px;font-size:17px;color:#fff;background:#242428;border:1px solid #3f3e42;border-radius:13px;padding:12px 14px}
    button{margin-top:26px;width:100%;min-height:56px;background:#e7d3ae;border:0;border-radius:14px;font-weight:700;color:#181818;font-size:17px}button:active{opacity:.8}
    .msg{padding:14px;border-radius:12px;background:#442522;color:#ffd8c9;margin:12px 0 20px;font-size:14px}.help{font-size:13px;margin:18px 0 0}
  </style>
</head><body><main>
  <h1>SOFÍA</h1><h2>Iniciar sesión</h2>
  <p>Asistente comercial · Acceso desde iPhone, iPad o computadora.</p>
  ${notice ? `<div class="msg" role="alert">${escaped(notice)}</div>` : ""}
  <form method="post" action="/acceso" autocomplete="on">
    <input type="hidden" name="next" value="${escaped(next)}">
    <label for="user">Usuario</label>
    <input id="user" name="user" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="100">
    <label for="password">Contraseña</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256">
    <button type="submit">Entrar a Sofía</button>
  </form>
  <p class="help">La sesión permanece abierta en este navegador durante siete días. No necesitas escribir las credenciales en cada pantalla.</p>
</main></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

export async function GET(req: NextRequest) {
  const expected = process.env.SOFIA_BASIC_AUTH;
  const secret = process.env.SOFIA_SECRET_KEY;
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (validSession(req.cookies.get(SESSION_COOKIE)?.value, expected, secret)) {
    return NextResponse.redirect(appRedirect(req, next));
  }
  return screen(next);
}

export async function POST(req: NextRequest) {
  // El Host de Render puede ser interno. Comparar contra la URL HTTPS pública.
  if (!sameSiteForm(req)) return new Response("Solicitud no autorizada", { status: 403 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 8192) return new Response("Solicitud demasiado grande", { status: 413 });
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("application/x-www-form-urlencoded") && !type.startsWith("multipart/form-data")) {
    return new Response("Formulario inválido", { status: 415 });
  }
  let form: FormData;
  try { form = await req.formData(); } catch { return screen("/", true); }
  const next = safeNext(typeof form.get("next") === "string" ? String(form.get("next")) : "/");
  const key = clientKey(req);
  if (isLimited(key)) return screen(next, false, true);

  const user = typeof form.get("user") === "string" ? String(form.get("user")) : "";
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  const expected = process.env.SOFIA_BASIC_AUTH;
  const secret = process.env.SOFIA_SECRET_KEY;
  if (!secret || user.length > 100 || password.length > 256 || !validCredentials(user, password, expected)) {
    countFailure(key);
    return screen(next, true);
  }
  failures.delete(key);
  const response = NextResponse.redirect(appRedirect(req, next), { status: 303 });
  response.cookies.set(SESSION_COOKIE, newSession(expected!, secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
