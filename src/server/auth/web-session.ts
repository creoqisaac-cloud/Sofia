/**
 * Sesión web firmada para Safari/iPhone.
 * No contiene contraseñas, datos personales ni credenciales en el navegador.
 * La firma depende de SOFIA_SECRET_KEY y de SOFIA_BASIC_AUTH: rotar cualquiera
 * invalida las sesiones existentes.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "__Host-sofia_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

const asBytes = (value: string) => Buffer.from(value, "utf8");

function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(asBytes(a)).digest();
  const digestB = createHash("sha256").update(asBytes(b)).digest();
  return timingSafeEqual(digestA, digestB);
}

export function validCredentials(username: string, password: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return safeEqual(`${username}:${password}`, expected);
}

export function validBasicAuthorization(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header || !/^Basic\s+/i.test(header)) return false;
  const encoded = header.replace(/^Basic\s+/i, "").trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 2048) return false;
  try {
    return safeEqual(Buffer.from(encoded, "base64").toString("utf8"), expected);
  } catch {
    return false;
  }
}

function signature(exp: number, expected: string, secret: string): string {
  return createHmac("sha256", asBytes(secret))
    .update(`sofia-web-v1:${exp}:${expected}`)
    .digest("base64url");
}

export function newSession(expected: string, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  return `v1.${exp}.${signature(exp, expected, secret)}`;
}

export function validSession(cookie: string | undefined, expected: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!cookie || !expected || !secret || cookie.length > 200) return false;
  const match = /^v1\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/.exec(cookie);
  if (!match) return false;
  const exp = Number(match[1]);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(exp) || exp <= current || exp > current + SESSION_SECONDS) return false;
  const provided = Buffer.from(match[2]!, "utf8");
  const correct = Buffer.from(signature(exp, expected, secret), "utf8");
  return provided.length === correct.length && timingSafeEqual(provided, correct);
}

/** Solo rutas relativas del mismo servidor, nunca enlaces externos o javascript:. */
export function safeNext(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\\\r\n\x00-\x1f]/.test(value)) return "/";
  if (value.startsWith("/acceso") || value.startsWith("/api/")) return "/";
  return value.slice(0, 1024) || "/";
}
