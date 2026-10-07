/**
 * SupabaseStorage contra un servidor local que imita la API de Supabase Storage:
 * bucket privado, autenticación con la llave del servidor, guardar/leer/borrar, llaves opacas.
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseStorage } from "@/server/storage/documents";

const KEY = "service-role-sintetica";
const objects = new Map<string, Buffer>();
const buckets = new Map<string, { public: boolean }>();
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (req.headers.authorization !== `Bearer ${KEY}` || req.headers.apikey !== KEY) return res.writeHead(401).end();
      const url = decodeURIComponent(req.url ?? "");
      if (req.method === "POST" && url === "/storage/v1/bucket") {
        const b = JSON.parse(body.toString()) as { id: string; public: boolean };
        if (buckets.has(b.id)) return res.writeHead(409).end();
        buckets.set(b.id, { public: b.public });
        return res.writeHead(200).end("{}");
      }
      const m = url.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.+))?$/);
      if (!m) return res.writeHead(404).end();
      const [, bucket, key] = m;
      if (req.method === "POST" && key) {
        objects.set(`${bucket}/${key}`, body);
        return res.writeHead(200).end("{}");
      }
      if (req.method === "GET" && key) {
        const o = objects.get(`${bucket}/${key}`);
        return o ? res.writeHead(200).end(o) : res.writeHead(404).end();
      }
      if (req.method === "DELETE" && !key) {
        for (const p of (JSON.parse(body.toString()) as { prefixes: string[] }).prefixes) objects.delete(`${bucket}/${p}`);
        return res.writeHead(200).end("[]");
      }
      res.writeHead(400).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("SupabaseStorage", () => {
  it("crea el bucket PRIVADO, guarda, lee y borra con llaves opacas", async () => {
    const st = new SupabaseStorage(base, KEY, "sofia-docs");
    const bytes = new TextEncoder().encode("%PDF-1.4 sintetico");
    const ref = await st.put("ws-1", "customers/c-1", bytes, "application/pdf");
    expect(buckets.get("sofia-docs")).toEqual({ public: false });
    expect(ref).toMatchObject({ provider: "supabase_storage", bucket: "sofia-docs", sizeBytes: bytes.byteLength });
    expect(ref.key).toMatch(/^ws-1\/customers\/c-1\/[0-9a-f-]{36}\.pdf$/);
    expect(Buffer.from(await st.get(ref)).toString()).toBe("%PDF-1.4 sintetico");
    // Segundo uso: el bucket ya existe (409) y sigue funcionando
    const ref2 = await new SupabaseStorage(base, KEY, "sofia-docs").put("ws-1", "x", bytes, "image/png");
    expect(ref2.key).toMatch(/\.png$/);
    await st.remove(ref);
    await expect(st.get(ref)).rejects.toThrow(/404/);
  });

  it("llave incorrecta: error claro, no guarda nada", async () => {
    const st = new SupabaseStorage(base, "llave-mala", "otro-bucket");
    await expect(st.put("ws", "f", new Uint8Array([1]), "image/png")).rejects.toThrow(/bucket/);
  });
});
