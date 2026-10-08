import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Desafío CSRF de inicio de sesión: permite formularios Safari sin confiar en Origin
 * y no expone ni almacena contraseña o sesión en el HTML.
 */
export const LOGIN_CSRF_COOKIE = "__Host-sofia_login_csrf";
export const LOGIN_CSRF_MAX_AGE = 15 * 60;

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update("sofia-login-csrf-v1:" + payload).digest("base64url");
}

export function createLoginChallenge(secret: string, now = Date.now()): string {
  const payload = String(Math.floor(now / 1000)) + "." + randomBytes(18).toString("base64url");
  return payload + "." + signature(payload, secret);
}

export function verifyLoginChallenge(
  submitted: string | null,
  cookie: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!submitted || !cookie || !secret || submitted.length > 140 || cookie.length > 140) return false;
  const input = Buffer.from(submitted, "utf8");
  const saved = Buffer.from(cookie, "utf8");
  if (input.length !== saved.length || !timingSafeEqual(input, saved)) return false;
  const match = /^([0-9]{10})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/.exec(submitted);
  if (!match) return false;
  const issued = Number(match[1]);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(issued) || issued > current + 60 || current - issued > LOGIN_CSRF_MAX_AGE) return false;
  const payload = match[1] + "." + match[2];
  const expected = Buffer.from(signature(payload, secret), "utf8");
  const provided = Buffer.from(match[3]!, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
