/**
 * Sofía vendedora (prueba/js/vendedor.js): asistente de ventas de autos sin IA. Es el mismo módulo que usan el
 * conector (WhatsApp/Messenger reales), el simulador de la app y la demo de la página de ventas.
 * Inventario y personas inventados.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { decidir, leerEnganche, buscarAutos, mensualidad, textoHorario, MAX_POR_HORA, promptIA, aplicarIA } from "../prueba/js/vendedor.js";

type Respuesta = { texto: string; foto?: string };
type Resultado = { respuestas: Respuesta[]; conv: Record<string, unknown>; lead: Record<string, unknown>; motivo: string };

const INVENTARIO = [
  { id: "crv", marca: "Honda", modelo: "CR-V", version: "Touring", anio: 2026, precio: 689900, tipo: "nuevo", transmision: "Automática", color: "Blanco", foto: "https://x.test/media/crv" },
  { id: "city", marca: "Honda", modelo: "City", version: "Sport", anio: 2025, precio: 389900, tipo: "nuevo" },
  { id: "versa", marca: "Nissan", modelo: "Versa", version: "Advance", anio: 2022, precio: 269000, tipo: "seminuevo", km: 41000, palabras: ["versita"] },
  { id: "vendido", marca: "Mazda", modelo: "CX-5", anio: 2021, precio: 399000, tipo: "seminuevo", disponible: false },
];
const CFG = { asesor: "Pedro", agencia: "Honda Ejemplo", horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, reglas: [{ palabras: ["ubicación"], respuesta: "Estamos en Av. Ejemplo 123." }] };
const T0 = Date.parse("2026-11-09T16:00:00Z");

/** Conversación completa: cada mensaje recibe el estado que dejó el anterior. */
function charla(mensajes: string[], o: { cfg?: Record<string, unknown>; inventario?: unknown[]; enHorario?: boolean; nombre?: string } = {}) {
  let conv = {};
  const lead: Record<string, unknown> = {};
  const pasos: Resultado[] = [];
  mensajes.forEach((texto, i) => {
    const r: Resultado = decidir({ cfg: o.cfg ?? CFG, inventario: o.inventario ?? INVENTARIO, conv, msg: { texto, nombre: o.nombre ?? "ANA López", primero: i === 0, enHorario: o.enHorario ?? true }, ahora: new Date(T0 + i * 60_000) });
    conv = r.conv;
    Object.assign(lead, r.lead);
    pasos.push(r);
  });
  const ultimo = pasos.at(-1)!;
  const paso = (i: number) => pasos[i]!;
  const txt = (i: number) => paso(i).respuestas.map((x) => x.texto).join("\n");
  return { pasos, paso, txt, lead, conv, ultimo, texto: ultimo.respuestas.map((x) => x.texto).join("\n") };
}

describe("vendedora · conversación", () => {
  it("se presenta con el nombre del cliente y muestra el menú", () => {
    const { ultimo, texto } = charla(["Hola, buenas tardes"]);
    expect(ultimo.motivo).toBe("menu");
    expect(texto).toMatch(/^¡Hola Ana! 👋 Soy Sofía, asistente de Pedro en Honda Ejemplo\./);
    expect(texto).toContain("1️⃣ Ver autos disponibles");
    expect(texto).toContain("4️⃣ Hablar con Pedro");
  });

  it("menú → lista → ficha con foto y precio → cotización → cita: el prospecto queda completo", () => {
    const r = charla(["Hola", "1", "1", "1", "30%", "1", "el sábado a las 11"]);
    expect(r.txt(1)).toContain("1️⃣ *Honda CR-V Touring 2026* — $689,900");
    expect(r.txt(1)).not.toContain("CX-5"); // el que no está disponible no se ofrece
    expect(r.paso(2).respuestas[0]).toMatchObject({ foto: "https://x.test/media/crv" });
    expect(r.txt(2)).toContain("💵 *$689,900* de contado");
    expect(r.paso(4).motivo).toBe("cotizacion");
    expect(r.txt(4)).toContain(`• 60 meses: *$${Math.round(mensualidad(689900 * 0.7, 15.9, 60)).toLocaleString("es-MX")}*`);
    expect(r.ultimo.respuestas[0]!.texto).toBe("¡Listo, Ana! ✅ Anoté tu visita: *el sábado a las 11* para la *Honda CR-V Touring 2026*. Pedro te confirma en breve.");
    expect(r.lead).toMatchObject({ autoId: "crv", interes: "Honda CR-V Touring 2026", precio: 689900, formaPago: "credito", enganche: 206970, plazo: 60, cita: "el sábado a las 11", quiereAsesor: true, calor: "caliente" });
  });

  it("el primer mensaje que ya nombra el auto recibe saludo + ficha (por apodo o con guion distinto)", () => {
    const crv = charla(["¿Cuánto cuesta la crv?"]);
    expect(crv.ultimo.motivo).toBe("auto");
    expect(crv.texto).toMatch(/^¡Hola Ana!.*\n\n🚗 \*Honda CR-V Touring 2026\*/s);
    expect(charla(["info de la versita"]).lead).toMatchObject({ autoId: "versa" });
    expect(charla(["tienen la CX-5?"]).ultimo.motivo).not.toBe("auto"); // vendida: no se ofrece
  });

  it("marca sola o varios modelos → lista corta; seminuevos se filtran", () => {
    const honda = charla(["Hola", "¿qué Honda tienen?"]);
    expect(honda.ultimo.motivo).toBe("lista");
    expect(honda.texto).toContain("CR-V");
    expect(honda.texto).toContain("City");
    expect(honda.texto).not.toContain("Versa");
    const semi = charla(["Hola", "¿qué seminuevos tienen?"]);
    expect(semi.texto).toContain("Estos son los seminuevos disponibles:");
    expect(semi.texto).toContain("Versa");
    expect(semi.texto).not.toContain("CR-V");
  });

  it("crédito sin auto pregunta para cuál; con el monto ya dicho cotiza directo; cambiar el enganche recotiza", () => {
    const sinAuto = charla(["Hola", "quiero un crédito", "2"]);
    expect(sinAuto.txt(1)).toContain("¿Para qué auto quieres la cotización?");
    expect(sinAuto.ultimo.respuestas[0]!.texto).toContain("¿cuánto te gustaría dar de enganche?");
    expect(sinAuto.lead).toMatchObject({ autoId: "city", formaPago: "credito" });
    const directo = charla(["Hola", "cotízame la City a crédito con 100 mil de enganche", "mejor 150 mil"]);
    expect(directo.paso(1).motivo).toBe("cotizacion");
    expect(directo.txt(1)).toContain("Con $100,000 de enganche para la *Honda City Sport 2025*");
    expect(directo.ultimo.motivo).toBe("cotizacion");
    expect(directo.lead).toMatchObject({ enganche: 150000 });
  });

  it("enganche menor al mínimo se ajusta y lo avisa; si alcanza para todo, es de contado", () => {
    const poco = charla(["Hola", "versa", "1", "10 mil"]);
    expect(poco.ultimo.respuestas[0]!.texto).toContain("El enganche mínimo es de 20% ($53,800)");
    expect(poco.lead).toMatchObject({ enganche: 53800 });
    const todo = charla(["Hola", "versa", "1", "300 mil"]);
    expect(todo.ultimo.respuestas[0]!.texto).toContain("¡Con eso la pagas de contado! 🎉");
    expect(todo.lead).toMatchObject({ formaPago: "contado" });
  });

  it("pedir asesor lo pasa a la persona y Sofía se calla en esa conversación (salvo «menú»)", () => {
    const r = charla(["Hola", "quiero hablar con un asesor", "¿sigues ahí?", "menú"]);
    expect(r.paso(1).motivo).toBe("asesor");
    expect(r.txt(1)).toContain("Le aviso a Pedro para que te escriba en breve");
    expect(r.paso(2)).toMatchObject({ motivo: "con-asesor", respuestas: [] });
    expect(r.ultimo.motivo).toBe("menu");
    expect(r.lead).toMatchObject({ quiereAsesor: true, calor: "caliente" });
  });

  it("fuera de horario lo dice al saludar y al pasar con el asesor", () => {
    const r = charla(["Hola", "4"], { enHorario: false });
    expect(r.txt(0)).toContain("Ahorita estamos fuera de horario (lun a sáb de 9:00 a 19:00), pero yo te ayudo");
    expect(r.texto).toContain("en cuanto abramos (lun a sáb de 9:00 a 19:00)");
  });

  it("las respuestas propias del asesor (reglas) siguen funcionando", () => {
    expect(charla(["Hola", "¿cuál es su ubicación?"]).texto).toBe("Estamos en Av. Ejemplo 123.");
  });

  it("si no entiende dos veces, pasa con el asesor en vez de dar vueltas", () => {
    const r = charla(["Hola", "asdfgh", "qwerty"]);
    expect(r.paso(1).motivo).toBe("no-entendi");
    expect(r.txt(1)).toContain("no te entendí");
    expect(r.ultimo.motivo).toBe("no-entendi");
    expect(r.ultimo.respuestas[0]!.texto).toContain("Le aviso a Pedro");
    expect(r.lead).toMatchObject({ quiereAsesor: true });
  });

  it("cita: una fecha clara se anota a la primera; si no, pregunta una vez y luego anota lo que diga", () => {
    expect(charla(["Hola", "¿puedo ir a ver la City el sábado a las 10?"]).lead).toMatchObject({ autoId: "city", cita: "¿puedo ir a ver la City el sábado a las 10?" });
    const r = charla(["Hola", "3", "no sé", "cuando ustedes digan"]);
    expect(r.txt(2)).toContain("¿Qué día y a qué hora te acomoda?");
    expect(r.lead).toMatchObject({ cita: "cuando ustedes digan" });
  });

  it("sin inventario no inventa: pasa la pregunta al asesor", () => {
    const r = charla(["Hola, ¿qué precio tiene la CR-V?"], { inventario: [] });
    expect(r.ultimo.motivo).toBe("asesor");
    expect(r.texto).toContain("Pedro te pasa precio y disponibilidad");
    expect(r.texto).not.toMatch(/\$\d/);
  });

  it("freno: con otro bot del otro lado no contesta más de MAX_POR_HORA veces por hora", () => {
    let conv = {};
    let enviados = 0;
    for (let i = 0; i < MAX_POR_HORA + 5; i++) {
      const r: Resultado = decidir({ cfg: CFG, inventario: INVENTARIO, conv, msg: { texto: "menú", primero: i === 0, enHorario: true }, ahora: new Date(T0 + i * 1000) });
      conv = r.conv;
      enviados += r.respuestas.length;
    }
    expect(enviados).toBe(MAX_POR_HORA);
  });

  it("nunca truena: un inventario raro termina en pasar con el asesor", () => {
    const raro = [{ id: "x", modelo: "Raro", precio: "no es número" }, null, { id: "y" }];
    const r: Resultado = decidir({ cfg: CFG, inventario: raro, conv: {}, msg: { texto: "raro", primero: true, enHorario: true } });
    expect(r.respuestas.length).toBeGreaterThan(0);
  });
});

describe("vendedora · piezas", () => {
  it("lee el enganche como lo escribe la gente", () => {
    expect(leerEnganche("20%", 500000)).toBe(100000);
    expect(leerEnganche("el 30 por ciento", 500000)).toBe(150000);
    expect(leerEnganche("150 mil", 500000)).toBe(150000);
    expect(leerEnganche("$80,000", 500000)).toBe(80000);
    expect(leerEnganche("1.2 millones", 5e6)).toBe(1.2e6);
    expect(leerEnganche("150", 500000)).toBe(150000); // sin unidad: miles
    expect(leerEnganche("25", 500000)).toBe(125000); // sin unidad y menos de 100: porcentaje
    expect(leerEnganche("sin enganche", 500000)).toBe(0);
    expect(leerEnganche("no sé", 500000)).toBeNull();
  });

  it("busca por modelo sin importar acentos, guiones o mayúsculas, y por año si hay varios", () => {
    const inv = [...INVENTARIO, { id: "city24", marca: "Honda", modelo: "City", anio: 2024, precio: 300000 }];
    expect(buscarAutos("la CR V no, la crv", inv).map((a: { id: string }) => a.id)).toEqual(["crv"]);
    expect(buscarAutos("city", inv)).toHaveLength(2);
    expect(buscarAutos("city 2024", inv).map((a: { id: string }) => a.id)).toEqual(["city24"]);
    expect(buscarAutos("me gusta el rio", inv)).toEqual([]);
  });

  it("mensualidad con amortización francesa y horario legible", () => {
    expect(Math.round(mensualidad(100000, 12, 12))).toBe(8885);
    expect(mensualidad(120000, 0, 12)).toBe(10000);
    expect(textoHorario({ dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" })).toBe("lun a sáb de 9:00 a 19:00");
    expect(textoHorario({ dias: [0, 1, 2, 3, 4, 5, 6], inicio: "00:00", fin: "00:00" })).toBe("todos los días, todo el día");
    expect(textoHorario({ dias: [1, 3, 5], inicio: "10:00", fin: "14:00" })).toBe("lun, mié, vie de 10:00 a 14:00");
  });
});

describe("vendedora · IA opcional", () => {
  it("el prompt lleva inventario disponible, reglas del asesor y crédito de referencia; la charla empieza con el cliente", () => {
    const { system, messages } = promptIA({ cfg: { ...CFG, ventas: { tasaAnual: 13.5 } }, inventario: INVENTARIO, historial: [{ dir: "out", text: "¡Hola! Soy Pedro" }, { dir: "in", text: "hola" }, { dir: "out", text: "¿En qué te ayudo?" }, { dir: "in", text: "" }, { dir: "in", text: "¿aceptan mi auto a cuenta?" }] });
    expect(system).toContain("Honda CR-V Touring 2026");
    expect(system).not.toContain("CX-5"); // vendido
    expect(system).toContain("Estamos en Av. Ejemplo 123.");
    expect(system).toContain("13.5% anual");
    expect(system).toContain("Nunca inventes precios");
    expect(messages).toEqual([{ role: "user", content: "hola" }, { role: "assistant", content: "¿En qué te ayudo?" }, { role: "user", content: "¿aceptan mi auto a cuenta?" }]);
  });

  it("si la IA contesta, se descarta lo que decidió el menú; si pide asesor, pasa con él", () => {
    const antes = { paso: "auto", autoId: "city", opciones: ["cotizar", "cita", "lista", "asesor"], fallos: 1 };
    const menu: Resultado = decidir({ cfg: CFG, inventario: INVENTARIO, conv: antes, msg: { texto: "zzz", enHorario: true }, ahora: new Date(T0) });
    expect(menu.lead).toMatchObject({ quiereAsesor: true }); // segunda vez que no entiende: el menú pasaba al asesor
    const r: Resultado = aplicarIA(menu, { respuesta: "Claro, te cuento", pasar_a_asesor: false, auto_id: "" }, { inventario: INVENTARIO, antes, ahora: new Date(T0) });
    expect(r).toMatchObject({ motivo: "ia", respuestas: [{ texto: "Claro, te cuento" }], lead: {} });
    expect(r.conv).toMatchObject({ paso: "auto", autoId: "city", fallos: 0 });
    const asesor: Resultado = aplicarIA(menu, { respuesta: "Le aviso a Pedro", pasar_a_asesor: true, auto_id: "crv" }, { inventario: INVENTARIO, antes, ahora: new Date(T0) });
    expect(asesor.lead).toMatchObject({ quiereAsesor: true, autoId: "crv", interes: "Honda CR-V Touring 2026" });
    expect(asesor.conv).toMatchObject({ paso: "asesor" });
    expect(aplicarIA(menu, { respuesta: "  " }, { antes })).toBe(menu); // vacía: se queda la del menú
  });
});
