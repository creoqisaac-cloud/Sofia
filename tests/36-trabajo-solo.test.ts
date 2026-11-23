/**
 * Lo que Sofía hace sola con el WhatsApp vinculado de Mario (runScheduled cada minuto): confirmar citas un día antes,
 * dar seguimiento a quien se quedó callado y mandarle a Mario el resumen del día. WhatsApp simulado; datos inventados.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { runScheduled, trabajoDeFondo, revivirUno, candidatosRevivir } from "../prueba/servidor/core.mjs";

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

describe("trabajo de fondo con IA: ordena los chats solo y aprende de Mario", () => {
  const chats = async (store: ReturnType<typeof memStore>) => {
    await store.put("agente:config", { activo: true, asesor: "Mario Abarca", marca: "Honda", ventas: { activo: true, ia: true } });
    await store.put("inbox:index", {
      "wa:5218111111111": { id: "5218111111111", name: "Ana", lastAt: local(23, 9), lastDir: "in" },
      "wa:5218155555555": { id: "5218155555555", name: "Primo Juan", lastAt: local(23, 8), lastDir: "in" },
    });
    await store.put("inbox:c:wa:5218111111111", [
      { dir: "in", text: "Hola, ¿cuánto cuesta la CR-V?", at: local(23, 8) },
      { dir: "out", text: "Qué tal Ana, la CR-V Turbo está en 822,900 con bono de 50 mil", at: local(23, 8, 5) },
      { dir: "in", text: "Me interesa a crédito", at: local(23, 9) },
    ]);
    await store.put("inbox:c:wa:5218155555555", [{ dir: "in", text: "Primo, ¿vienes a la carne asada el domingo?", at: local(23, 8) }]);
  };
  it("con la IA local: clasifica, resume, separa lo personal y guarda cómo contesta Mario", async () => {
    const store = memStore();
    await chats(store);
    const pedidos: string[] = [];
    const respuesta = (cuerpo: string) => cuerpo.includes("carne asada")
      ? { tipo: "personal", nombre: "Juan", modelo: "", forma_pago: "", calor: "frio", resumen: "Su primo lo invita a una carne asada.", siguiente: "" }
      : { tipo: "cliente", nombre: "Ana", modelo: "CR-V", forma_pago: "credito", calor: "tibio", resumen: "Quiere la CR-V a crédito.", siguiente: "Mandarle la corrida" };
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      pedidos.push(String(url));
      const b = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(respuesta(b.messages.at(-1).content)) } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const env = { LOCAL_AI_URL: "http://ia.local:11434", LOCAL_AI_MODEL: "qwen2.5:3b" };
      expect((await trabajoDeFondo(env, store, new Date(local(23, 10)), { max: 5 })).revisados).toBe(2);
    } finally { globalThis.fetch = fetchOriginal; }
    expect(pedidos.every((u) => u === "http://ia.local:11434/v1/chat/completions")).toBe(true);
    const leads = await store.get("leads:index");
    expect(leads["wa:5218111111111"]).toMatchObject({ tipo: "cliente", personal: false, nombreCliente: "Ana", interes: "Honda CR-V", formaPago: "credito", calor: "tibio", resumen: "Quiere la CR-V a crédito.", siguiente: "Mandarle la corrida", fondoMotor: "local" });
    expect(leads["wa:5218155555555"]).toMatchObject({ tipo: "personal", personal: true });
    expect((await store.get("agente:config")).estilo.deChats[0]).toBe("Cliente: Hola, ¿cuánto cuesta la CR-V? → Mario: Qué tal Ana, la CR-V Turbo está en 822,900 con bono de 50 mil");
    // Ya revisados: no se vuelven a mandar a la IA hasta que haya mensajes nuevos.
    expect((await trabajoDeFondo({ LOCAL_AI_URL: "http://ia.local:11434" }, store, new Date(local(23, 11)))).revisados).toBe(0);
  });
  it("sin IA local usa Cloudflare con tope diario; sin ninguna IA no hace nada", async () => {
    const store = memStore();
    await chats(store);
    expect((await trabajoDeFondo({}, store, new Date(local(23, 10)))).revisados).toBe(0);
    const modelos: string[] = [];
    const AI = { run: async (modelo: string) => { modelos.push(modelo); return { response: { tipo: "cliente", nombre: "", modelo: "", forma_pago: "", calor: "tibio", resumen: "Pregunta precios.", siguiente: "" } }; } };
    await store.put("fondo:conteo", { dia: "2026-11-23", n: 40 });
    expect((await trabajoDeFondo({ AI }, store, new Date(local(23, 10)))).revisados).toBe(0); // tope del día
    await store.put("fondo:conteo", { dia: "2026-11-22", n: 40 });
    expect((await trabajoDeFondo({ AI }, store, new Date(local(23, 10)))).revisados).toBe(1);
    expect(modelos).toEqual(["@cf/meta/llama-3.3-70b-instruct-fp8-fast"]);
  });
});

describe("revivir clientes para sacar citas", () => {
  const preparar = async () => {
    const store = memStore();
    await store.put("agente:config", { activo: true, asesor: "Mario Abarca", marca: "Honda", horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, ventas: { activo: true, ia: true } });
    await store.put("ventas:inventario", [{ id: "crv", marca: "Honda", modelo: "CR-V", anio: 2027, precio: 830900, promo: "bono de 50 mil" }]);
    await store.put("inbox:index", {
      "wa:5218111111111": { id: "5218111111111", name: "Ana López", lastAt: local(19, 12), lastDir: "out" },
      "wa:5218122222222": { id: "5218122222222", name: "Primo", lastAt: local(19, 12), lastDir: "in" },
      "wa:5218133333333": { id: "5218133333333", name: "Raúl", lastAt: local(18, 12), lastDir: "in" },
      "wa:5218144444444": { id: "5218144444444", name: "Hoy", lastAt: local(23, 9), lastDir: "in" },
    });
    await store.put("inbox:c:wa:5218111111111", [{ dir: "in", text: "Precio de la CR-V?", at: local(19, 11) }, { dir: "out", text: "Claro Ana, ¿cuánto darías de enganche?", at: local(19, 12) }]);
    await store.put("inbox:c:wa:5218122222222", [{ dir: "in", text: "Primo, ¿vienes el domingo a la carne asada?", at: local(19, 12) }]);
    await store.put("inbox:c:wa:5218133333333", [{ dir: "in", text: "¿Cómo va mi devolución del apartado?", at: local(18, 12) }]);
    await store.put("inbox:c:wa:5218144444444", [{ dir: "in", text: "Precio del City", at: local(23, 9) }]);
    return store;
  };
  it("elige solo clientes enfriados (ni amigos, ni trámites, ni quien platica hoy)", async () => {
    const lista = await candidatosRevivir(await preparar(), new Date(local(23, 11)));
    expect(lista.map((d: { nombre: string }) => d.nombre)).toEqual(["Ana López"]);
    expect(lista[0]).toMatchObject({ modelo: "CR-V", dias: 4 });
  });
  it("arrancada: le escribe con dos horarios reales y su respuesta queda lista para apartar; parada o fuera de horario no escribe", async () => {
    const store = await preparar();
    const { env, enviados } = conWhatsApp();
    expect(await revivirUno(env, store, new Date(local(23, 11)))).toBe(0); // no la han arrancado
    await store.put("revivir:estado", { activa: true, tope: 60 });
    expect(await revivirUno(env, store, new Date(local(23, 20)))).toBe(0); // 8 pm: fuera de horario
    expect(await revivirUno(env, store, new Date(local(23, 11)))).toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.to).toBe("5218111111111");
    expect(enviados[0]!.text).toMatch(/^¡Hola Ana! 👋 ¿Cómo vas\? Soy Mario Abarca, de Honda\. ¿Sigues buscando la CR-V\? Este mes la CR-V trae bono de 50 mil\./);
    expect(enviados[0]!.text).toMatch(/¿Te queda .+ o .+\?$/);
    expect((await store.get("inbox:index"))["wa:5218111111111"].venta).toMatchObject({ paso: "cita", autoId: "crv", opciones: [expect.stringMatching(/^slot:/), expect.stringMatching(/^slot:/), "otra-hora"] });
    expect((await store.get("leads:index"))?.["wa:5218111111111"]?.revividoAt ?? (await store.get("revivir:estado")).enviados).toBeTruthy();
    // Ya no quedan más clientes: se apaga sola
    expect(await revivirUno(env, store, new Date(local(23, 11, 1)))).toBe(0);
    expect((await store.get("revivir:estado")).activa).toBe(false);
    expect(enviados).toHaveLength(1);
  });
});
