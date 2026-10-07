/**
 * Cifrado de secretos guardados por la app (p. ej. la contraseña de aplicación del correo de Sofía).
 * AES-256-GCM. La llave NUNCA está en git ni en la APK:
 *  - SOFIA_SECRET_KEY (variable del servidor), o
 *  - un archivo aleatorio creado en el almacenamiento privado del servidor (permisos 600).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";

let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;
  const env = process.env.SOFIA_SECRET_KEY?.trim();
  if (env) {
    cached = crypto.createHash("sha256").update(env).digest();
    return cached;
  }
  const file = path.join(loadConfig().SOFIA_PRIVATE_STORAGE_DIR, ".sofia-secret-key");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
  }
  cached = crypto.createHash("sha256").update(fs.readFileSync(file, "utf8").trim()).digest();
  return cached;
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function open(sealed: string): string {
  if (!sealed.startsWith("v1:")) throw new Error("formato de secreto desconocido");
  const raw = Buffer.from(sealed.slice(3), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
