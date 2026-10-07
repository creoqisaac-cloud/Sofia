/**
 * Correo de Sofía: cuenta asignada (SMTP real contra un servidor de prueba local), contraseña
 * cifrada, envío con adjuntos SOLO con confirmación, y trámite de placas que avanza al enviar.
 * Datos ficticios.
 */
import { eq } from "drizzle-orm";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { draftPlatesEmail, emailConfigured, sendEmail, updateDraft } from "@/server/services/email";
import { getEmailAccountStatus, removeEmailAccount, saveEmailAccount, sendTestEmail } from "@/server/services/email-account";
import { uploadDocument } from "@/server/services/inbox";
import { makeApp, newProspect, type TestApp } from "./helpers";

process.env.SOFIA_SECRET_KEY ??= "llave-de-prueba-sintetica";

const USER = "sofia.prueba@example.com";
const PASS = "app-pass-sintetica";
const received: string[] = [];
let server: SMTPServer;
let port = 0;

beforeAll(async () => {
  server = new SMTPServer({
    secure: false,
    disabledCommands: ["STARTTLS"],
    allowInsecureAuth: true,
    authMethods: ["PLAIN", "LOGIN"],
    onAuth(auth, _session, cb) {
      if (auth.username === USER && auth.password === PASS) cb(null, { user: USER });
      else cb(new Error("535 Invalid credentials"));
    },
    onData(stream, _session, cb) {
      let raw = "";
      stream.on("data", (c: Buffer) => (raw += c.toString("utf8")));
      stream.on("end", () => {
        received.push(raw);
        cb();
      });
    },
    logger: false,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.server.address() as { port: number }).port;
});
afterAll(async () => new Promise<void>((resolve) => server.close(() => resolve())));

const account = (password = PASS) => ({ preset: "custom", address: USER, displayName: "Mario Abarca", host: "127.0.0.1", port, secure: false, password });
// JPEG mínimo (firma de bytes)
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

describe("correo de Sofía (SMTP)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("contraseña incorrecta: no se guarda nada y el mensaje es claro", async () => {
    await expect(saveEmailAccount(app, account("mala"))).rejects.toThrow(/contraseña de aplicación/);
    expect((await getEmailAccountStatus(app)).configured).toBe(false);
    expect(await emailConfigured(app)).toBe(false);
  });

  it("asignar cuenta: se verifica la conexión y la contraseña queda cifrada (nunca se devuelve)", async () => {
    const st = await saveEmailAccount(app, account());
    expect(st).toMatchObject({ configured: true, address: USER, host: "127.0.0.1", port });
    expect(JSON.stringify(st)).not.toContain(PASS);
    const [ws] = await app.db.select().from(s.workspaces).where(eq(s.workspaces.id, app.workspaceId));
    const raw = JSON.stringify(ws!.settings);
    expect(raw).not.toContain(PASS);
    expect(raw).toMatch(/"passwordSealed":"v1:/);
    expect(await emailConfigured(app)).toBe(true);
    // Cambiar el nombre sin reescribir la contraseña conserva la actual
    await saveEmailAccount(app, { ...account(""), displayName: "Mario A." });
    expect((await getEmailAccountStatus(app)).displayName).toBe("Mario A.");
  });

  it("correo de prueba llega al servidor", async () => {
    const before = received.length;
    expect(await sendTestEmail(app)).toBe(USER);
    expect(received.length).toBe(before + 1);
    expect(received.at(-1)).toMatch(/Subject: .*Prueba/);
  });

  it("placas: sin confirmación no se envía; con confirmación sale con adjunto, el trámite avanza y queda recordatorio", async () => {
    const p = await newProspect(app, "Cliente Placas Sintético");
    await uploadDocument(app, { customerId: p.customer.id, bytes: JPEG, fileName: "ine.jpg", docType: "ine" });
    const draft = await draftPlatesEmail(app, p.customer.id);
    expect(draft.attachments.length).toBe(1);
    await updateDraft(app, draft.id, { toAddress: "gestor.placas@example.com" });

    await expect(sendEmail(app, draft.id, { confirmed: false })).rejects.toThrow(/confirmación/);
    const before = received.length;
    await sendEmail(app, draft.id, { confirmed: true });
    expect(received.length).toBe(before + 1);
    const mail = received.at(-1)!;
    expect(mail).toMatch(/To: gestor\.placas@example\.com/);
    expect(mail).toMatch(/filename="?INE\.jpg"?/);
    expect(mail).toMatch(/Content-Type: image\/jpeg/);

    const [sent] = await app.db.select().from(s.emailMessages).where(eq(s.emailMessages.id, draft.id));
    expect(sent).toMatchObject({ status: "sent", provider: "smtp" });
    const [pc] = await app.db.select().from(s.plateCases).where(eq(s.plateCases.id, draft.plateCaseId!));
    expect(pc!.status).toBe("submitted");
    const fu = await app.db.select().from(s.followups).where(eq(s.followups.customerId, p.customer.id));
    expect(fu.some((f) => f.reason === "Revisar respuesta del trámite de placas" && f.status === "pending")).toBe(true);
    // Ya no es borrador: no se puede reenviar por accidente
    await expect(sendEmail(app, draft.id, { confirmed: true })).rejects.toThrow(/ya no es un borrador/);
  });

  it("quitar la cuenta: vuelve al modo sin envío", async () => {
    await removeEmailAccount(app);
    expect(await emailConfigured(app)).toBe(false);
  });
});
