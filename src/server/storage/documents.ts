/**
 * Almacenamiento PRIVADO de documentos (INE, comprobantes…).
 *
 * - El contenido nunca va a la base de datos ni a prompts ni a logs.
 * - En BD solo se guarda la referencia (proveedor, bucket, llave), hash y estado.
 * - Local: carpeta fuera de /public, nunca servida estáticamente.
 * - Supabase: bucket PRIVADO de Supabase Storage (servidor gratuito: el disco de Render se borra).
 *   Se accede solo desde el servidor con la llave service_role (nunca en el navegador ni en la APK).
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface StoredObjectRef {
  provider: "local_private" | "supabase_storage";
  bucket: string;
  key: string;
  sha256: string;
  sizeBytes: number;
}

export interface DocumentStorage {
  /** `folder` es una ruta lógica opaca (p. ej. "templates" o "generated/<customerId>"). */
  put(workspaceId: string, folder: string, bytes: Uint8Array, mimeType: string): Promise<StoredObjectRef>;
  get(ref: Pick<StoredObjectRef, "bucket" | "key">): Promise<Uint8Array>;
  remove(ref: Pick<StoredObjectRef, "bucket" | "key">): Promise<void>;
}

export class LocalPrivateStorage implements DocumentStorage {
  constructor(private readonly root: string) {}

  private resolve(bucket: string, key: string): string {
    const base = path.resolve(this.root, bucket);
    const full = path.resolve(base, key);
    const rel = path.relative(base, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Ruta de documento inválida");
    return full;
  }

  async put(workspaceId: string, folder: string, bytes: Uint8Array, mimeType: string): Promise<StoredObjectRef> {
    const ext = mimeType === "application/pdf" ? ".pdf" : mimeType.startsWith("image/") ? `.${mimeType.split("/")[1]}` : ".bin";
    // Llave opaca: no contiene nombre del cliente ni tipo de documento.
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "_").replace(/^\/+|\.\./g, "");
    const key = `${safeFolder}/${randomUUID()}${ext}`;
    const file = this.resolve(workspaceId, key);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, bytes, { mode: 0o600 });
    return {
      provider: "local_private",
      bucket: workspaceId,
      key,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
    };
  }

  async get(ref: Pick<StoredObjectRef, "bucket" | "key">): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.resolve(ref.bucket, ref.key)));
  }

  async remove(ref: Pick<StoredObjectRef, "bucket" | "key">): Promise<void> {
    await fs.rm(this.resolve(ref.bucket, ref.key), { force: true });
  }
}

/**
 * Supabase Storage (bucket privado). Las llaves siguen siendo opacas: <workspace>/<carpeta>/<uuid>.<ext>.
 * El bucket se crea solo (privado) la primera vez.
 */
export class SupabaseStorage implements DocumentStorage {
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket = "sofia-docs",
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  private objectUrl(key: string) {
    return `${this.url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(this.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private ensureBucket() {
    this.bucketReady ??= (async () => {
      const res = await fetch(`${this.url.replace(/\/+$/, "")}/storage/v1/bucket`, {
        method: "POST",
        headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
      });
      // 200 = creado; 400/409 = ya existe.
      if (!res.ok && res.status !== 400 && res.status !== 409) throw new Error(`Supabase Storage: no se pudo preparar el bucket (${res.status})`);
    })().catch((e) => {
      this.bucketReady = null;
      throw e;
    });
    return this.bucketReady;
  }

  async put(workspaceId: string, folder: string, bytes: Uint8Array, mimeType: string): Promise<StoredObjectRef> {
    await this.ensureBucket();
    const ext = mimeType === "application/pdf" ? ".pdf" : mimeType.startsWith("image/") ? `.${mimeType.split("/")[1]}` : ".bin";
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "_").replace(/^\/+|\.\./g, "");
    const key = `${workspaceId}/${safeFolder}/${randomUUID()}${ext}`;
    const res = await fetch(this.objectUrl(key), { method: "POST", headers: this.headers({ "content-type": mimeType, "x-upsert": "false" }), body: Buffer.from(bytes) });
    if (!res.ok) throw new Error(`Supabase Storage: no se pudo guardar (${res.status})`);
    return { provider: "supabase_storage", bucket: this.bucket, key, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.byteLength };
  }

  async get(ref: Pick<StoredObjectRef, "bucket" | "key">): Promise<Uint8Array> {
    const res = await fetch(this.objectUrl(ref.key), { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase Storage: no se pudo leer (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async remove(ref: Pick<StoredObjectRef, "bucket" | "key">): Promise<void> {
    await fetch(`${this.url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: [ref.key] }),
    });
  }
}
