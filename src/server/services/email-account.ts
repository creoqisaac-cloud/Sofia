/**
 * Cuenta de correo de Sofía: Mario asigna un correo (Gmail, Outlook, el de la agencia…) y Sofía
 * envía desde ahí los correos que él confirme (placas, documentos).
 *
 * - La contraseña (de aplicación) se guarda CIFRADA en el servidor; nunca vuelve al navegador,
 *   nunca va a logs y nunca vive en la APK.
 * - Antes de guardar se comprueba la conexión con el servidor SMTP.
 */
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { open, seal } from "../lib/secret-box";
import { ServiceError } from "./errors";

export const EMAIL_PRESETS = {
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true, help: "Usa una “contraseña de aplicación” de Google (Cuenta de Google → Seguridad → Contraseñas de aplicaciones). La contraseña normal no funciona." },
  outlook: { label: "Outlook / Hotmail / Microsoft 365", host: "smtp.office365.com", port: 587, secure: false, help: "Con verificación en dos pasos, usa una contraseña de aplicación. Algunas cuentas de empresa tienen el envío SMTP desactivado: pídeselo a sistemas." },
  yahoo: { label: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, secure: true, help: "Requiere una contraseña de aplicación de Yahoo." },
  custom: { label: "Otro (correo de la agencia)", host: "", port: 587, secure: false, help: "Pide a sistemas de la agencia: servidor SMTP, puerto y si usa SSL." },
} as const;
export type EmailPreset = keyof typeof EMAIL_PRESETS;

interface StoredAccount {
  preset: EmailPreset;
  address: string;
  displayName: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordSealed: string;
  verifiedAt: string;
}

export interface EmailAccountStatus {
  configured: boolean;
  preset?: EmailPreset;
  address?: string;
  displayName?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  verifiedAt?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isLocalHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "::1";

async function settings(app: AppContext) {
  const [ws] = await app.db.select().from(s.workspaces).where(eq(s.workspaces.id, app.workspaceId));
  return (ws?.settings ?? {}) as Record<string, unknown>;
}

async function stored(app: AppContext): Promise<StoredAccount | null> {
  return ((await settings(app)).emailAccount as StoredAccount | undefined) ?? null;
}

export async function getEmailAccountStatus(app: AppContext): Promise<EmailAccountStatus> {
  const a = await stored(app);
  if (!a) return { configured: false };
  const { passwordSealed: _hidden, ...pub } = a;
  void _hidden;
  return { configured: true, ...pub };
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  address: string;
  displayName: string;
}

export function createTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Fuera de localhost, nunca mandar la contraseña sin cifrar.
    requireTLS: !cfg.secure && !isLocalHost(cfg.host),
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Configuración lista para enviar (con la contraseña descifrada), o null si no hay cuenta. */
export async function loadSmtpConfig(app: AppContext): Promise<SmtpConfig | null> {
  const a = await stored(app);
  if (!a) return null;
  return { host: a.host, port: a.port, secure: a.secure, user: a.user, password: open(a.passwordSealed), address: a.address, displayName: a.displayName };
}

function friendlySmtpError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/auth|credential|535|534|Username and Password/i.test(msg)) return "El servidor rechazó el correo o la contraseña. Con Gmail/Outlook usa una contraseña de aplicación.";
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return "No se encontró el servidor de correo. Revisa el nombre del servidor.";
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ECONNRESET/i.test(msg)) return "No se pudo conectar con el servidor de correo (puerto o red).";
  return "No se pudo conectar con el servidor de correo.";
}

export async function saveEmailAccount(
  app: AppContext,
  input: { preset: string; address: string; displayName?: string; host?: string; port?: number | string; secure?: boolean; user?: string; password?: string },
) {
  const preset = (input.preset in EMAIL_PRESETS ? input.preset : "custom") as EmailPreset;
  const p = EMAIL_PRESETS[preset];
  const address = input.address.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) throw new ServiceError("Escribe un correo válido.");
  const host = (preset === "custom" ? input.host ?? "" : p.host).trim();
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new ServiceError("Falta el servidor SMTP.");
  const port = Number(preset === "custom" ? input.port ?? p.port : p.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ServiceError("Puerto inválido.");
  const secure = preset === "custom" ? Boolean(input.secure) : p.secure;
  const user = (input.user ?? "").trim() || address;
  const prev = await stored(app);
  const password = input.password?.trim() ? input.password.trim() : prev && prev.address === address ? open(prev.passwordSealed) : "";
  if (!password) throw new ServiceError("Escribe la contraseña de aplicación del correo.");
  const displayName = (input.displayName ?? "").trim().slice(0, 80) || "Mario Abarca";

  const cfg: SmtpConfig = { host, port, secure, user, password, address, displayName };
  try {
    await createTransport(cfg).verify();
  } catch (e) {
    throw new ServiceError(friendlySmtpError(e), 400);
  }
  const account: StoredAccount = { preset, address, displayName, host, port, secure, user, passwordSealed: seal(password), verifiedAt: app.clock.now().toISOString() };
  const current = await settings(app);
  await app.db.update(s.workspaces).set({ settings: { ...current, emailAccount: account } }).where(eq(s.workspaces.id, app.workspaceId));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "email_account_set", entityType: "workspace", entityId: app.workspaceId, data: { preset, host } });
  return getEmailAccountStatus(app);
}

export async function removeEmailAccount(app: AppContext) {
  const current = await settings(app);
  delete current.emailAccount;
  await app.db.update(s.workspaces).set({ settings: current }).where(eq(s.workspaces.id, app.workspaceId));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "email_account_removed", entityType: "workspace", entityId: app.workspaceId, data: {} });
}

/** Correo de prueba a la propia cuenta (o a otra dirección). */
export async function sendTestEmail(app: AppContext, to?: string) {
  const cfg = await loadSmtpConfig(app);
  if (!cfg) throw new ServiceError("Primero asigna una cuenta de correo.", 409);
  const dest = (to ?? "").trim() || cfg.address;
  if (!EMAIL_RE.test(dest)) throw new ServiceError("Correo de destino inválido.");
  try {
    await createTransport(cfg).sendMail({
      from: { name: cfg.displayName, address: cfg.address },
      to: dest,
      subject: "Prueba de Sofía",
      text: "Este es un correo de prueba enviado por Sofía. Si lo recibiste, la cuenta quedó lista para enviar los correos que confirmes.",
    });
  } catch (e) {
    throw new ServiceError(friendlySmtpError(e), 400);
  }
  return dest;
}

export { friendlySmtpError };
