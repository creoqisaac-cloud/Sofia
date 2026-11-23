/**
 * Lo que Sofía hace sola con el WhatsApp vinculado de Mario (runScheduled cada minuto): confirmar citas un día antes,
 * dar seguimiento a quien se quedó callado y mandarle a Mario el resumen del día. WhatsApp simulado; datos inventados.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { runScheduled } from "../prueba/servidor/core.mjs";

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
  const env = { SOFIA_TOKEN: "clave", WA_WEB: { estado: () => ({ ok: true, phone: MARIO }), enviar: async (b: { to: string; text: string }) => { enviados.push({ to: String(b.to), text: b.text }); return `id-${enviados.length}`; } } };
  return { env, enviados };
};
// Lunes 23 nov 2026; Monterrey es UTC-6.
const local = (dia: number, hora: number, min = 0) => new Date(Date.UTC(2026, 10, dia, hora + 6, min)).toISOString();

async function sembrar(store: ReturnType<typeof memStore>) {
  await store.put("leads:index", {
    "wa:5218111111111": { canal: "wa", id: "5218111111111", nombre: "Ana López", interes: "Honda CR-V 2027", calor: "tibio", at: local(22, 11) },
    "wa:5218122222222": { canal: "wa", id: "5218122222222", nombre: "Beto", interes: "Honda City 2026", postventa: true, at: local(22, 11) },
    "wa:5218133333333": { canal: "wa", id: "5218133333333", nombre: "Carla", interes: "Honda Civic 2026", at: local(22, 11) },
    "wa:5218144444444": { canal: "wa", id: "5218144444444", nombre: "Dani", interes: "Honda HR-V 2027", calor: "caliente", at: local(23, 8) },
  });
  await store.put("inbox:index", {
    "wa:5218111111111": { channel: "wa", id: "5218111111111", name: "Ana", lastDir: "out", lastAt: local(22, 11, 5), lastInAt: local(22, 11) },
    "wa:5218122222222": { channel: "wa", id: "5218122222222", name: "Beto", lastDir: "out", lastAt: local(22, 11, 5), lastInAt: local(22, 11) },
    // Carla: Mario le contestó a mano, él la lleva.
    "wa:5218133333333": { channel: "wa", id: "5218133333333", name: "Carla", lastDir: "out", lastAt: local(22, 12), lastInAt: local(22, 11), lastManualAt: local(22, 12) },
    "wa:5218144444444": { channel: "wa", id: "5218144444444", name: "Dani", lastDir: "in", lastAt: local(23, 8), lastInAt: local(23, 8) },
  });
  await store.put("agenda:citas", [
    { id: new Date(Date.UTC(2026, 10, 24, 19)).toISOString(), texto: "mañana martes a la 1 pm", canal: "wa", cliente: "5218144444444", nombre: "Dani Pérez", interes: "Honda HR-V 2027", creada: local(20, 10), estado: "apartada" },
    { id: new Date(Date.UTC(2026, 10, 23, 23)).toISOString(), texto: "hoy a las 5 pm", canal: "wa", cliente: "5218155555555", nombre: "Eva", interes: "Honda City 2026", creada: local(21, 10), estado: "apartada" },
  ]);
}

describe("Sofía trabaja sola con el WhatsApp de Mario", () => {
  it("a las 9 am le manda a Mario su día, una sola vez", async () => {
    const store = memStore();
    await sembrar(store);
    const { env, enviados } = conWhatsApp();
    await runScheduled(env, store, local(23, 8, 59));
    expect(enviados.filter((x) => x.to === MARIO)).toEqual([]);
    await runScheduled(env, store, local(23, 9, 1));
    const resumen = enviados.filter((x) => x.to === MARIO);
    expect(resumen).toHaveLength(1);
    expect(resumen[0]!.text).toMatch(/^☀️ Buenos días, Mario\. Así va tu día:/);
    expect(resumen[0]!.text).toContain("📅 Citas hoy (1):\n• 5 pm · Eva (City 2026)");
    expect(resumen[0]!.text).toContain("💬 Esperan respuesta (1): Dani");
    expect(resumen[0]!.text).toContain("🔥 Calientes (1): Dani");
    await runScheduled(env, store, local(23, 9, 30));
    expect(enviados.filter((x) => x.to === MARIO)).toHaveLength(1);
  });

  it("seguimiento: al día siguiente y a los 3 días, solo a quien toca, y luego ya no", async () => {
    const store = memStore();
    await sembrar(store);
    await store.put("resumen:enviado", "2026-11-23"); // para ver solo los seguimientos
    const { env, enviados } = conWhatsApp();
    const aClientes = () => enviados.filter((x) => x.to !== MARIO && !x.text.includes("cita"));
    await runScheduled(env, store, local(23, 9, 30)); // antes de las 10: no se le escribe a clientes
    expect(aClientes()).toEqual([]);
    await runScheduled(env, store, local(23, 11));
    expect(aClientes()).toHaveLength(1);
    expect(aClientes()[0]!.to).toBe("5218111111111"); // ni postventa (Beto), ni la que lleva Mario (Carla), ni quien espera respuesta (Dani)
    expect(aClientes()[0]!.text).toMatch(/^(¡Hola Ana! ¿Pudiste ver lo de la CR-V\?|Hola Ana, ¿cómo vas\? Me quedé pendiente de la CR-V\.)/);
    await runScheduled(env, store, local(23, 11, 1));
    await runScheduled(env, store, local(25, 11));
    expect(aClientes()).toHaveLength(1); // apenas van 2 días
    await runScheduled(env, store, local(26, 11, 5));
    expect(aClientes()).toHaveLength(2);
    expect(aClientes()[1]!.text).toMatch(/^Hola Ana, no te quiero molestar 🙂 Sigo a tus órdenes con la CR-V/);
    await runScheduled(env, store, local(30, 11));
    expect(aClientes()).toHaveLength(2); // máximo dos veces
  });

  it("un día antes confirma la cita con el cliente", async () => {
    const store = memStore();
    await sembrar(store);
    await store.put("resumen:enviado", "2026-11-23");
    const { env, enviados } = conWhatsApp();
    await runScheduled(env, store, local(23, 12));
    const conf = enviados.filter((x) => x.to === "5218144444444");
    expect(conf).toEqual([{ to: "5218144444444", text: "¡Hola Dani! Te escribo para confirmar tu cita de mañana a la 1 pm para que veas la HR-V. ¿Sigue en pie? 🙌" }]);
    await runScheduled(env, store, local(23, 13));
    expect(enviados.filter((x) => x.to === "5218144444444")).toHaveLength(1);
  });
});
