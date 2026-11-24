/**
 * Modo Jarvis: lo que Mario le dice a Sofía (recordatorios, notas, preguntas, apágate) y los avisos a Mario cuando
 * un cliente pide algo que Sofía no puede dar. WhatsApp simulado; datos inventados.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { entenderOrden, leerCuando, cuandoTexto, peticionesDe, buscarCliente } from "../prueba/js/jarvis.js";
// @ts-expect-error módulo JS sin tipos
import { ordenJarvis, runScheduled, eventoVinculado } from "../prueba/servidor/core.mjs";

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
// Lunes 23 nov 2026, 3 pm en Monterrey (UTC-6).
const AHORA = new Date("2026-11-23T21:00:00Z");

describe("jarvis · entiende a Mario sin IA", () => {
  it("fechas en español: mañana, en 2 horas, el jueves en la tarde, el 28, a las 4 (de la tarde)", () => {
    const c = (t: string) => { const r = leerCuando(t, AHORA.getTime()); return r ? cuandoTexto(r.at, AHORA) : null; };
    expect(c("mañana a las 10")).toBe("mañana 10:00 am");
    expect(c("en 2 horas")).toBe("hoy 5:00 pm");
    expect(c("en media hora")).toBe("hoy 3:30 pm");
    expect(c("el jueves en la tarde")).toBe("jue 26 nov 4:00 pm");
    expect(c("el 28 a las 4:30 pm")).toBe("sáb 28 nov 4:30 pm");
    expect(c("a las 4")).toBe("hoy 4:00 pm");
    expect(c("a las 10")).toBe("mañana 10:00 am"); // ya pasaron las 10 de hoy
    expect(c("mañana en la mañana")).toBe("mañana 10:00 am");
    expect(c("marcarle a Juan")).toBeNull();
  });

  it("órdenes: recordar, notas, apágate, citas, cliente, personal, masivo", () => {
    const o = (t: string) => entenderOrden(t, AHORA.getTime());
    expect(o("sofia recuérdame marcarle a Juan mañana a las 10")).toMatchObject({ accion: "recordar", texto: "Marcarle a Juan" });
    expect(o("recuérdame marcarle a Juan")).toMatchObject({ accion: "falta-cuando", texto: "Marcarle a Juan" });
    expect(o("anota que Ana quiere la CR-V blanca")).toMatchObject({ accion: "nota", texto: "Ana quiere la CR-V blanca" });
    expect(o("apágate")).toMatchObject({ accion: "apagar" });
    expect(o("préndete")).toMatchObject({ accion: "prender" });
    expect(o("¿quién tiene cita mañana?")).toMatchObject({ accion: "citas", dia: 1 });
    expect(o("qué onda con Rosaura")).toMatchObject({ accion: "cliente" });
    expect(o("Pedro es mi amigo")).toMatchObject({ accion: "personal" });
    expect(o("háblale a los interesados en CR-V")).toMatchObject({ accion: "masivo" });
    expect(o("listo 2")).toMatchObject({ accion: "hecho", n: 2 });
    expect(o("hola cómo estás")).toBeNull();
  });

  it("peticiones que solo Mario resuelve (casos reales)", () => {
    const p = (t: string) => peticionesDe(t).map((x: { id: string }) => x.id);
    expect(p("Buen día Mario solo para comentarle que aún no veo reflejado el depósito")).toEqual(["reembolso"]);
    expect(p("Toman carro con adeudo se paga y el resto de enganche")).toEqual(["valuacion"]);
    expect(p("cuánto me dan por mi carro?")).toEqual(["valuacion"]);
    expect(p("Quería preguntar si hubo respuesta de la aprobación del crédito?")).toEqual(["credito"]);
    expect(p("márcame porfa")).toEqual(["llamada"]);
    expect(p("no voy a poder llegar a la cita")).toEqual(["cita"]);
    expect(p("Busco una CRV híbrida")).toEqual([]);
  });

  it("encuentra al cliente por nombre o por los últimos 4 dígitos", () => {
    const leads = { "wa:5218116350285": { nombreCliente: "Rosaura" }, "wa:5218111112222": { nombre: "Juan Pérez" } };
    expect(buscarCliente("marcarle a Rosaura", leads)?.clave).toBe("wa:5218116350285");
    expect(buscarCliente("háblale al 2222", leads)?.clave).toBe("wa:5218111112222");
    expect(buscarCliente("ir al banco", leads)).toBeNull();
  });
});

describe("jarvis · en el servidor", () => {
  it("recordatorio con cliente: se guarda, a la hora le llega a Mario por WhatsApp y «listo» lo quita", async () => {
    const store = memStore();
    const { env, enviados } = conWhatsApp();
    await store.put("leads:index", { "wa:5218116350285": { canal: "wa", id: "5218116350285", nombreCliente: "Rosaura", interes: "Honda City 2026", resumen: "Quiere City automático, en plan" } });
    const r = await ordenJarvis(env, store, "recuérdame marcarle a Rosaura mañana a las 10", AHORA);
    expect(r.respuesta).toContain("mañana 10:00 am");
    expect(r.respuesta).toContain("Rosaura");
    await runScheduled(env, store, "2026-11-24T15:59:00Z"); // 9:59 am: todavía no
    expect(enviados.filter((m) => m.to === MARIO && m.text.includes("Recordatorio"))).toHaveLength(0);
    await runScheduled(env, store, "2026-11-24T16:00:30Z");
    const aviso = enviados.filter((m) => m.to === MARIO && m.text.includes("Recordatorio"));
    expect(aviso).toHaveLength(1);
    expect(aviso[0].text).toContain("Marcarle a Rosaura");
    expect(aviso[0].text).toContain("wa.me/5218116350285");
    await runScheduled(env, store, "2026-11-24T16:01:30Z");
    expect(enviados.filter((m) => m.to === MARIO && m.text.includes("Recordatorio"))).toHaveLength(1); // no se repite
    expect((await ordenJarvis(env, store, "listo", new Date("2026-11-24T16:05:00Z"))).respuesta).toContain("Hecho");
    expect((await ordenJarvis(env, store, "recordatorios", new Date("2026-11-24T16:06:00Z"))).respuesta).toContain("No tienes");
  });

  it("sin «cuándo» pregunta y la siguiente orden lo completa", async () => {
    const store = memStore();
    const { env } = conWhatsApp();
    expect((await ordenJarvis(env, store, "recuérdame mandar la corrida a Ana", AHORA)).tipo).toBe("pregunta");
    const r = await ordenJarvis(env, store, "en 2 horas", AHORA);
    expect(r.tipo).toBe("recordatorio");
    expect(r.respuesta).toContain("hoy 5:00 pm");
  });

  it("apágate apaga respuestas y Revivir; notas van a la ficha; «es mi amigo» lo saca de ventas", async () => {
    const store = memStore();
    const { env } = conWhatsApp();
    await store.put("revivir:estado", { activa: true });
    await store.put("leads:index", { "wa:5218111112222": { nombre: "Pedro Gómez" }, "wa:5218133334444": { nombreCliente: "Ana" } });
    await ordenJarvis(env, store, "apágate", AHORA);
    expect((await store.get("agente:config")).activo).toBe(false);
    expect((await store.get("revivir:estado")).activa).toBe(false);
    await ordenJarvis(env, store, "anota que Ana quiere la CR-V blanca", AHORA);
    expect((await store.get("leads:index"))["wa:5218133334444"].notas[0].texto).toBe("Ana quiere la CR-V blanca");
    await ordenJarvis(env, store, "Pedro es mi amigo", AHORA);
    expect((await store.get("leads:index"))["wa:5218111112222"]).toMatchObject({ personal: true, tipoManual: true });
    expect((await ordenJarvis(env, store, "qué onda con Ana", AHORA)).respuesta).toContain("CR-V blanca");
  });

  it("con Sofía prendida tampoco llegan dos avisos del mismo reembolso", async () => {
    const store = memStore();
    const { env, enviados } = conWhatsApp();
    const at = new Date();
    await eventoVinculado({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: "5218113963409", profile: { name: "Cliente" } }], messages: [{ id: "x1", from: "5218113963409", type: "text", timestamp: String(Math.floor(at.getTime() / 1000)), text: { body: "aún no veo reflejado el depósito de la devolución" } }] } }] }] }, env, store);
    expect(enviados.filter((m) => m.to === MARIO)).toHaveLength(1);
  });

  it("cliente pide reembolso: aviso a Mario aunque Sofía esté apagada, una sola vez, y al cliente nada", async () => {
    const store = memStore();
    const { env, enviados } = conWhatsApp();
    await store.put("agente:config", { activo: false, marca: "Honda", asesor: "Mario Abarca", perfil: 5 });
    const msg = (id: string, body: string, at: Date) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: "5218113963409", profile: { name: "Cliente Devolución" } }], messages: [{ id, from: "5218113963409", type: "text", timestamp: String(Math.floor(at.getTime() / 1000)), text: { body } }] } }] }] });
    const ahora = new Date();
    await eventoVinculado(msg("m1", "aún no veo reflejado el depósito de la devolución", ahora), env, store);
    await eventoVinculado(msg("m2", "¿me mandas el comprobante de la devolución?", new Date(ahora.getTime() + 1000)), env, store);
    const avisos = enviados.filter((m) => m.to === MARIO);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].text).toContain("REEMBOLSO");
    expect(enviados.filter((m) => m.to !== MARIO)).toHaveLength(0);
  });
});
