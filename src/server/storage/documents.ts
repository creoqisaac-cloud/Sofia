/**
 * Almacenamiento PRIVADO de documentos (INE, comprobantes…).
 *
 * - El contenido nunca va a la base de datos ni a prompts ni a logs.
 * - En BD solo se guarda la referencia (proveedor, bucket, llave), hash y estado.
 * - Local: carpeta fuera de /public, nunca servida estáticamente.
 * TODO(siguiente sprint): SupabaseStorage con bucket privado + URLs firmadas de corta vida,
 * cifrado en reposo y política de retención.
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
