import { describe, expect, it } from "vitest";
import {
  newSession, validSession, validBasicAuthorization, validCredentials, safeNext, SESSION_SECONDS,
} from "../src/server/auth/web-session";

const BASIC = "asesor:contraseña-larga";
const SECRET = "llave-servidor-local-con-32-caracteres";
const t = Date.UTC(2026, 9, 8, 18, 0, 0);

describe("Safari: sesión web de Sofía", () => {
  it("crea sesión firmada y la valida", () => {
    const token = newSession(BASIC, SECRET, t);
    expect(validSession(token, BASIC, SECRET, t + 1000)).toBe(true);
    expect(validSession(token, BASIC, SECRET, t + SESSION_SECONDS * 1000)).toBe(false);
  });
  it("invalida cambios de contraseña, secreto o firma", () => {
    const token = newSession(BASIC, SECRET, t);
    expect(validSession(token, "asesor:contraseña-nueva", SECRET, t)).toBe(false);
    expect(validSession(token, BASIC, "otro-secreto", t)).toBe(false);
    expect(validSession(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"), BASIC, SECRET, t)).toBe(false);
    expect(validSession("v1.x.fake", BASIC, SECRET, t)).toBe(false);
    expect(validSession(undefined, BASIC, SECRET, t)).toBe(false);
    expect(validSession(token, BASIC, undefined, t)).toBe(false);
  });
  it("mantiene HTTP Basic para la APK", () => {
    const basic = "Basic " + Buffer.from(BASIC).toString("base64");
    expect(validBasicAuthorization(basic, BASIC)).toBe(true);
    expect(validBasicAuthorization("basic " + Buffer.from(BASIC).toString("base64"), BASIC)).toBe(true);
    expect(validBasicAuthorization("Basic ???", BASIC)).toBe(false);
    expect(validBasicAuthorization(null, BASIC)).toBe(false);
    expect(validCredentials("asesor", "contraseña-larga", BASIC)).toBe(true);
    expect(validCredentials("asesor", "incorrecta", BASIC)).toBe(false);
  });
  it("no admite redirecciones a otros dominios ni rutas API", () => {
    expect(safeNext("/iphone?modo=tablet")).toBe("/iphone?modo=tablet");
    for (const v of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/customers", "/acceso", "\n/iphone", ""]) {
      expect(safeNext(v)).toBe("/");
    }
  });
});
