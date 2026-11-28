/**
 * Difusión desde Sofía web: Mario elige a quién (mes, modelo, calor) y qué; el servidor manda uno por uno.
 * WhatsApp simulado; datos inventados.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { handle, difundirUnos } from "../prueba/servidor/core.mjs";

const MARIO = "5218110000000";
const memStore = () => {
  const m = new Map<string, string>();
  return {
    async get(k: string) { return m.has(k) ? JSON.parse(m.get(k)!) : null; },
    async put(k: string, v: unknown) { m.set(k, JSON.stringify(v)); },
  };
};
const conWhatsApp = () => {
  const enviados: { to: string; text: string }[] = [];
  const env = { SOFIA_TOKEN: "clave", SIN_ESPERA: "1", WA_WEB: { estado: () => ({ ok: true, phone: MARIO }), enviar: async (b: { to: string; text: string }) => { enviados.push({ to: String(b.to), text: b.text }); return `id-${enviados.length}`; } } };
  return { env, enviados };
};
// Lunes 23 nov 2026, 11 am en Monterrey (UTC-6).
const AHORA = "2026-11-23T17:00:00.000Z";
const post = (body: object) => new Request("http://x/api/difusion", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ token: "clave", ...body }) });

async function sembrar(store: ReturnType<typeof memStore>) {
  await store.put("leads:index", {
    "wa:5218111111111": { nombre: "Ana López", interes: "Honda CR-V 2027", at: "2026-11-05T17:00:00Z" },
    "wa:5218122222222": { nombre: "Beto", interes: "Honda City 2026", at: "2026-11-06T17:00:00Z", calor: "caliente" },
    "wa:5218133333333": { nombre: "Carla", interes: "Honda CR-V 2027", at: "2026-10-10T17:00:00Z" },
    "wa:5218144444444": { nombre: "Primo Dani", personal: true, tipo: "personal", at: "2026-11-02T17:00:00Z" },
    "wa:5218155555555": { nombre: "Eva", interes: "Honda CR-V 2027", postventa: true, tipo: "postventa", at: "2026-11-03T17:00:00Z" },
    "wa:5218166666666": { nombre: "Fer", interes: "Honda CR-V 2027", noPromociones: true, at: "2026-11-04T17:00:00Z" },
  });
  const idx: Record<string, object> = {};
  for (const n of ["1", "2", "3", "4", "5", "6"]) idx[`wa:52181${n.repeat(8)}`] = { channel: "wa", id: `52181${n.repeat(8)}`, lastDir: "out", lastAt: "2026-11-15T17:00:00Z" };
  await store.put("inbox:index", idx);
}

describe("difusión", () => {
  it("filtra por mes y modelo, sin amigos, postventa ni quien pidió que no le escriban", async () => {
    const store = memStore();
    const { env } = conWhatsApp();
    await sembrar(store);
    const todos = await (await handle(post({ accion: "ver", filtros: {}, mensaje: "Hola {nombre}" }), env, store, { ahora: AHORA })).json();
    expect(todos.lista.map((x: { nombre: string }) => x.nombre).sort()).toEqual(["Ana López", "Beto", "Carla"]);
    const nov = await (await handle(post({ accion: "ver", filtros: { mes: 11, modelo: "CR-V" }, mensaje: "¡Hola {nombre}! ¿Sigues buscando {modelo}?" }), env, store, { ahora: AHORA })).json();
    expect(nov.lista.map((x: { nombre: string }) => x.nombre)).toEqual(["Ana López"]);
    expect(nov.ejemplo).toBe("¡Hola Ana! ¿Sigues buscando la CR-V?");
    const calientes = await (await handle(post({ accion: "ver", filtros: { calor: "caliente" } }), env, store, { ahora: AHORA })).json();
    expect(calientes.total).toBe(1);
  });

  it("manda solo a los que Mario dejó palomeados, 3 por minuto, respeta «Parar» y no repite", async () => {
    const store = memStore();
    const { env, enviados } = conWhatsApp();
    await sembrar(store);
    const r = await (await handle(post({ accion: "iniciar", filtros: {}, mensaje: "¡Hola {nombre}! Promo de noviembre 🔥", claves: ["wa:5218111111111", "wa:5218122222222"] }), env, store, { ahora: AHORA })).json();
    expect(r.actual).toMatchObject({ total: 2, estado: "enviando" });
    // Otra difusión mientras hay una en marcha: no.
    expect((await handle(post({ accion: "iniciar", filtros: {}, mensaje: "otra cosa aquí" }), env, store, { ahora: AHORA })).status).toBe(409);
    await handle(post({ accion: "parar" }), env, store, { ahora: AHORA });
    expect(await difundirUnos(env, store, new Date(AHORA))).toBe(0);
    await handle(post({ accion: "seguir" }), env, store, { ahora: AHORA });
    expect(await difundirUnos(env, store, new Date(AHORA))).toBe(2);
    expect(enviados.filter((m) => m.to !== MARIO).map((m) => m.text)).toEqual(["¡Hola Ana! Promo de noviembre 🔥", "¡Hola Beto! Promo de noviembre 🔥"]);
    expect(enviados.at(-1)).toMatchObject({ to: MARIO }); // terminó y le avisó a Mario
    expect((await (await handle(post({ accion: "estado" }), env, store, { ahora: AHORA })).json()).actual.estado).toBe("terminada");
    // A los que ya les llegó no se les vuelve a mandar en 3 días.
    const otra = await (await handle(post({ accion: "ver", filtros: {} }), env, store, { ahora: "2026-11-24T17:00:00Z" })).json();
    expect(otra.lista.map((x: { nombre: string }) => x.nombre)).toEqual(["Carla"]);
  });

  it("fuera de horario no manda (queda en cola)", async () => {
    const store = memStore();
    const { env, enviados } = conWhatsApp();
    await sembrar(store);
    await handle(post({ accion: "iniciar", filtros: {}, mensaje: "Hola {nombre}, promo" }), env, store, { ahora: AHORA });
    expect(await difundirUnos(env, store, new Date("2026-11-24T04:00:00Z"))).toBe(0); // 10 pm
    expect(enviados).toHaveLength(0);
  });
});
