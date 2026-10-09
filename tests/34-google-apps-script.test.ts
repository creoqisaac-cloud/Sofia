/**
 * Servidor gratis en Google (prueba/servidor/google/sofia-google.gs). No hay emulador de Apps Script:
 * el .gs se carga en un contexto vm de Node con dobles MÍNIMOS de los servicios de Google (solo los métodos
 * documentados que el script usa; cualquier otro truena). Atrapa errores de sintaxis y de lógica:
 * protocolo de datos, clave, envío con adjuntos, revisión y clasificación, seguimiento automático una sola
 * vez por periodo, calendario y OCR. La prueba definitiva es en una cuenta real (ver LEEME.md).
 * Todos los datos son sintéticos (personas y correos inexistentes).
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../prueba/servidor/google");
const SRC = fs.readFileSync(path.join(DIR, "sofia-google.gs"), "utf8");
const ME = "asesor.prueba@example.com";
const GESTORIA = "gestoria.prueba@example.com";
const TOKEN = "clave-larga-de-prueba-123";
const DIA = 24 * 3600 * 1000;

// ───────── Dobles de los servicios de Google ─────────

const signed = (b: number) => (b > 127 ? b - 256 : b);
const toBuf = (data: number[] | string | Buffer) => (typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(Array.from(data, (b) => b & 0xff)));

type GBlob = ReturnType<typeof newBlob>;
function newBlob(data: number[] | string | Buffer, type = "application/octet-stream", name = "") {
  const bytes = toBuf(data);
  const blob = {
    getBytes: () => Array.from(bytes, signed),
    getDataAsString: () => bytes.toString("utf8"),
    getContentType: () => type,
    getName: () => name,
    setName: (n: string) => { name = n; return blob; },
    buf: bytes,
  };
  return blob;
}

class FakeFile {
  trashed = false;
  updated = new Date();
  owner = ME; // DriveApp también lista lo que otros comparten contigo
  constructor(public id: string, public name: string, public mime: string, public bytes: Buffer) {}
  getId() { return this.id; }
  getOwner() { return { getEmail: () => this.owner }; }
  getName() { return this.name; }
  setName(n: string) { this.name = n; return this; }
  getBlob() { return newBlob(this.bytes, this.mime, this.name); }
  setContent(s: string) {
    if (s.length > 10 * 1024 * 1024) throw new Error("setContent: más de 10 MB");
    this.bytes = Buffer.from(s, "utf8");
    this.updated = new Date(this.updated.getTime() + 1);
    return this;
  }
  isTrashed() { return this.trashed; }
  setTrashed(t: boolean) { this.trashed = t; return this; }
  getLastUpdated() { return this.updated; }
}

class FakeThread {
  messages: FakeMessage[] = [];
  labels: string[] = [];
  constructor(public id: string) {}
  getId() { return this.id; }
  getMessages() { return [...this.messages]; }
  addLabel(l: { getName(): string }) { this.labels.push(l.getName()); return this; }
}

/** Lo que el doble de Gmail anota de cada envío. */
type Mail = { sent: Sent[]; quota: number };

class FakeMessage {
  draft = false;
  constructor(public mail: Mail, public thread: FakeThread, public from: string, public to: string, public subject: string,
    public body: string, public date: Date, public attachments: GBlob[] = [], public cc = "") {}
  getFrom() { return this.from; }
  getTo() { return this.to; }
  getCc() { return this.cc; }
  getSubject() { return this.subject; }
  getPlainBody() { return this.body; }
  getDate() { return this.date; }
  getThread() { return this.thread; }
  isDraft() { return this.draft; }
  isInTrash() { return false; }
  getAttachments(opts?: { includeInlineImages?: boolean }) {
    expect(opts).toEqual({ includeInlineImages: false });
    return this.attachments;
  }
  replyAll(body: string, opts: { attachments?: GBlob[]; cc?: string } = {}) {
    const to = [this.from, this.to].filter(Boolean).join(", ");
    const m = new FakeMessage(this.mail, this.thread, `Asesor Prueba <${ME}>`, to, `Re: ${this.subject.replace(/^Re: /, "")}`, body, new Date(), opts.attachments ?? [], opts.cc ?? this.cc);
    this.thread.messages.push(m);
    this.mail.sent.push({ kind: "replyAll", to, subject: m.subject, body, opts, threadId: this.thread.id });
    this.mail.quota -= 1;
    return this;
  }
}

class FakeEvent {
  reminders: number[] = [];
  constructor(public cal: FakeCalendar, public id: string, public title: string, public start: Date, public end: Date, public description: string) {}
  getId() { return this.id; }
  setTitle(t: string) { this.title = t; return this; }
  setDescription(d: string) { this.description = d; return this; }
  setTime(s: Date, e: Date) { this.start = s; this.end = e; return this; }
  removeAllReminders() { this.reminders = []; return this; }
  addPopupReminder(m: number) {
    // La documentación de CalendarEvent pide entre 5 minutos y 4 semanas.
    if (!(m >= 5 && m <= 40320)) throw new Error(`Invalid argument: minutesBefore ${m}`);
    this.reminders.push(m);
    return this;
  }
  deleteEvent() { this.cal.events.delete(this.id); }
}

class FakeCalendar {
  events = new Map<string, FakeEvent>();
  mine = true; // un calendario compartido por otra persona también sale en getCalendarsByName
  constructor(public id: string, public name: string, public opts: unknown) {}
  getId() { return this.id; }
  isOwnedByMe() { return this.mine; }
  getName() { return this.name; }
  createEvent(title: string, start: Date, end: Date, opts: { description?: string }) {
    const ev = new FakeEvent(this, `ev${this.events.size + 1}-${crypto.randomUUID()}@google.com`, title, start, end, opts?.description ?? "");
    this.events.set(ev.id, ev);
    return ev;
  }
  getEventById(id: string) { return this.events.get(id) ?? null; }
}

type Sent = { kind: string; to: string; subject: string; body: string; opts: { attachments?: GBlob[]; cc?: string; name?: string }; threadId: string };
type World = ReturnType<typeof makeWorld>;

function makeWorld({ drive = true }: { drive?: boolean } = {}) {
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const props = new Map<string, string>([["TOKEN", TOKEN]]);
  const files = new Map<string, FakeFile>();
  const docs = new Map<string, string>();
  const threads = new Map<string, FakeThread>();
  const labels = new Map<string, { getName(): string }>();
  const calendars = new Map<string, FakeCalendar>();
  const triggers: { fn: string; everyHours: number }[] = [];
  const driveCalls: { op: string; resource?: unknown; mime?: string; opts?: unknown; id?: string }[] = [];
  const lock = { held: 0, taken: 0 };

  const world = {
    quota: 100,
    sent: [] as Sent[],
    props, files, docs, threads, labels, calendars, triggers, driveCalls, lock,
    /** La gestoría contesta en el hilo. */
    reply(threadId: string, body: string, { from = `Gestoría Prueba <${GESTORIA}>`, attachments = [] as GBlob[], date = new Date() } = {}) {
      const t = threads.get(threadId)!;
      const m = new FakeMessage(world, t, from, ME, `Re: ${t.messages[0]!.subject}`, body, date, attachments);
      t.messages.push(m);
      return m;
    },
    /** Hace "viejos" todos los mensajes de un hilo (en lugar de esperar días). */
    age(threadId: string, days: number) {
      for (const m of threads.get(threadId)!.messages) m.date = new Date(m.date.getTime() - days * DIA);
    },
  };

  const PropertiesService = {
    getScriptProperties: () => {
      const p = {
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => {
          const s = String(v);
          if (Buffer.byteLength(s) > 9 * 1024) throw new Error(`Argument too large: ${k}`); // tope real de una propiedad
          // Como el real: si rebasa los 500 KB en total, truena SIN guardar.
          const otras = [...props].filter(([a]) => a !== k).reduce((n, [a, b]) => n + Buffer.byteLength(a) + Buffer.byteLength(b), 0);
          if (otras + Buffer.byteLength(k) + Buffer.byteLength(s) > 500 * 1024) throw new Error("Propiedades: más de 500 KB");
          props.set(k, s);
          return p;
        },
        deleteProperty: (k: string) => { props.delete(k); return p; },
        getProperties: () => Object.fromEntries(props),
      };
      return p;
    },
  };

  const LockService = {
    getScriptLock: () => ({
      tryLock: () => { lock.held++; lock.taken++; return true; },
      releaseLock: () => { lock.held = Math.max(0, lock.held - 1); },
    }),
  };

  const Utilities = {
    base64Decode: (s: string) => {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("Could not decode string.");
      return Array.from(Buffer.from(s, "base64"), signed);
    },
    newBlob,
    computeDigest: (alg: string, value: string, charset: string) => {
      expect([alg, charset]).toEqual(["SHA_256", "UTF_8"]);
      return Array.from(crypto.createHash("sha256").update(value, "utf8").digest(), signed);
    },
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
  };

  const ContentService = {
    MimeType: { JSON: "JSON" },
    createTextOutput: (s: string) => {
      const o = { mime: "", setMimeType: (m: string) => { o.mime = m; return o; }, getContent: () => s };
      return o;
    },
  };

  const Session = { getEffectiveUser: () => ({ getEmail: () => ME }), getScriptTimeZone: () => "America/Monterrey" };

  const DriveApp = {
    getFilesByName: (name: string) => {
      const list = [...files.values()].filter((f) => f.name === name); // como el real: incluye la papelera
      let i = 0;
      return { hasNext: () => i < list.length, next: () => list[i++]! };
    },
    createFile: (blob: GBlob) => {
      const f = new FakeFile(id("file"), blob.getName(), blob.getContentType(), blob.buf);
      files.set(f.id, f);
      return f;
    },
    getFileById: (fid: string) => {
      const f = files.get(fid);
      if (!f) throw new Error("No item with the given ID could be found");
      return f;
    },
  };

  const Drive = {
    Files: {
      create: (resource: { name: string; mimeType: string }, blob: GBlob, opts: unknown) => {
        driveCalls.push({ op: "create", resource, mime: blob.getContentType(), opts });
        const f = new FakeFile(id("doc"), resource.name, resource.mimeType, Buffer.alloc(0));
        files.set(f.id, f);
        // OCR simulado: la "foto" sintética trae su texto en los bytes. Google pone la imagen antes del texto.
        docs.set(f.id, `￼\n${blob.getDataAsString()}  \n\n\n\n`);
        return { id: f.id, name: resource.name, mimeType: resource.mimeType };
      },
      update: (resource: unknown, fid: string, blob: GBlob) => {
        driveCalls.push({ op: "update", resource, id: fid });
        const f = files.get(fid)!;
        f.bytes = blob.buf;
        f.updated = new Date(f.updated.getTime() + 1);
        return { id: fid };
      },
      remove: (fid: string) => {
        driveCalls.push({ op: "remove", id: fid });
        files.delete(fid);
        docs.delete(fid);
      },
    },
  };

  const DocumentApp = {
    openById: (did: string) => {
      const t = docs.get(did);
      if (t === undefined) throw new Error("Document is missing");
      return { getBody: () => ({ getText: () => t }) };
    },
  };

  const GmailApp = {
    createDraft: (to: string, subject: string, body: string, opts: Sent["opts"]) => ({
      send: () => {
        const t = new FakeThread(id("thread"));
        threads.set(t.id, t);
        const m = new FakeMessage(world, t, `Asesor Prueba <${ME}>`, to, subject, body, new Date(), opts.attachments ?? [], opts.cc ?? "");
        t.messages.push(m);
        world.sent.push({ kind: "nuevo", to, subject, body, opts, threadId: t.id });
        world.quota -= to.split(",").length + (opts.cc ? opts.cc.split(",").length : 0);
        return m;
      },
    }),
    getThreadById: (tid: string) => threads.get(tid) ?? null,
    getUserLabelByName: (n: string) => labels.get(n) ?? null,
    createLabel: (n: string) => {
      if (labels.has(n)) throw new Error("Label name exists or conflicts");
      const l = { getName: () => n };
      labels.set(n, l);
      return l;
    },
    getAliases: () => [] as string[],
  };

  const MailApp = { getRemainingDailyQuota: () => world.quota };

  const CalendarApp = {
    getCalendarById: (cid: string) => calendars.get(cid) ?? null,
    getCalendarsByName: (n: string) => [...calendars.values()].filter((c) => c.name === n),
    createCalendar: (n: string, opts: unknown) => {
      const c = new FakeCalendar(id("cal"), n, opts);
      calendars.set(c.id, c);
      return c;
    },
  };

  const ScriptApp = {
    getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn })),
    newTrigger: (fn: string) => ({
      timeBased: () => ({ everyHours: (n: number) => ({ create: () => { triggers.push({ fn, everyHours: n }); return {}; } }) }),
    }),
  };

  const sandbox: Record<string, unknown> = {
    PropertiesService, LockService, Utilities, ContentService, Session, DriveApp, DocumentApp, GmailApp, MailApp, CalendarApp, ScriptApp,
    console: { log: () => {} },
  };
  if (drive) sandbox.Drive = Drive;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SRC, ctx, { filename: "sofia-google.gs" });
  return Object.assign(world, { gs: ctx as unknown as Gs });
}

type Out = { getContent(): string; mime: string };
type Estado = { clave: string; texto: string; coincidencia: string } | null;
type Gs = {
  doGet(e: unknown): Out;
  doPost(e: unknown): Out;
  agenteCorreo(): void;
  instalar(): void;
  clasificar_(t: string): Estado;
  sinCitas_(t: string): string;
};
type Res = Record<string, unknown> & { ok: boolean; error?: string };

const get = (w: World, parameter: Record<string, string>) => {
  const out = w.gs.doGet({ parameter });
  expect(out.mime).toBe("JSON");
  return JSON.parse(out.getContent()) as Res;
};
const postRaw = (w: World, contents: string) => {
  const out = w.gs.doPost({ postData: { contents, length: contents.length, type: "text/plain" } });
  expect(out.mime).toBe("JSON");
  const res = JSON.parse(out.getContent()) as Res;
  expect(w.lock.held).toBe(0); // el candado siempre se suelta
  expect(out.getContent()).not.toContain(TOKEN); // la clave nunca sale
  return res;
};
const post = (w: World, body: Record<string, unknown>) => postRaw(w, JSON.stringify({ token: TOKEN, ...body }));
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const backup = (n: number) => ({ app: "sofia-prueba", version: 1, exportedAt: "2026-10-01T00:00:00.000Z", state: { customers: [{ id: `c${n}`, name: "Cliente Sintético" }] }, files: {} });

// ───────── Pruebas ─────────

describe("manifiesto y APIs usadas", () => {
  it("appsscript.json: zona horaria, Drive v3, alcances mínimos y aplicación web", () => {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, "appsscript.json"), "utf8"));
    expect(m.timeZone).toBe("America/Monterrey");
    expect(m.runtimeVersion).toBe("V8");
    expect(m.dependencies.enabledAdvancedServices).toEqual([{ userSymbol: "Drive", serviceId: "drive", version: "v3" }]);
    expect(m.webapp).toEqual({ executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" });
    expect([...m.oauthScopes].sort()).toEqual([
      "https://mail.google.com/", // GmailApp (enviar, etiquetar, leer hilos)
      "https://www.googleapis.com/auth/calendar", // CalendarApp
      "https://www.googleapis.com/auth/documents", // DocumentApp (leer el Doc del OCR)
      "https://www.googleapis.com/auth/drive", // DriveApp + Drive avanzado
      "https://www.googleapis.com/auth/script.scriptapp", // disparador del agente
      "https://www.googleapis.com/auth/script.send_mail", // MailApp.getRemainingDailyQuota
      "https://www.googleapis.com/auth/userinfo.email", // Session.getEffectiveUser().getEmail()
    ]);
  });

  it("solo llama APIs de Apps Script revisadas contra la documentación", () => {
    // Si agregas una llamada nueva, verifica su firma en developers.google.com/apps-script y súmala aquí.
    const REVISADAS = new Set([
      "GmailApp.createDraft", "GmailApp.getThreadById", "GmailApp.getUserLabelByName", "GmailApp.createLabel", "GmailApp.getAliases",
      "MailApp.getRemainingDailyQuota",
      "DriveApp.getFilesByName", "DriveApp.createFile", "DriveApp.getFileById",
      "Drive.Files", "Drive.Files.create", "Drive.Files.update", "Drive.Files.remove",
      "DocumentApp.openById",
      "CalendarApp.getCalendarById", "CalendarApp.getCalendarsByName", "CalendarApp.createCalendar",
      "ContentService.createTextOutput", "ContentService.MimeType.JSON",
      "PropertiesService.getScriptProperties", "LockService.getScriptLock",
      "ScriptApp.getProjectTriggers", "ScriptApp.newTrigger",
      "Utilities.base64Decode", "Utilities.newBlob", "Utilities.computeDigest", "Utilities.DigestAlgorithm.SHA_256", "Utilities.Charset.UTF_8",
      "Session.getEffectiveUser", "Session.getScriptTimeZone",
    ]);
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    const used = new Set([...code.matchAll(/\b(GmailApp|MailApp|DriveApp|Drive|DocumentApp|CalendarApp|ContentService|PropertiesService|LockService|ScriptApp|Utilities|Session)\.[\w.]+/g)].map((m) => m[0]));
    expect([...used].filter((u) => !REVISADAS.has(u))).toEqual([]);
    expect(used.size).toBeGreaterThan(20);
  });
});

describe("datos: mismo protocolo que el script anterior y servidor.mjs", () => {
  let w: World;
  beforeEach(() => { w = makeWorld(); });

  it("sin TOKEN configurado o con clave equivocada no entrega nada", () => {
    w.props.delete("TOKEN");
    expect(get(w, { token: "" })).toMatchObject({ ok: false });
    expect(post(w, { backup: backup(1) })).toMatchObject({ ok: false });
    w.props.set("TOKEN", TOKEN);
    expect(get(w, { token: "otra" })).toMatchObject({ ok: false, error: expect.stringContaining("Clave incorrecta") });
    expect(get(w, { token: TOKEN.slice(0, -1) }).ok).toBe(false);
    expect(postRaw(w, JSON.stringify({ token: "otra", action: "estado" })).ok).toBe(false);
    expect(postRaw(w, "esto no es json")).toEqual({ ok: false, error: "JSON inválido" });
  });

  it("la clave del script admite espacios sobrantes al pegarla", () => {
    w.props.set("TOKEN", `  ${TOKEN}\n`);
    expect(get(w, { token: TOKEN }).ok).toBe(true);
  });

  it("GET vacío, POST respaldo, GET meta y GET completo; la copia anterior se conserva", () => {
    expect(get(w, { token: TOKEN })).toEqual({ ok: true, updatedAt: null, backup: null });
    const r1 = post(w, { backup: backup(1) });
    expect(r1).toEqual({ ok: true, updatedAt: expect.any(String) });
    const meta = get(w, { token: TOKEN, meta: "1" });
    expect(meta).toEqual({ ok: true, updatedAt: r1.updatedAt });
    expect(get(w, { token: TOKEN })).toEqual({ ok: true, updatedAt: r1.updatedAt, backup: backup(1) });

    post(w, { backup: backup(2) });
    expect(get(w, { token: TOKEN }).backup).toEqual(backup(2));
    const byName = (n: string) => [...w.files.values()].filter((f) => f.name === n && !f.trashed);
    expect(byName("sofia-datos.json")).toHaveLength(1);
    expect(byName("sofia-datos-anterior.json")).toHaveLength(1);
    expect(JSON.parse(byName("sofia-datos-anterior.json")[0]!.bytes.toString("utf8")).backup).toEqual(backup(1));
    // Con Drive avanzado se reemplaza el contenido (sin el tope de 10 MB de setContent).
    expect(w.driveCalls.filter((c) => c.op === "update").length).toBeGreaterThan(0);
    expect(w.lock.taken).toBe(2);
  });

  it("rechaza lo que no es respaldo de Sofía y peticiones demasiado grandes", () => {
    expect(post(w, { backup: { app: "otra" } })).toEqual({ ok: false, error: "No es un respaldo de Sofía" });
    expect(post(w, {})).toEqual({ ok: false, error: "No es un respaldo de Sofía" });
    expect(postRaw(w, " ".repeat(45 * 1024 * 1024 + 1)).error).toMatch(/45 MB/);
    expect(w.files.size).toBe(0);
  });

  it("lee archivos del script anterior e ignora los que están en la papelera", () => {
    const viejo = new FakeFile("viejo", "sofia-datos.json", "application/json", Buffer.from(JSON.stringify({ updatedAt: "2026-01-01T00:00:00.000Z", backup: backup(0) })));
    const basura = new FakeFile("basura", "sofia-datos.json", "application/json", Buffer.from("{roto"));
    basura.trashed = true;
    basura.updated = new Date(Date.now() + 1e6);
    w.files.set(viejo.id, viejo).set(basura.id, basura);
    expect(get(w, { token: TOKEN })).toEqual({ ok: true, updatedAt: "2026-01-01T00:00:00.000Z", backup: backup(0) });
  });

  it("sin el servicio avanzado de Drive sigue guardando con setContent", () => {
    const sin = makeWorld({ drive: false });
    post(sin, { backup: backup(1) });
    post(sin, { backup: backup(2) });
    expect(get(sin, { token: TOKEN }).backup).toEqual(backup(2));
    expect(sin.driveCalls).toEqual([]);
  });

  it("acción desconocida o heredada de Object no se ejecuta", () => {
    expect(post(w, { action: "borrarTodo" }).error).toMatch(/Acción desconocida/);
    expect(post(w, { action: "constructor" }).error).toMatch(/Acción desconocida/);
    expect(post(w, { action: "__proto__" }).error).toMatch(/Acción desconocida/);
  });
});

describe("estado e instalación", () => {
  it("informa servicios, cuenta, cuota y si el agente está activo; instalar() es idempotente", () => {
    const w = makeWorld();
    const st = post(w, { action: "estado" });
    expect(st).toMatchObject({
      ok: true, version: "google-1.0", cuenta: ME, zonaHoraria: "America/Monterrey",
      servicios: { datos: true, correo: true, calendario: true, ocr: true },
      correo: { cuotaRestante: 100, agenteActivo: false, seguimientoAuto: false, dias: 3, casos: 0 },
    });
    expect(JSON.stringify(st)).not.toContain(TOKEN);
    w.gs.instalar();
    w.gs.instalar();
    expect(w.triggers).toEqual([{ fn: "agenteCorreo", everyHours: 1 }]);
    expect(post(w, { action: "estado" }).correo).toMatchObject({ agenteActivo: true });
    expect(post(makeWorld({ drive: false }), { action: "estado" }).servicios).toMatchObject({ ocr: false });
  });

  it("instalar() pide primero el TOKEN", () => {
    const w = makeWorld();
    w.props.delete("TOKEN");
    expect(() => w.gs.instalar()).toThrow(/TOKEN/);
    expect(w.triggers).toEqual([]);
  });
});

describe("correo: envío con adjuntos desde Gmail", () => {
  let w: World;
  beforeEach(() => { w = makeWorld(); });
  const factura = "%PDF-1.4 factura sintética";
  const ine = "foto-ine-sintetica";
  const enviar = (extra: Record<string, unknown> = {}) => post(w, {
    action: "correo.enviar", ref: "cliente-1", to: GESTORIA, cc: "jefe.prueba@example.com", subject: "Placas · Cliente Sintético",
    body: "Buen día, adjunto documentos para placas.", nombre: "Asesor Prueba",
    attachments: [{ name: "Factura.pdf", mime: "application/pdf", base64: b64(factura) }, { name: "INE/frente.jpg", mime: "image/jpeg", base64: b64(ine) }],
    ...extra,
  });

  it("envía con adjuntos, etiqueta el hilo «Sofía» y lo deja seguido", () => {
    const r = enviar();
    expect(r).toMatchObject({ ok: true, ref: "cliente-1", threadId: expect.any(String), adjuntos: 2, cuotaRestante: 98 });
    const s = w.sent[0]!;
    expect(s).toMatchObject({ kind: "nuevo", to: GESTORIA, subject: "Placas · Cliente Sintético", body: "Buen día, adjunto documentos para placas." });
    expect(s.opts.cc).toBe("jefe.prueba@example.com");
    expect(s.opts.name).toBe("Asesor Prueba");
    expect(s.opts.attachments!.map((a) => [a.getName(), a.getContentType(), a.getDataAsString()])).toEqual([
      ["Factura.pdf", "application/pdf", factura],
      ["INE_frente.jpg", "image/jpeg", ine],
    ]);
    expect(w.threads.get(r.threadId as string)!.labels).toEqual(["Sofía"]);
    const caso = JSON.parse(w.props.get("hilo:cliente-1")!);
    expect(caso).toMatchObject({ ref: "cliente-1", threadId: r.threadId, to: GESTORIA, subject: "Placas · Cliente Sintético", seguimientos: [], cerrado: false });
    // La etiqueta se crea una sola vez.
    enviar({ ref: "cliente-2" });
    expect(w.labels.size).toBe(1);
    const bit = post(w, { action: "estado" }).bitacora as { tipo: string; ref: string }[];
    expect(bit.map((b) => [b.tipo, b.ref])).toEqual([["enviado", "cliente-2"], ["enviado", "cliente-1"]]);
  });

  it("valida destinatarios, caso, asunto, tamaño de adjuntos y cuota", () => {
    expect(enviar({ to: "no-es-correo" }).error).toMatch(/Correo inválido/);
    expect(enviar({ to: "" }).error).toMatch(/Falta el correo/);
    expect(enviar({ ref: "" }).error).toMatch(/caso/);
    expect(enviar({ ref: "../../x" }).error).toMatch(/caso/);
    expect(enviar({ subject: " " }).error).toMatch(/asunto/);
    expect(enviar({ attachments: [{ name: "x", mime: "image/jpeg", base64: "" }] }).error).toMatch(/vacío/);
    expect(enviar({ attachments: [{ name: "x", mime: "image/jpeg", base64: "%%%" }] }).ok).toBe(false);
    const grande = Buffer.alloc(10 * 1024 * 1024, 1).toString("base64");
    expect(enviar({ attachments: [{ name: "a.jpg", mime: "image/jpeg", base64: grande }, { name: "b.jpg", mime: "image/jpeg", base64: grande }] }).error).toMatch(/18 MB/);
    expect(enviar({ attachments: Array.from({ length: 21 }, (_, i) => ({ name: `${i}.jpg`, mime: "image/jpeg", base64: b64("x") })) }).error).toMatch(/Máximo 20/);
    w.quota = 1;
    expect(enviar().error).toMatch(/quedan 1/);
    expect(w.sent).toEqual([]);
    expect(w.props.has("hilo:cliente-1")).toBe(false);
  });

  it("enHilo contesta a todos en el hilo del caso (sin abrir otro)", () => {
    const r = enviar();
    w.reply(r.threadId as string, "Recibido, gracias.");
    const r2 = enviar({ enHilo: true, body: "Les comparto la CURP que faltaba.", attachments: [{ name: "CURP.pdf", mime: "application/pdf", base64: b64("curp") }] });
    expect(r2.threadId).toBe(r.threadId);
    expect(w.threads.size).toBe(1);
    expect(w.sent[1]).toMatchObject({ kind: "replyAll", threadId: r.threadId, body: "Les comparto la CURP que faltaba." });
    expect(w.sent[1]!.to).toContain(GESTORIA);
    expect(w.sent[1]!.opts.attachments!.map((a) => a.getName())).toEqual(["CURP.pdf"]);
  });
});

describe("correo: revisión de respuestas y estado sugerido (sin IA)", () => {
  it("devuelve respuestas sin lo citado, con nombres de adjuntos y estado sugerido", () => {
    const w = makeWorld();
    const r = post(w, { action: "correo.enviar", ref: "c1", to: GESTORIA, subject: "Placas", body: "Adjunto factura, INE y comprobante de domicilio.", attachments: [] });
    let rev = post(w, { action: "correo.revisar" }).casos as Record<string, unknown>[];
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ ref: "c1", asunto: "Placas", respuestas: [], sugerido: null, esperando: true });

    const d1 = new Date(Date.now() - 3600_000);
    w.reply(r.threadId as string, [
      "Buen día, le falta la constancia de situación fiscal del cliente.",
      "",
      "El jue, 9 oct 2026 a las 10:15, Asesor Prueba (<asesor.prueba@example.com>)",
      "escribió:",
      "> Adjunto factura, INE y comprobante de domicilio.",
    ].join("\r\n"), { attachments: [newBlob("x", "application/pdf", "requisitos.pdf")], date: d1 });
    rev = post(w, { action: "correo.revisar", refs: ["c1"] }).casos as Record<string, unknown>[];
    expect(rev[0]).toMatchObject({
      ref: "c1",
      esperando: false,
      respuestas: [{ de: `Gestoría Prueba <${GESTORIA}>`, fecha: d1.toISOString(), texto: "Buen día, le falta la constancia de situación fiscal del cliente.", adjuntos: ["requisitos.pdf"] }],
      sugerido: { clave: "falta_documento", texto: "Falta documento" },
    });

    w.reply(r.threadId as string, "Ya están listas las placas, pueden pasar por ellas mañana.\n\nOn Thu, Oct 9, 2026 at 10:15 AM Asesor wrote:\n> texto viejo con falta de INE");
    rev = post(w, { action: "correo.revisar", refs: "c1" }).casos as Record<string, unknown>[];
    expect((rev[0]!.respuestas as unknown[]).length).toBe(2);
    expect(rev[0]!.sugerido).toMatchObject({ clave: "placas_listas" });
    expect(post(w, { action: "correo.revisar", refs: ["no-existe"] }).casos).toEqual([]);
    expect(w.lock.taken).toBe(1); // revisar solo lee: no toma el candado
  });

  it("clasifica por palabras clave, con negaciones y confirmaciones de pago", () => {
    const { gs } = makeWorld();
    const c = (t: string) => gs.clasificar_(t)?.clave ?? null;
    expect(c("Buen día, le falta la constancia de situación fiscal.")).toBe("falta_documento");
    expect(c("La INE está vencida, favor de reenviarla.")).toBe("falta_documento");
    expect(c("El comprobante de domicilio no se ve, ¿lo puede reenviar?")).toBe("falta_documento");
    expect(c("Necesitamos la carta poder firmada.")).toBe("falta_documento");
    expect(c("Para continuar falta el pago de derechos por $1,250.")).toBe("pago");
    expect(c("Le comparto la línea de captura para el pago.")).toBe("pago");
    expect(c("Las placas ya están listas, pueden pasar por ellas.")).toBe("placas_listas");
    expect(c("Ya salieron sus placas.")).toBe("placas_listas");
    expect(c("Recibimos su pago, las placas ya están listas.")).toBe("placas_listas");
    expect(c("Aún no están listas las placas, le aviso.")).toBe("en_tramite");
    expect(c("Las placas todavía no están listas.")).toBe("en_tramite");
    expect(c("No falta nada, ya ingresamos el trámite.")).toBe("en_tramite");
    expect(c("Recibimos los documentos, ya está en trámite.")).toBe("en_tramite");
    expect(c("Muchas gracias.")).toBeNull();
    expect(c("")).toBeNull();
    expect(gs.clasificar_("Le falta la CURP")).toEqual({ clave: "falta_documento", texto: "Falta documento", coincidencia: "falta la curp" });
  });

  it("quita citas de Gmail, Outlook y líneas con >", () => {
    const { gs } = makeWorld();
    expect(gs.sinCitas_("Hola\r\n\r\nEl lun, 6 oct 2026, 9:00, Alguien <a@example.com> escribió:\r\n> viejo")).toBe("Hola");
    expect(gs.sinCitas_("Listo\n-----Mensaje original-----\nDe: x")).toBe("Listo");
    expect(gs.sinCitas_("Ok\nDe: Asesor <asesor.prueba@example.com>\nEnviado: hoy")).toBe("Ok");
    expect(gs.sinCitas_("Uno\n> cita\nDos")).toBe("Uno\nDos");
  });
});

describe("correo: seguimiento automático", () => {
  let w: World;
  beforeEach(() => { w = makeWorld(); });
  const enviar = (ref: string, extra: Record<string, unknown> = {}) => post(w, { action: "correo.enviar", ref, to: GESTORIA, subject: `Placas ${ref}`, body: "Documentos adjuntos.", ...extra });
  const seguimientos = () => w.sent.filter((s) => s.kind === "replyAll");

  it("correo.config valida, guarda y al encenderlo instala el disparador una sola vez", () => {
    expect(post(w, { action: "correo.config", dias: 0 }).error).toMatch(/1 a 30/);
    expect(post(w, { action: "correo.config", texto: "  " }).error).toMatch(/texto/);
    expect(w.triggers).toEqual([]);
    const r = post(w, { action: "correo.config", seguimientoAuto: true, dias: 4, texto: "¿Me comparten el estatus, por favor?" });
    expect(r).toMatchObject({ ok: true, config: { seguimientoAuto: true, dias: 4, texto: "¿Me comparten el estatus, por favor?" }, agenteActivo: true });
    post(w, { action: "correo.config", seguimientoAuto: true });
    expect(w.triggers).toHaveLength(1);
    expect(post(w, { action: "estado" }).correo).toMatchObject({ seguimientoAuto: true, dias: 4, agenteActivo: true });
  });

  it("si no contestan en N días manda UN seguimiento en el mismo hilo por periodo (máx. 3)", () => {
    post(w, { action: "correo.config", seguimientoAuto: true, dias: 3 });
    const r = enviar("c1");
    const tid = r.threadId as string;
    w.gs.agenteCorreo();
    expect(seguimientos()).toHaveLength(0); // todavía no pasan 3 días

    w.age(tid, 2.9);
    w.gs.agenteCorreo();
    expect(seguimientos()).toHaveLength(0);

    w.age(tid, 0.2);
    w.gs.agenteCorreo();
    w.gs.agenteCorreo(); // la siguiente hora: ya no repite
    expect(seguimientos()).toHaveLength(1);
    expect(seguimientos()[0]).toMatchObject({ threadId: tid, body: expect.stringContaining("estatus") });
    expect(seguimientos()[0]!.to).toContain(GESTORIA);
    expect(w.threads.size).toBe(1);
    const caso = JSON.parse(w.props.get("hilo:c1")!);
    expect(caso.seguimientos).toHaveLength(1);

    // Aunque Gmail mostrara el hilo viejo, la fecha anotada impide otro seguimiento dentro del periodo.
    w.age(tid, 5);
    w.gs.agenteCorreo();
    expect(seguimientos()).toHaveLength(1);

    // Otro periodo después, sí (y nunca más de 3).
    const marcar = (dias: number) => { const c = JSON.parse(w.props.get("hilo:c1")!); c.seguimientos = c.seguimientos.map((s: string) => new Date(new Date(s).getTime() - dias * DIA).toISOString()); w.props.set("hilo:c1", JSON.stringify(c)); };
    for (let i = 0; i < 5; i++) { marcar(4); w.age(tid, 4); w.gs.agenteCorreo(); }
    expect(seguimientos()).toHaveLength(3);
    const bit = post(w, { action: "estado" }).bitacora as { tipo: string; texto: string }[];
    expect(bit.filter((b) => b.tipo === "seguimiento").map((b) => b.texto)).toEqual([
      `Seguimiento automático #3 a ${GESTORIA}`, `Seguimiento automático #2 a ${GESTORIA}`, `Seguimiento automático #1 a ${GESTORIA}`,
    ]);
    expect(w.lock.held).toBe(0);
  });

  it("no insiste si contestaron, si está apagado, si el caso pide 0 días o está cerrado", () => {
    const a = enviar("contestaron").threadId as string;
    const b = enviar("cero", { seguimientoDias: 0 }).threadId as string;
    const c = enviar("cerrado").threadId as string;
    const d = enviar("listas").threadId as string;
    w.reply(a, "Recibimos los documentos, ya está en trámite.");
    w.reply(d, "Las placas ya están listas.");
    expect(post(w, { action: "correo.cerrar", ref: "cerrado" })).toEqual({ ok: true, cerrado: true });
    post(w, { action: "correo.enviar", ref: "listas", enHilo: true, to: GESTORIA, subject: "x", body: "¡Gracias! Paso mañana." });
    for (const t of [a, b, c, d]) w.age(t, 10);

    w.gs.agenteCorreo(); // apagado: nada
    expect(seguimientos().filter((s) => s.body !== "¡Gracias! Paso mañana.")).toHaveLength(0);
    post(w, { action: "correo.config", seguimientoAuto: true, dias: 3 });
    w.gs.agenteCorreo();
    expect(seguimientos().filter((s) => s.body !== "¡Gracias! Paso mañana.")).toHaveLength(0);

    // Con su propio plazo, un caso sí recibe seguimiento.
    const e = enviar("propio", { seguimientoDias: 1 }).threadId as string;
    w.age(e, 1.5);
    w.gs.agenteCorreo();
    expect(seguimientos().filter((s) => s.threadId === e)).toHaveLength(1);
  });

  it("sin cuota de Gmail espera a la siguiente vuelta y olvida casos de hace más de 180 días", () => {
    post(w, { action: "correo.config", seguimientoAuto: true, dias: 3 });
    const t = enviar("c1").threadId as string;
    w.age(t, 4);
    w.quota = 0;
    w.gs.agenteCorreo();
    expect(seguimientos()).toHaveLength(0);
    w.quota = 50;
    w.gs.agenteCorreo();
    expect(seguimientos()).toHaveLength(1);

    const viejo = JSON.parse(w.props.get("hilo:c1")!);
    viejo.enviadoAt = new Date(Date.now() - 200 * DIA).toISOString();
    w.props.set("hilo:c1", JSON.stringify(viejo));
    w.gs.agenteCorreo();
    expect(w.props.has("hilo:c1")).toBe(false);
  });

  it("la bitácora no rebasa el tamaño de una propiedad", () => {
    for (let i = 0; i < 60; i++) enviar(`caso-${i}`, { subject: `Placas ${"x".repeat(240)}` });
    const bit = JSON.parse(w.props.get("BITACORA")!);
    expect(bit.length).toBeLessThanOrEqual(30);
    expect(bit[0].ref).toBe("caso-59");
  });
});

describe("calendario «Sofía»", () => {
  it("crea el calendario una vez, guarda, mueve y borra eventos con avisos", () => {
    const w = makeWorld();
    const inicio = "2026-10-12T16:00:00.000Z";
    const r = post(w, { action: "calendario.guardar", titulo: "Llamar a Cliente Sintético", descripcion: "Tel. 81 0000 0000", inicio, minutos: 30, avisos: [10, 60] });
    expect(r).toMatchObject({ ok: true, id: expect.any(String), inicio, avisos: [10, 60] });
    expect(w.calendars.size).toBe(1);
    const cal = [...w.calendars.values()][0]!;
    expect(cal.name).toBe("Sofía");
    const ev = cal.events.get(r.id as string)!;
    expect(ev).toMatchObject({ title: "Llamar a Cliente Sintético", description: "Tel. 81 0000 0000", reminders: [10, 60] });
    expect(ev.end.getTime() - ev.start.getTime()).toBe(30 * 60000);

    const r2 = post(w, { action: "calendario.guardar", id: r.id, titulo: "Llamar (movido)", inicio: "2026-10-13T17:00:00.000Z", avisos: [0, 0, 99999, "x"] });
    expect(r2.id).toBe(r.id);
    expect(cal.events.size).toBe(1);
    expect(ev).toMatchObject({ title: "Llamar (movido)", reminders: [5, 40320] }); // Google: de 5 min a 4 semanas
    expect(ev.start.toISOString()).toBe("2026-10-13T17:00:00.000Z");
    expect(ev.end.getTime() - ev.start.getTime()).toBe(15 * 60000);

    // Si lo borraron en Google Calendar, se crea de nuevo; el calendario no se duplica.
    cal.events.delete(r.id as string);
    const r3 = post(w, { action: "calendario.guardar", id: r.id, titulo: "Otra vez", inicio });
    expect(r3.id).not.toBe(r.id);
    expect(cal.events.get(r3.id as string)!.reminders).toEqual([5]);
    expect(w.calendars.size).toBe(1);

    expect(post(w, { action: "calendario.borrar", id: r3.id })).toEqual({ ok: true, borrado: true });
    expect(post(w, { action: "calendario.borrar", id: r3.id })).toEqual({ ok: true, borrado: false });
    expect(post(w, { action: "calendario.guardar", titulo: "x", inicio: "mañana" }).error).toMatch(/fecha/);
    expect(post(w, { action: "calendario.guardar", titulo: " ", inicio }).error).toMatch(/título/);
  });

  it("si el usuario borró el calendario, lo vuelve a crear", () => {
    const w = makeWorld();
    post(w, { action: "calendario.guardar", titulo: "a", inicio: "2026-10-12T16:00:00.000Z" });
    w.calendars.clear();
    expect(post(w, { action: "calendario.guardar", titulo: "b", inicio: "2026-10-12T16:00:00.000Z" }).ok).toBe(true);
    expect([...w.calendars.values()].map((c) => c.name)).toEqual(["Sofía"]);
  });
});

describe("OCR gratuito de Google Drive", () => {
  it("convierte cada foto a Google Doc con OCR en español, lee el texto y no deja archivos", () => {
    const w = makeWorld();
    const frente = "INSTITUTO NACIONAL ELECTORAL\nNOMBRE\nSINTETICO PRUEBA\nPERSONA";
    const reverso = "IDMEX0000000000<<0000000000000";
    const r = post(w, { action: "ocr", images: [{ base64: b64(frente), mime: "image/jpeg" }, { base64: b64(reverso), mime: "image/png" }] });
    expect(r).toEqual({ ok: true, texts: [frente, reverso] });
    const creates = w.driveCalls.filter((c) => c.op === "create");
    expect(creates).toHaveLength(2);
    expect(creates[0]).toMatchObject({ resource: { mimeType: "application/vnd.google-apps.document" }, mime: "image/jpeg", opts: { ocrLanguage: "es" } });
    expect(w.files.size).toBe(0); // ni el Doc ni la foto se quedan
    expect(w.docs.size).toBe(0);
    expect(w.lock.taken).toBe(0); // no frena el respaldo
  });

  it("limita cantidad, tipo y tamaño; pide el servicio avanzado de Drive", () => {
    const w = makeWorld();
    const img = { base64: b64("texto"), mime: "image/jpeg" };
    expect(post(w, { action: "ocr", images: [] }).error).toMatch(/ninguna imagen/);
    expect(post(w, { action: "ocr", images: Array(7).fill(img) }).error).toMatch(/Máximo 6/);
    expect(post(w, { action: "ocr", images: [{ base64: b64("x"), mime: "image/heic" }] }).error).toMatch(/JPG, PNG, GIF o PDF/);
    expect(post(w, { action: "ocr", images: [{ base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64"), mime: "image/jpeg" }] }).error).toMatch(/8 MB/);
    expect(post(makeWorld({ drive: false }), { action: "ocr", images: [img] }).error).toMatch(/servicio avanzado de Drive/);
    expect(w.driveCalls).toEqual([]);
  });

  it("si la lectura falla, igual borra el archivo temporal", () => {
    const w = makeWorld();
    const sandbox = w.gs as unknown as { DocumentApp: { openById(): never } };
    sandbox.DocumentApp = { openById: () => { throw new Error("Documento no disponible"); } };
    expect(post(w, { action: "ocr", images: [{ base64: b64("x"), mime: "image/jpeg" }] })).toEqual({ ok: false, error: "Documento no disponible" });
    expect(w.files.size).toBe(0);
  });
});

// ───────── Revisión adversarial: casos que rompían la primera versión ─────────

describe("revisión adversarial", () => {
  it("un archivo «sofia-datos.json» que otra persona comparte contigo no se lee ni se sobrescribe", () => {
    const w = makeWorld();
    post(w, { backup: backup(1) });
    const ajeno = new FakeFile("ajeno", "sofia-datos.json", "application/json", Buffer.from(JSON.stringify({ updatedAt: "2099-01-01T00:00:00.000Z", backup: backup(666) })));
    ajeno.owner = "otra.persona@example.com";
    ajeno.updated = new Date(Date.now() + 1e9); // más reciente que el tuyo
    w.files.set(ajeno.id, ajeno);
    expect(get(w, { token: TOKEN }).backup).toEqual(backup(1));
    post(w, { backup: backup(2) });
    expect(JSON.parse(ajeno.bytes.toString("utf8")).backup).toEqual(backup(666)); // tus clientes no se escriben en su archivo
    expect(get(w, { token: TOKEN }).backup).toEqual(backup(2));
  });

  it("un calendario «Sofía» compartido por otra persona no recibe tus recordatorios", () => {
    const w = makeWorld();
    const ajeno = new FakeCalendar("ajeno", "Sofía", {});
    ajeno.mine = false;
    w.calendars.set(ajeno.id, ajeno);
    expect(post(w, { action: "calendario.guardar", titulo: "Llamar a Cliente Sintético", inicio: "2026-10-12T16:00:00.000Z" }).ok).toBe(true);
    expect(ajeno.events.size).toBe(0);
    expect([...w.calendars.values()].filter((c) => c.mine && c.name === "Sofía")).toHaveLength(1);
  });

  it("la bitácora cabe en una propiedad aunque los asuntos traigan acentos y símbolos (bytes, no letras)", () => {
    const w = makeWorld();
    for (let i = 0; i < 40; i++) {
      const r = post(w, { action: "correo.enviar", ref: `caso-${i}`, to: GESTORIA, subject: `Trámite ${"…".repeat(240)}`, body: "Documentos." });
      expect(r.ok, String(r.error)).toBe(true);
    }
    expect(Buffer.byteLength(w.props.get("BITACORA")!)).toBeLessThanOrEqual(9 * 1024);
    expect(JSON.parse(w.props.get("BITACORA")!)[0].ref).toBe("caso-39"); // y sigue anotando lo más reciente
  });

  it("si el correo ya salió y falla lo de después, responde ok con aviso (un reintento duplicaría el correo)", () => {
    const w = makeWorld();
    for (let i = 0; w.props.size < 2000; i++) w.props.set(`relleno-${i}`, "x".repeat(250)); // propiedades casi llenas (~500 KB)
    const r = post(w, { action: "correo.enviar", ref: "c1", to: GESTORIA, subject: "Placas", body: "Documentos." });
    expect(w.sent).toHaveLength(1);
    expect(r).toMatchObject({ ok: true, threadId: expect.any(String), aviso: expect.stringContaining("sí se envió") });
  });

  it("si no se puede anotar el seguimiento automático, no se manda (si no, se repetiría sin tope)", () => {
    const w = makeWorld();
    post(w, { action: "correo.config", seguimientoAuto: true, dias: 3 });
    const tid = post(w, { action: "correo.enviar", ref: "c1", to: GESTORIA, subject: "Placas", body: "Documentos." }).threadId as string;
    for (let i = 0; w.props.size < 2000; i++) w.props.set(`relleno-${i}`, "x".repeat(250)); // propiedades llenas
    for (let i = 0; i < 6; i++) { w.age(tid, 4); w.gs.agenteCorreo(); }
    expect(w.sent.filter((s) => s.kind === "replyAll")).toHaveLength(0);
    expect(w.lock.held).toBe(0);
  });

  it("si Gmail falla al mandar el seguimiento, no queda contado y se intenta en la siguiente vuelta", () => {
    const w = makeWorld();
    post(w, { action: "correo.config", seguimientoAuto: true, dias: 3 });
    const tid = post(w, { action: "correo.enviar", ref: "c1", to: GESTORIA, subject: "Placas", body: "Documentos." }).threadId as string;
    w.age(tid, 4);
    const ultimo = w.threads.get(tid)!.messages[0]!;
    const replyAll = ultimo.replyAll.bind(ultimo);
    ultimo.replyAll = () => { throw new Error("Service invoked too many times"); };
    w.gs.agenteCorreo();
    expect(JSON.parse(w.props.get("hilo:c1")!).seguimientos).toEqual([]);
    expect((post(w, { action: "estado" }).bitacora as { tipo: string }[])[0]!.tipo).toBe("error");
    ultimo.replyAll = replyAll;
    w.gs.agenteCorreo();
    expect(w.sent.filter((s) => s.kind === "replyAll")).toHaveLength(1);
    expect(JSON.parse(w.props.get("hilo:c1")!).seguimientos).toHaveLength(1);
  });

  it("rechaza direcciones absurdamente largas antes de enviar", () => {
    const w = makeWorld();
    const r = post(w, { action: "correo.enviar", ref: "c1", to: `${"a".repeat(300)}@example.com`, subject: "Placas", body: "x" });
    expect(r.error).toMatch(/Correo inválido/);
    expect(w.sent).toEqual([]);
  });

  it("negaciones y futuro: «no están terminadas», «no salieron», «estarán listas», «no hace falta» no engañan", () => {
    const { gs } = makeWorld();
    const c = (t: string) => gs.clasificar_(t)?.clave ?? null;
    expect(c("Las placas todavía no están terminadas, le aviso.")).toBe("en_tramite");
    expect(c("El trámite aún no está concluido.")).toBe("en_tramite");
    expect(c("El trámite no ha concluido.")).not.toBe("placas_listas");
    expect(c("Las placas no salieron esta semana.")).toBe("en_tramite");
    expect(c("No hace falta la copia de la factura.")).toBeNull();
    expect(c("Las placas no estarán listas hasta el lunes.")).not.toBe("placas_listas");
    // En futuro todavía no lo están: lo normal es que la gestoría avise así.
    expect(c("Sus placas estarán listas el viernes.")).toBe("en_tramite");
    expect(c("Le aviso cuando las placas estén listas.")).toBe("en_tramite");
    expect(c("El trámite quedará concluido la próxima semana.")).toBe("en_tramite");
    expect(c("El pago ya quedó registrado, gracias.")).toBeNull();
    expect(c("Falta poco para que salgan, ya tenemos la factura.")).toBeNull();
    // Lo positivo se sigue reconociendo.
    expect(c("El trámite ya está concluido, pueden pasar.")).toBe("placas_listas");
    expect(c("Las placas ya están terminadas.")).toBe("placas_listas");
  });

  it("un «no están terminadas» de la gestoría no apaga el seguimiento automático", () => {
    const w = makeWorld();
    post(w, { action: "correo.config", seguimientoAuto: true, dias: 3 });
    const r = post(w, { action: "correo.enviar", ref: "c1", to: GESTORIA, subject: "Placas", body: "Documentos." });
    const tid = r.threadId as string;
    w.reply(tid, "Las placas todavía no están terminadas.");
    post(w, { action: "correo.enviar", ref: "c1", enHilo: true, to: GESTORIA, subject: "Placas", body: "Gracias, quedo atento." });
    w.age(tid, 4);
    w.gs.agenteCorreo();
    expect(w.sent.filter((s) => s.kind === "replyAll" && s.body !== "Gracias, quedo atento.")).toHaveLength(1);
  });

  it("avisos inválidos no dejan el recordatorio mudo; la línea de Outlook corta lo citado", () => {
    const w = makeWorld();
    const r = post(w, { action: "calendario.guardar", titulo: "Llamar", inicio: "2026-10-12T16:00:00.000Z", avisos: ["x", null] });
    expect(r.avisos).toEqual([5]);
    expect(w.gs.sinCitas_("Ya están listas.\n\n________________________________\nDe: Asesor Prueba\nEnviado: jueves\nLe falta la INE")).toBe("Ya están listas.");
  });

  it("revisar respuestas acepta como máximo 50 casos por llamada", () => {
    const w = makeWorld();
    expect(post(w, { action: "correo.revisar", refs: Array.from({ length: 51 }, (_, i) => `c${i}`) }).error).toMatch(/50/);
  });
});

// ───────── Cliente de la app (prueba/js/google.js) contra el mismo script ─────────

type Client = {
  googleReady(): boolean;
  gcall(action: string, payload?: Record<string, unknown>): Promise<Res>;
  googleStatus(): Promise<Res>;
  sendEmail(m: Record<string, unknown>): Promise<Res>;
  checkEmails(refs?: string | string[]): Promise<Array<Record<string, unknown>>>;
  setEmailConfig(c: Record<string, unknown>): Promise<Res>;
  closeEmailCase(ref: string): Promise<Res>;
  saveEvent(e: Record<string, unknown>): Promise<string>;
  deleteEvent(id: string): Promise<Res>;
  ocrImages(blobs: Blob[]): Promise<string[]>;
  ocrObservation(blob: Blob): Promise<{ engine: string; pages: unknown[] }>;
};
type Store = { state: { settings: Record<string, unknown> & { server: Record<string, unknown>; google?: Record<string, unknown> } } };

describe("cliente google.js ↔ script", () => {
  const URL_EXEC = "https://script.google.com/macros/s/AKfyc-prueba/exec";
  let w: World;
  let g: Client;
  let store: Store;
  let urls: string[];

  beforeEach(async () => {
    // FileReader no existe en Node: lo mínimo que usa blobToBase64 de util.js.
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(b: Blob) { void b.arrayBuffer().then((buf) => { this.result = `data:${b.type};base64,${Buffer.from(buf).toString("base64")}`; this.onload?.(); }); }
    });
    vi.spyOn(console, "error").mockImplementation(() => {}); // save() no tiene IndexedDB en Node
    w = makeWorld();
    urls = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      urls.push(url);
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("content-type")).toBe("text/plain;charset=utf-8"); // sin preflight
      const out = w.gs.doPost({ postData: { contents: String(init.body), length: String(init.body).length, type: "text/plain" } });
      return new Response(out.getContent(), { headers: { "content-type": "application/json; charset=utf-8" } });
    });
    // @ts-expect-error módulo JS de la app de prueba
    g = await import("../prueba/js/google.js");
    // @ts-expect-error módulo JS de la app de prueba
    store = await import("../prueba/js/store.js");
    store.state.settings.google = { url: URL_EXEC, token: TOKEN };
    store.state.settings.server = { url: "", token: "", auto: false, lastSync: null };
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("googleReady: solo con dirección de Google …/exec y clave; usa la del servidor si es de Google", async () => {
    expect(g.googleReady()).toBe(true);
    store.state.settings.google = { url: "https://otro-sitio.example.com/exec", token: TOKEN };
    expect(g.googleReady()).toBe(false);
    await expect(g.gcall("estado")).rejects.toThrow(/Conecta tu cuenta de Google/);
    store.state.settings.google = { url: "", token: "" };
    store.state.settings.server = { url: URL_EXEC, token: TOKEN, auto: false, lastSync: null };
    expect(g.googleReady()).toBe(true);
    expect((await g.googleStatus()).cuenta).toBe(ME);
    expect(urls).toEqual([URL_EXEC]);
  });

  it("estado, correo con adjuntos, revisión, calendario y OCR de punta a punta", async () => {
    const st = await g.googleStatus();
    expect(st).toMatchObject({ ok: true, cuenta: ME, servicios: { ocr: true } });
    expect(store.state.settings.google).toMatchObject({ url: URL_EXEC, token: TOKEN, status: { cuenta: ME, correo: { cuotaRestante: 100 } } });

    const r = await g.sendEmail({
      to: GESTORIA, subject: "Placas · Cliente Sintético", body: "Adjunto documentos.", ref: "cliente-1", seguimientoDias: 2,
      files: [{ blob: new Blob(["factura sintética"], { type: "application/pdf" }), name: "Factura.pdf" }],
    });
    expect(r).toMatchObject({ ok: true, ref: "cliente-1", adjuntos: 1 });
    expect(w.sent[0]!.opts.attachments!.map((a) => [a.getName(), a.getContentType(), a.getDataAsString()])).toEqual([["Factura.pdf", "application/pdf", "factura sintética"]]);
    expect(JSON.parse(w.props.get("hilo:cliente-1")!).dias).toBe(2);

    w.reply(r.threadId as string, "Le falta la CURP del cliente.", { attachments: [newBlob("x", "image/jpeg", "nota.jpg")] });
    const casos = await g.checkEmails("cliente-1");
    expect(casos[0]).toMatchObject({ ref: "cliente-1", sugerido: { clave: "falta_documento" }, respuestas: [{ texto: "Le falta la CURP del cliente.", adjuntos: ["nota.jpg"] }] });
    expect(await g.checkEmails()).toHaveLength(1);

    expect(await g.setEmailConfig({ seguimientoAuto: true, dias: 5 })).toMatchObject({ agenteActivo: true, config: { dias: 5 } });
    expect(await g.closeEmailCase("cliente-1")).toMatchObject({ cerrado: true });

    const id = await g.saveEvent({ title: "Confirmar cita", at: new Date("2026-10-15T15:30:00.000Z"), alerts: [10] });
    expect(typeof id).toBe("string");
    expect([...w.calendars.values()][0]!.events.get(id)).toMatchObject({ title: "Confirmar cita", reminders: [10] });
    expect(await g.saveEvent({ id, title: "Confirmar cita (cambio)", at: "2026-10-16T15:30:00.000Z" })).toBe(id);
    expect(await g.deleteEvent(id)).toMatchObject({ borrado: true });

    const texto = "INSTITUTO NACIONAL ELECTORAL\nNOMBRE\nSINTETICO\nPRUEBA PERSONA";
    expect(await g.ocrImages([new Blob([texto], { type: "image/jpeg" })])).toEqual([texto]);
    const obs = await g.ocrObservation(new Blob([texto], { type: "image/jpeg" }));
    expect(obs.engine).toBe("google");
    expect(obs.pages).toHaveLength(1);
    expect(w.files.size).toBe(0);
  });

  it("los errores del script llegan como Error legible; las fallas de red y de página también", async () => {
    store.state.settings.google = { url: URL_EXEC, token: "otra-clave" };
    await expect(g.googleStatus()).rejects.toThrow(/Clave incorrecta/);
    store.state.settings.google = { url: URL_EXEC, token: TOKEN };
    await expect(g.sendEmail({ to: "x", subject: "a", body: "b", ref: "c1" })).rejects.toThrow(/Correo inválido/);
    await expect(g.sendEmail({ to: GESTORIA, subject: "a", body: "b", ref: "c1", files: [{ blob: new Blob([new Uint8Array(19 * 1024 * 1024)]), name: "x" }] })).rejects.toThrow(/18 MB/);
    await expect(g.ocrImages(Array(7).fill(new Blob(["x"], { type: "image/jpeg" })))).rejects.toThrow(/Máximo 6/);

    await expect(g.saveEvent({ title: "x", at: "mañana" })).rejects.toThrow(/fecha/);

    // Con el script anterior (solo respaldo) cualquier acción contesta "No es un respaldo de Sofía": se explica qué hacer.
    const viejo = path.join(DIR, "../google-apps-script.gs");
    if (fs.existsSync(viejo)) expect(fs.readFileSync(viejo, "utf8")).toContain("error: 'No es un respaldo de Sofía'");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, error: "No es un respaldo de Sofía" }), { headers: { "content-type": "application/json" } }));
    await expect(g.googleStatus()).rejects.toThrow(/versión anterior/);

    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await expect(g.gcall("estado")).rejects.toThrow(/No hay conexión con Google/);
    vi.stubGlobal("fetch", async () => new Response("<html>Inicia sesión</html>", { headers: { "content-type": "text/html" } }));
    await expect(g.gcall("estado")).rejects.toThrow(/Cualquier usuario/);
  });
});
