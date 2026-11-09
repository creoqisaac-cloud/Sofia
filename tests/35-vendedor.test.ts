/**
 * Sofía vendedora (prueba/js/vendedor.js): asistente de ventas de autos sin IA. Es el mismo módulo que usan el
 * conector (WhatsApp/Messenger reales), el simulador de la app y la demo de la página de ventas.
 * Inventario y personas inventados.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { decidir, leerEnganche, buscarAutos, mensualidad, textoHorario, MAX_POR_HORA, promptIA, aplicarIA, horariosLibres, textoCita, asesorCon, cifras } from "../prueba/js/vendedor.js";

type Respuesta = { texto: string; foto?: string };
type Resultado = { respuestas: Respuesta[]; conv: Record<string, unknown>; lead: Record<string, unknown>; motivo: string; reserva?: { id: string; texto: string } };

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
    expect(texto).toMatch(/^¡Hola Ana! 👋 Te escribo de parte de Pedro, de Honda Ejemplo\./);
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

  it("sin inventario no inventa precios: ofrece la corrida, pregunta el enganche y lleva a la cita con horarios reales", () => {
    const libres = [{ id: "2026-11-10T17:00:00.000Z", texto: "mañana martes a las 11 am" }, { id: "2026-11-11T22:00:00.000Z", texto: "el miércoles 11 a las 4 pm" }];
    const cfg = { ...CFG, asesor: "Lic. Mario Abarca", agencia: "Honda" };
    const di = (texto: string, conv: Record<string, unknown>, i: number, primero = false): Resultado =>
      decidir({ cfg, inventario: [], conv, msg: { texto, nombre: "Luis", primero, enHorario: true }, ahora: new Date(T0 + i * 60_000), libres });
    const r = di("Hola, ¿qué precio tiene la CR-V?", {}, 0, true);
    expect(r.motivo).toBe("corrida");
    expect(r.respuestas[0]!.texto).toBe("¡Hola Luis! 👋 Te escribo de parte del Lic. Mario Abarca, de Honda.\n\nCon gusto te doy una corrida de la CR-V. ¿Más o menos cuánto tienes pensado dar de enganche?");
    expect(r.lead).toMatchObject({ interes: "Honda CR-V" });
    const eng = di("como 80 mil", r.conv, 1);
    expect(eng.motivo).toBe("corrida");
    expect(eng.lead).toMatchObject({ formaPago: "credito", enganche: 80000 });
    const t = eng.respuestas[0]!.texto;
    expect(t).toMatch(/^Va, con \$80,000 de enganche el Lic\. Mario Abarca te prepara la corrida exacta con la promoción del mes\.\n¿Te aparto cita para que veas la \*CR-V\*\? Tengo libre:\n1️⃣ mañana martes a las 11 am\n2️⃣ el miércoles 11 a las 4 pm/);
    expect(cifras(t)).toEqual([80000]); // ninguna cifra inventada: solo la que dijo el cliente
    const apartada = di("2", eng.conv, 2);
    expect(apartada.reserva).toMatchObject(libres[1]!);
    expect(apartada.respuestas[0]!.texto).toBe("Listo ✅ quedó tu cita el miércoles 11 a las 4 pm con el Lic. Mario Abarca en Honda. ¿A nombre de quién la aparto?");
    const nombre = di("Luis Treviño", apartada.conv, 3);
    expect(nombre.respuestas[0]!.texto).toBe("Gracias, Luis. El Lic. Mario Abarca te atiende personalmente en la agencia; cualquier cambio me escribes por aquí.");
    expect(nombre.lead).toMatchObject({ nombreCliente: "Luis Treviño", quiereAsesor: true });
  });

  it("corrida sin inventario: «no sé» o un porcentaje también sirven; si no se entiende, pregunta una vez más", () => {
    const cfg = { ...CFG, asesor: "Lic. Mario Abarca" };
    const charlaSin = (m: string[]) => charla(m, { cfg, inventario: [] });
    const noSabe = charlaSin(["Hola, quiero un crédito para el Civic", "no sé la verdad"]);
    expect(noSabe.txt(0)).toContain("Con gusto te doy una corrida del Civic.");
    expect(noSabe.texto).toMatch(/^Sin problema, el Lic\. Mario Abarca te muestra ejemplos con 20, 30, 40 y 50% de enganche/);
    expect(noSabe.ultimo.motivo).toBe("corrida");
    expect(charlaSin(["cuánto cuesta el City", "el 30%"]).lead).toMatchObject({ formaPago: "credito", enganchePct: 30, interes: "Honda City" });
    const duda = charlaSin(["precio del accord", "mmm déjame ver"]);
    expect(duda.ultimo.motivo).toBe("no-entendi");
    expect(duda.texto).toContain("¿Más o menos cuánto podrías dar de enganche?");
    expect(charlaSin(["precio del accord", "mmm déjame ver", "pues ok"]).ultimo.motivo).toBe("corrida"); // a la segunda, a la cita
    const contado = charlaSin(["Hola", "lo quiero de contado"]);
    expect(contado.texto).toContain("De contado el Lic. Mario Abarca te da el precio exacto con la promoción del mes.");
    expect(contado.lead).toMatchObject({ formaPago: "contado" });
  });

  it("el asesor con título se nombra con artículo; sin título, solo el nombre", () => {
    expect([asesorCon("Lic. Mario Abarca"), asesorCon("Lic. Mario Abarca", "a"), asesorCon("Lic. Mario Abarca", "de")]).toEqual(["el Lic. Mario Abarca", "al Lic. Mario Abarca", "del Lic. Mario Abarca"]);
    expect([asesorCon("Licenciada Ana Ruiz", "a"), asesorCon("Pedro", "de"), asesorCon("Pedro")]).toEqual(["a la Licenciada Ana Ruiz", "de Pedro", "Pedro"]);
    expect(charla(["Hola", "2"], { cfg: { ...CFG, asesor: "Lic. Mario Abarca" }, inventario: [] }).texto).toContain("Le aviso al Lic. Mario Abarca para que te escriba");
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
    expect(system).toContain("Contestas el WhatsApp de ventas de Pedro");
    expect(system).toContain("con gusto le das una corrida");
    expect(system).toContain("Nunca inventes cifras");
    expect(system).toContain("Todavía no tienes corridas con cifras: no des números.");
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

  it("habla en nombre del Lic. y usa las corridas pegadas como las únicas cifras de crédito", () => {
    const corridas = "Civic Touring 2026 · precio $599,900\n20% de enganche ($119,980): 48 meses $12,450 · 60 meses $10,980";
    const cfg = { ...CFG, asesor: "Lic. Mario Abarca", agencia: "Honda", marca: "Honda", corridas };
    const { system } = promptIA({ cfg, historial: [{ dir: "in", text: "precio civic" }] });
    expect(system).toContain("Contestas el WhatsApp de ventas del Lic. Mario Abarca, asesor de Honda");
    expect(system).toContain("di «el Lic. Mario Abarca» o «el licenciado»; nunca solo «Mario» ni «Mario te dice».");
    expect(system).toContain("si quiere, el licenciado le escribe directo.");
    expect(promptIA({ cfg: CFG }).system).toContain("di «Pedro». Por ejemplo: «En agencia te atiende personalmente Pedro».");
    expect(system).toContain(`CORRIDAS DEL LIC. MARIO ABARCA (las únicas cifras de crédito que puedes dar; tal cual):\n${corridas}`);
    expect(system).not.toContain("Todavía no tienes corridas");
    const historial = [{ dir: "in", text: "precio civic" }, { dir: "out", text: "¿Cuánto darías de enganche?" }, { dir: "in", text: "como 120 mil" }];
    const menu: Resultado = decidir({ cfg, inventario: [], conv: {}, msg: { texto: "como 120 mil", enHorario: true }, ahora: new Date(T0) });
    const bien = aplicarIA(menu, { respuesta: "Con 20% ($119,980) a 60 meses te queda en $10,980 al mes; con tus 120 mil andas ahí. ¿Te la presenta el Lic. Mario Abarca mañana a las 10?" }, { cfg, historial, ahora: new Date(T0) });
    expect(bien.motivo).toBe("ia");
    expect(() => aplicarIA(menu, { respuesta: "Te quedaría en $9,900 al mes" }, { cfg, historial, ahora: new Date(T0) })).toThrow("dio una cifra que no está en las corridas ($9,900)");
    expect(() => aplicarIA(menu, { respuesta: "Con 35% bajas la mensualidad" }, { cfg, historial, ahora: new Date(T0) })).toThrow("(35%)");
    expect(aplicarIA(menu, { respuesta: "Te puedo mostrar ejemplos con 20, 30, 40 o 50% de enganche. ¿El Civic 2026?" }, { cfg, historial, ahora: new Date(T0) }).motivo).toBe("ia");
    const conDireccion = { ...cfg, reglas: [{ palabras: ["ubicación"], respuesta: "Estamos en Av. Constitución 1500, Monterrey." }] };
    expect(aplicarIA(menu, { respuesta: "Estamos en Av. Constitución 1500, te espero." }, { cfg: conDireccion, historial, ahora: new Date(T0) }).motivo).toBe("ia");
  });

  it("cifras: dinero y porcentajes se comparan sin importar cómo se escribieron; horas, plazos y años no cuentan", () => {
    expect(cifras("Con $80,000 a 48 meses quedan $8,450.50; 1.5 millones, 300k, 80 mil, 20 %")).toEqual([80000, 8451, 1500000, 300000, 80000, "20%"]);
    expect(cifras("mañana a las 10:00, el 12, 48 meses, modelo 2026")).toEqual([]);
  });
});

describe("vendedora · aviso de privacidad", () => {
  it("«BORRAR MIS DATOS» y «NO PROMOCIONES» se contestan siempre y quedan anotados para el asesor", () => {
    const borrar = charla(["Hola", "4", "Quiero que BORREN MIS DATOS por favor"]);
    expect(borrar.ultimo.motivo).toBe("borrar-datos"); // aunque ya lo atendía el asesor
    expect(borrar.texto).toContain("Recibimos tu solicitud para borrar tus datos. Pedro la confirma");
    expect(borrar.lead).toMatchObject({ pideBorrar: true, quiereAsesor: true });
    const promo = charla(["Hola", "no promociones gracias"]);
    expect(promo.ultimo.motivo).toBe("sin-promociones");
    expect(promo.lead).toMatchObject({ noPromociones: true });
    expect(charla(["Hola", "¿tienen promociones?"]).ultimo.motivo).not.toBe("sin-promociones");
  });
});

describe("vendedora · agenda", () => {
  it("horarios libres: cada hora dentro del horario de Monterrey, con anticipación y sin los apartados", () => {
    const ahora = new Date("2026-11-09T22:30:00Z"); // lunes 4:30 p.m. en Monterrey
    const libres = horariosLibres({ horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, ahora, ocupadas: ["2026-11-10T16:00:00.000Z"] });
    expect(libres[0]).toMatchObject({ id: "2026-11-10T00:00:00.000Z", texto: "hoy a las 6 pm", fecha: "2026-11-09" }); // 1.5 h después, última cita (18:00-19:00)
    expect(libres[1]).toMatchObject({ id: "2026-11-10T15:00:00.000Z", texto: "mañana martes a las 9 am", fecha: "2026-11-10" });
    expect(libres.map((x: { id: string }) => x.id)).not.toContain("2026-11-10T16:00:00.000Z"); // martes 10:00 ya apartado
    expect(libres.some((x: { texto: string }) => x.texto.includes("domingo"))).toBe(false);
  });

  it("las horas se dicen como en WhatsApp: «a las 4 pm», «a la 1 pm», «a las 4:30 pm»", () => {
    const ahora = new Date("2026-11-09T16:00:00Z"); // lunes 10 a.m. en Monterrey
    expect(textoCita("2026-11-09T22:00:00Z", "America/Monterrey", ahora)).toBe("hoy a las 4 pm");
    expect(textoCita("2026-11-10T19:00:00Z", "America/Monterrey", ahora)).toBe("mañana martes a la 1 pm");
    expect(textoCita("2026-11-12T22:30:00Z", "America/Monterrey", ahora)).toBe("el jueves 12 a las 4:30 pm");
    expect(textoCita("2026-11-12T15:00:00Z", "America/Monterrey", ahora)).toBe("el jueves 12 a las 9 am");
  });
});
