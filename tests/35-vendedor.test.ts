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
    expect(texto).toMatch(/^¡Hola Ana! 👋 Soy Pedro, de Honda Ejemplo\.\n¿Qué auto andas buscando\?/);
    expect(texto).not.toMatch(/1️⃣|4️⃣/); // sin menús numerados: plática normal
  });

  it("menú → lista → ficha con foto y precio → cotización → cita: el prospecto queda completo", () => {
    const r = charla(["Hola", "1", "1", "1", "30%", "1", "el sábado a las 11"]);
    expect(r.txt(1)).toContain("1️⃣ *Honda CR-V Touring 2026* — $689,900");
    expect(r.txt(1)).not.toContain("CX-5"); // el que no está disponible no se ofrece
    expect(r.paso(2).respuestas[0]).toMatchObject({ foto: "https://x.test/media/crv" });
    expect(r.txt(2)).toContain("💵 *$689,900* de contado");
    expect(r.paso(4).motivo).toBe("cotizacion");
    expect(r.txt(4)).toContain(`• 60 meses: *$${Math.round(mensualidad(689900 * 0.7, 15.9, 60)).toLocaleString("es-MX")}*`);
    expect(r.ultimo.respuestas[0]!.texto).toBe("Perfecto, ahí te espero para que veas la Honda CR-V Touring 2026. Te confirmo el horario en un ratito.");
    expect(r.lead).toMatchObject({ autoId: "crv", interes: "Honda CR-V Touring 2026", precio: 689900, formaPago: "credito", enganche: 206970, plazo: 60, cita: "el sábado a las 11", quiereAsesor: true, calor: "caliente" });
  });

  it("el primer mensaje que ya nombra el auto recibe saludo + ficha (por apodo o con guion distinto)", () => {
    const crv = charla(["¿Cuánto cuesta la crv?"]);
    expect(crv.ultimo.motivo).toBe("auto");
    expect(crv.texto).toMatch(/^¡Hola Ana! 👋 Soy Pedro, de Honda Ejemplo\.\n🚗 \*Honda CR-V Touring 2026\*/);
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

  it("pasa el prospecto a Pedro y Sofía retoma si el cliente vuelve a escribir", () => {
    const r = charla(["Hola", "quiero hablar con un asesor", "¿sigues ahí?", "menú"]);
    expect(r.paso(1).motivo).toBe("asesor");
    expect(r.txt(1)).toBe("Claro, dame unos minutos y te escribo.");
    expect(r.paso(2).motivo).not.toBe("con-asesor");
    expect(r.paso(2).respuestas.length).toBeGreaterThan(0);
    expect(r.ultimo.motivo).toBe("menu");
    expect(r.lead).toMatchObject({ quiereAsesor: true, calor: "caliente" });
  });

  it("fuera de horario sigue atendiendo sin decir que la agencia está cerrada", () => {
    const r = charla(["Hola", "4"], { enHorario: false });
    expect(r.txt(0)).toMatch(/^¡Hola Ana! 👋 Soy Pedro, de Honda Ejemplo\./);
    expect(r.txt(0)).not.toMatch(/cerrad[oa]s/i);
    expect(r.texto).not.toMatch(/cerrad[oa]s|en cuanto abramos/i);
  });

  it("las respuestas propias del asesor (reglas) siguen funcionando", () => {
    expect(charla(["Hola", "¿cuál es su ubicación?"]).texto).toBe("Estamos en Av. Ejemplo 123.");
  });

  it("si no entiende dos veces, pasa con el asesor en vez de dar vueltas", () => {
    const r = charla(["Hola", "asdfgh", "qwerty"]);
    expect(r.paso(1).motivo).toBe("no-entendi");
    expect(r.txt(1)).toContain("¿me lo explicas tantito más?");
    expect(r.ultimo.motivo).toBe("no-entendi");
    expect(r.ultimo.respuestas[0]!.texto).toBe("Déjame revisarlo bien y te escribo en un ratito.");
    expect(r.lead).toMatchObject({ quiereAsesor: true });
  });

  it("cita: una fecha clara se anota a la primera; si no, pregunta otra vez y luego Mario lo atiende (sin repetir lo que escribió)", () => {
    expect(charla(["Hola", "¿puedo ir a ver la City el sábado a las 10?"]).lead).toMatchObject({ autoId: "city", cita: "¿puedo ir a ver la City el sábado a las 10?" });
    const r = charla(["Hola", "3", "no sé", "cuando ustedes digan"]);
    expect(r.txt(2)).toContain("¿Qué día y a qué hora te queda mejor para venir?");
    expect(r.texto).toBe("Déjame revisarlo bien y te escribo en un ratito.");
    expect(r.lead).toMatchObject({ quiereAsesor: true });
    expect(r.lead.cita).toBeUndefined();
  });

  it("sin inventario no inventa precios: ofrece la corrida, pregunta el enganche y lleva a la cita con horarios reales", () => {
    const libres = [{ id: "2026-11-10T17:00:00.000Z", texto: "mañana martes a las 11 am" }, { id: "2026-11-11T22:00:00.000Z", texto: "el miércoles 11 a las 4 pm" }];
    const cfg = { ...CFG, asesor: "Mario Abarca", agencia: "Honda" };
    const di = (texto: string, conv: Record<string, unknown>, i: number, primero = false): Resultado =>
      decidir({ cfg, inventario: [], conv, msg: { texto, nombre: "Luis", primero, enHorario: true }, ahora: new Date(T0 + i * 60_000), libres });
    const r = di("Hola, ¿qué precio tiene la CR-V?", {}, 0, true);
    expect(r.motivo).toBe("corrida");
    expect(r.respuestas[0]!.texto).toBe("¡Hola Luis! 👋 Soy Mario Abarca, de Honda.\nClaro, te hago una corrida de la CR-V. ¿Como cuánto tienes pensado dar de enganche?");
    expect(r.lead).toMatchObject({ interes: "Honda CR-V" });
    const eng = di("como 80 mil", r.conv, 1);
    expect(eng.motivo).toBe("corrida");
    expect(eng.lead).toMatchObject({ formaPago: "credito", enganche: 80000 });
    const t = eng.respuestas[0]!.texto;
    expect(t).toBe("Va, con 80 mil te armo la corrida. ¿Cuándo puedes venir a ver la CR-V? Tengo espacio mañana martes a las 11 am o el miércoles 11 a las 4 pm, o dime qué día te acomoda.");
    expect(cifras(t)).toEqual([80000]); // ninguna cifra inventada: solo la que dijo el cliente
    const apartada = di("2", eng.conv, 2);
    expect(apartada.reserva).toMatchObject(libres[1]!);
    expect(apartada.respuestas[0]!.texto).toBe("Listo, quedó el miércoles 11 a las 4 pm. ¿A nombre de quién?");
    const nombre = di("Luis Treviño", apartada.conv, 3);
    expect(nombre.respuestas[0]!.texto).toBe("Gracias, Luis. Al llegar a la agencia pregunta por mí, Mario Abarca, y salgo a recibirte.");
    expect(nombre.lead).toMatchObject({ nombreCliente: "Luis Treviño", quiereAsesor: true });
  });

  it("corrida sin inventario: «no sé» o un porcentaje también sirven; si no se entiende, pregunta una vez más", () => {
    const cfg = { ...CFG, asesor: "Mario Abarca" };
    const charlaSin = (m: string[]) => charla(m, { cfg, inventario: [] });
    const hola = charlaSin(["Hola", "me interesa la CR-V"]);
    expect(hola.txt(0)).toBe("¡Hola Ana! 👋 Soy Mario Abarca, de Honda Ejemplo.\n¿Qué modelo traes en mente?");
    expect(hola.texto).toBe("Claro, te hago una corrida de la CR-V. ¿Como cuánto tienes pensado dar de enganche?");
    const noSabe = charlaSin(["Hola, quiero un crédito para el Civic", "no sé la verdad"]);
    expect(noSabe.txt(0)).toContain("Claro, te hago una corrida del Civic.");
    expect(noSabe.texto).toMatch(/^Va, te la armo con 20, 30, 40 y 50% de enganche para que veas cuál te acomoda\. ¿Qué día y a qué hora te gustaría venir a ver el Civic\? Puedo recibirte /);
    expect(noSabe.ultimo.motivo).toBe("corrida");
    expect(charlaSin(["cuánto cuesta el City", "el 30%"]).lead).toMatchObject({ formaPago: "credito", enganchePct: 30, interes: "Honda City" });
    expect(charlaSin(["precio del accord", "tengo $125,500"]).texto).toMatch(/^Va, con \$125,500 te armo la corrida\./);
    const duda = charlaSin(["precio del accord", "mmm déjame ver"]);
    expect(duda.ultimo.motivo).toBe("no-entendi");
    expect(duda.texto).toContain("¿Más o menos cuánto podrías dar de enganche?");
    expect(charlaSin(["precio del accord", "mmm déjame ver", "pues ok"]).ultimo.motivo).toBe("corrida"); // a la segunda, a la cita
    const contado = charlaSin(["Hola", "lo quiero de contado"]);
    expect(contado.texto).toMatch(/^Va, de contado también te armo la corrida\. ¿Qué día y a qué hora te gustaría venir\? Puedo recibirte /);
    expect(contado.lead).toMatchObject({ formaPago: "contado" });
    const raro = charlaSin(["Hola", "asdf", "qwer"]);
    expect(raro.txt(1)).toBe("Perdona, ¿me lo explicas tantito más? 🙏");
    expect(raro.texto).toBe("Déjame revisarlo bien y te escribo en un ratito.");
  });

  it("el asesor con título se nombra con artículo; sin título, solo el nombre", () => {
    expect([asesorCon("Lic. Mario Abarca"), asesorCon("Lic. Mario Abarca", "a"), asesorCon("Lic. Mario Abarca", "de")]).toEqual(["el Lic. Mario Abarca", "al Lic. Mario Abarca", "del Lic. Mario Abarca"]);
    expect([asesorCon("Licenciada Ana Ruiz", "a"), asesorCon("Pedro", "de"), asesorCon("Pedro")]).toEqual(["a la Licenciada Ana Ruiz", "de Pedro", "Pedro"]);
    expect(charla(["Hola", "2"], { cfg: { ...CFG, asesor: "Lic. Mario Abarca" }, inventario: [] }).texto).toBe("Claro, dame unos minutos y te escribo.");
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
    expect(system).toContain("Eres Pedro, asesor de ventas de Honda (Honda Ejemplo) en Monterrey.");
    expect(system).toContain("ofrécele una corrida y pregúntale como cuánto tiene pensado dar de enganche");
    expect(system).toContain("Inventes cifras (precios, mensualidades");
    expect(system).toContain("Aún no tienes las cifras: no des números.");
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

  it("habla por Mario Abarca, cierra con «pregunta por Mario Abarca» y usa las corridas como las únicas cifras de crédito", () => {
    const corridas = "Civic Touring 2026 · precio $599,900\n20% de enganche ($119,980): 48 meses $12,450 · 60 meses $10,980";
    const cfg = { ...CFG, asesor: "Mario Abarca", agencia: "Honda", marca: "Honda", corridas };
    const { system } = promptIA({ cfg, historial: [{ dir: "in", text: "precio civic" }] });
    expect(system).toContain("Eres Mario Abarca, asesor de ventas de Honda en Monterrey.");
    expect(system).toContain("di «Mario Abarca», nunca solo «Mario» ni «Mario te dice».");
    expect(system).toContain("Confirma claramente el día y la hora de la cita.");
    expect(system).toContain("Al llegar a la agencia pregunta por mí, Mario Abarca, y salgo a recibirte.");
    expect(system).toContain("«con gusto te ayudo», «excelente elección», «promoción del mes», «lo siento»");
    expect(system).toContain(`CORRIDAS (las únicas cifras de crédito que puedes dar; tal cual):\n${corridas}`);
    expect(system).not.toContain("Aún no tienes las cifras");
    const lic = promptIA({ cfg: { ...cfg, asesor: "Lic. Mario Abarca" } }).system;
    expect(lic).toContain("Eres el Lic. Mario Abarca, asesor de ventas de Honda en Monterrey.");
    expect(lic).toContain("eres el asistente digital que contesta por Mario");
    expect(promptIA({ cfg: CFG }).system).not.toContain("nunca solo"); // «Pedro» no tiene apellido que cuidar
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
    expect(borrar.texto).toContain("Recibí tu solicitud para borrar tus datos. Te confirmo");
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

describe("vendedora · recuperación de chat propio de prueba", () => {
  const conf = { ...CFG, ventas: { horasConAsesor: 12, ia: false } };
  const ahora = new Date(T0);
  const asesor = { paso: "asesor", desde: ahora.toISOString(), fallos: 2 };
  const ejecutar = (texto: string, pruebaLocal: boolean, conv: Record<string, unknown> = asesor) =>
    decidir({ cfg: conf, inventario: INVENTARIO, conv, msg: { texto, nombre: "Prueba", pruebaLocal, primero: false, enHorario: true }, ahora });

  it("un /sofia hola autorizado reanuda Sofía aun después del pase a asesor", () => {
    const r = ejecutar("/sofia hola", true);
    expect(r.motivo).not.toBe("con-asesor");
    expect(r.respuestas.length).toBeGreaterThan(0);
    expect(r.conv.paso).not.toBe("asesor");
    expect(r.conv.fallos).toBe(0);
  });

  it("las notas personales sin /sofia no generan respuesta", () => {
    const r = ejecutar("anotación personal", true, {});
    expect(r.motivo).toBe("comando-prueba-requerido");
    expect(r.respuestas).toEqual([]);
  });

  it("un cliente normal no puede reactivar su conversación con /sofia", () => {
    const r = ejecutar("/sofia hola", false);
    expect(r.motivo).toBe("con-asesor");
    expect(r.respuestas).toEqual([]);
  });

  it("dos mensajes desconocidos de prueba se recuperan con un nuevo comando", () => {
    const primero = ejecutar("/sofia asdfgh", true, {});
    const segundo = ejecutar("/sofia qwerty", true, primero.conv);
    expect(segundo.conv.paso).toBe("asesor");
    const recuperado = ejecutar("/sofia hola", true, segundo.conv);
    expect(recuperado.respuestas.length).toBeGreaterThan(0);
    expect(recuperado.motivo).not.toBe("con-asesor");
  });
});

describe("vendedora · habla como Mario y respeta la postventa", () => {
  it("una devolución no recibe menú de ventas: contesta como Mario, avisa y se calla 12 h", () => {
    const ahora = new Date("2026-11-23T16:00:00Z");
    const r = decidir({ cfg: { asesor: "Mario Abarca", agencia: "Honda" }, inventario: [], conv: {}, msg: { texto: "Hola, vengo por lo de la devolución de mi apartado", nombre: "Ana López", primero: true }, ahora });
    expect(r.motivo).toBe("postventa");
    expect(r.respuestas[0]!.texto).toBe("Claro, Ana, déjame revisarlo y te confirmo en un momento.");
    expect(r.lead).toMatchObject({ quiereAsesor: true, postventa: true });
    const despues = decidir({ cfg: { asesor: "Mario Abarca" }, inventario: [], conv: r.conv, msg: { texto: "¿qué precio tiene el CR-V?", nombre: "Ana" }, ahora: new Date(ahora.getTime() + 3600e3) });
    expect(despues.respuestas).toEqual([]);
  });
  it("nunca dice que le avisa a un asesor ni que la pasa con alguien", () => {
    const r = decidir({ cfg: { asesor: "Mario Abarca" }, inventario: [], conv: {}, msg: { texto: "me puedes llamar?", nombre: "Luis" }, ahora: new Date("2026-11-23T16:00:00Z") });
    expect(r.respuestas[0]!.texto).toMatch(/^Claro, dame unos minutos y te marco 📞/);
    expect(r.respuestas[0]!.texto).not.toMatch(/asesor|le aviso|te paso/i);
  });
});

describe("vendedora · vende como persona con el inventario", () => {
  const inv = [
    { id: "city", marca: "Honda", modelo: "City", anio: 2026, precio: 401900, tipo: "nuevo", palabras: ["city"], foto: "https://x/media/city" },
    { id: "brv", marca: "Honda", modelo: "BR-V", anio: 2026, precio: 479900, tipo: "nuevo", palabras: ["brv", "7 pasajeros", "camioneta"], foto: "https://x/media/brv" },
    { id: "crv", marca: "Honda", modelo: "CR-V", anio: 2027, precio: 830900, tipo: "nuevo", palabras: ["crv", "camioneta"], foto: "https://x/media/crv" },
  ];
  const ahora0 = new Date("2026-11-23T18:00:00Z");
  const libres = ["2026-11-24T15:00:00.000Z", "2026-11-24T19:00:00.000Z", "2026-11-24T22:00:00.000Z"].map((id) => ({ id, texto: textoCita(id, "America/Monterrey", ahora0) }));
  const charla = (msgs: string[]) => {
    let conv = {};
    return msgs.map((texto, i) => {
      const r = decidir({ cfg: { asesor: "Mario Abarca" }, inventario: inv, conv, msg: { texto, nombre: "Laura", primero: i === 0 }, ahora: new Date(ahora0.getTime() + i * 60000), libres }) as Resultado;
      conv = r.conv;
      return r;
    });
  };
  it("manda la foto del auto que está viendo cuando se la piden", () => {
    const [, r] = charla(["precio de la crv", "me mandas fotos?"]);
    expect(r!.motivo).toBe("fotos");
    expect(r!.respuestas[0]!.foto).toBe("https://x/media/crv");
  });
  it("después de la corrida contesta otro plazo sin volver a preguntar", () => {
    const rs = charla(["la crv", "a credito con 200 mil", "y a 36?"]);
    expect(rs[2]!.motivo).toBe("plazo");
    expect(rs[2]!.respuestas[0]!.texto).toMatch(/^A 36 meses te queda en \*\$[\d,]+\* al mes, con \$200,000 de enganche/);
  });
  it("«puedo ir mañana» ofrece horas reales de mañana y «a la 1» la aparta", () => {
    const rs = charla(["la city", "puedo ir mañana a verla", "a la 1"]);
    expect(rs[1]!.respuestas[0]!.texto).toBe("Mañana martes tengo espacio a las 9 am, a la 1 pm o a las 4 pm. ¿Cuál te acomoda?");
    expect(rs[2]!.reserva?.id).toBe("2026-11-24T19:00:00.000Z");
  });
  it("filtra por personas y por presupuesto", () => {
    expect(charla(["busco camioneta para 7 personas"])[0]!.respuestas[0]!.texto).toMatch(/Para 7 personas te recomiendo:\n1️⃣ \*Honda BR-V 2026\*/);
    const r = charla(["hola", "tengo hasta 450 mil"])[1]!;
    expect(r.respuestas[0]!.texto).toMatch(/Con ese presupuesto te alcanza para:\n1️⃣ \*Honda City 2026\*/);
    expect(r.respuestas[0]!.texto).not.toMatch(/BR-V/);
  });
});

describe("vendedora · contesta como experto sin inventar", () => {
  const inv = [
    { id: "city", marca: "Honda", modelo: "City", anio: 2026, precio: 401900, tipo: "nuevo", palabras: ["city", "sedan"], foto: "https://x/media/city" },
    { id: "crv", marca: "Honda", modelo: "CR-V", anio: 2027, precio: 830900, tipo: "nuevo", palabras: ["crv", "camioneta"], descripcion: "SUV con gran espacio.", foto: "https://x/media/crv" },
  ];
  const cfg = { asesor: "Mario Abarca", horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, direccion: "Av. Ejemplo 500, Monterrey" };
  const charla = (msgs: string[]) => {
    let conv = {};
    return msgs.map((texto, i) => {
      const r = decidir({ cfg, inventario: inv, conv, msg: { texto, nombre: "Laura", primero: i === 0 }, ahora: new Date(Date.parse("2026-11-23T18:00:00Z") + i * 60000), libres: [] }) as Resultado;
      conv = r.conv;
      return r;
    });
  };
  it("«¿es automática?» es una pregunta del auto, no una queja de bot", () => {
    const r = charla(["precio de la crv", "es automatica?"])[1]!;
    expect(r.motivo).toBe("dato");
    expect(r.respuestas[0]!.texto).toMatch(/^Buena pregunta 👌 De la CR-V te confirmo la transmisión/);
    expect(r.lead.duda).toBe("es automatica?");
  });
  it("«¿cuánta garantía trae?» antes de comprar no es postventa", () => {
    const r = charla(["cuanta garantia trae la crv?"])[0]!;
    expect(r.motivo).toBe("garantia");
    expect(r.lead.postventa).toBeUndefined();
  });
  it("requisitos, ubicación y horario con datos reales de Mario", () => {
    expect(charla(["que requisitos piden para el credito"])[0]!.respuestas[0]!.texto).toContain("INE vigente, comprobante de domicilio");
    expect(charla(["donde estan?"])[0]!.respuestas[0]!.texto).toContain("Estoy en Av. Ejemplo 500, Monterrey");
    expect(charla(["abren el domingo?"])[0]!.respuestas[0]!.texto).toContain("El domingo no abrimos 🙏");
  });
  it("auto a cuenta: pide los datos y avisa a Mario para valuarlo", () => {
    const [a, b] = charla(["tengo un carro para dar a cuenta", "un versa 2019 con 80 mil km"]);
    expect(a!.motivo).toBe("toma");
    expect(b!.motivo).toBe("toma");
    expect(b!.lead).toMatchObject({ autoAToma: "un versa 2019 con 80 mil km" });
  });
  it("«sí» avanza, «a 60 meses» sin enganche cotiza con el mínimo y «está muy cara» ofrece salidas", () => {
    const rs = charla(["precio de la crv", "si"]);
    expect(rs[1]!.respuestas[0]!.texto).toMatch(/^Para cotizar la \*Honda CR-V 2027\*/);
    expect(charla(["precio de la crv", "y a 60 meses?"])[1]!.respuestas[0]!.texto).toMatch(/^A 60 meses, con el 20% de enganche \(\$166,180\), la CR-V te queda en/);
    expect(charla(["precio de la crv", "esta muy cara"])[1]!.respuestas[0]!.texto).toMatch(/o te enseño el City \(\$401,900\)\. ¿Qué mensualidad te quedaría cómoda\?$/);
  });
  it("un modelo que no tengo no se cotiza a ciegas", () => {
    const r = charla(["info del accord"])[0]!;
    expect(r.motivo).toBe("sin-modelo");
    expect(r.respuestas[0]!.texto).toContain("El Accord ahorita no lo tengo en piso");
  });
});

describe("vendedora · casos reales que fallaban", () => {
  const inv = [
    { id: "city", marca: "Honda", modelo: "City", anio: 2026, precio: 401900, tipo: "nuevo", palabras: ["city", "sedan"], foto: "https://x/media/city" },
    { id: "crv", marca: "Honda", modelo: "CR-V", anio: 2027, precio: 830900, tipo: "nuevo", palabras: ["crv", "camioneta"], descripcion: "SUV con gran espacio.", foto: "https://x/media/crv" },
  ];
  const charla = (msgs: string[]) => {
    let conv = {};
    return msgs.map((texto, i) => {
      const r = decidir({ cfg: { asesor: "Mario Abarca" }, inventario: inv, conv, msg: { texto, nombre: "Laura", primero: i === 0 }, ahora: new Date(Date.parse("2026-11-23T18:00:00Z") + i * 60000), libres: [] }) as Resultado;
      conv = r.conv;
      return r;
    });
  };
  const texto = (r: Resultado) => r.respuestas.map((x) => x.texto).join("\n");
  it("un año («modelo 2026», «para 2027») no es dinero", () => {
    expect(leerEnganche("modelo 2026", 830900)).toBeNull();
    expect(leerEnganche("4,785", 830900)).toBe(4785);
    expect(leerEnganche("$2,026", 830900)).toBe(2026);
    expect(texto(charla(["crv", "Modelo 2026 tienes pero hibrida"])[1]!)).not.toMatch(/contado! 🎉/);
  });
  it("clientes en trámite, amigos y familia: en su primer mensaje no les suelta el menú de ventas", () => {
    for (const m of ["Muchas gracias Mario", "Hola buenas tardes ya tienes novedades de lo que ofrece la agencia", "Mario te pido de favor mañana sin falta la entrada", "Te amo mijo", "ven", "Ya me lo vendiste.."]) {
      expect(charla([m])[0]!, m).toMatchObject({ motivo: "personal", respuestas: [] });
    }
    // Lo que sí es de venta se contesta aunque no salude
    for (const m of ["cuanto tardan en entregar?", "que me recomiendas para uber", "incluye seguro?", "Hola", "¡Hola! Quiero más información"]) {
      expect(charla([m])[0]!.respuestas.length, m).toBeGreaterThan(0);
    }
  });
  it("«me llamo Rosaura»: guarda el nombre y sigue la venta", () => {
    const r = charla(["City 2026 en automático", "Me llamo Rosaura"])[1]!;
    expect(r.lead.nombreCliente).toBe("Rosaura");
    expect(texto(r)).toMatch(/^Mucho gusto, Rosaura 🙌/);
  });
  it("«toman carro con adeudo?» es auto a cuenta", () => {
    const r = charla(["Hola", "Toman carro con adeudo se paga y el resto de enganche"])[1]!;
    expect(r.motivo).toBe("toma");
    expect(texto(r)).toContain("Aunque tenga adeudo");
  });
  it("otra marca (RAV híbrida) → su Honda equivalente; «CR-V o Accord» dice que el Accord no está y no repite la ficha", () => {
    const r = charla(["Hola", "Me interesa una RAV híbrida 2026"])[1]!;
    expect(r.motivo).toBe("competencia");
    expect(r.lead.autoId).toBe("crv");
    expect(texto(r)).toContain("no tienes que enchufarla");
    const [, , o] = charla(["Hola", "crv", "Crv o accord"]);
    expect(texto(o!)).toMatch(/^El Accord ahorita no lo tengo en piso/);
    expect(texto(o!)).not.toContain("🚗");
  });
});

describe("vendedora · respuestas a «¿te queda X o Y?»", () => {
  const ahora = new Date("2026-11-23T17:00:00Z");
  const libres = ["2026-11-24T16:00:00.000Z", "2026-11-24T22:00:00.000Z", "2026-11-26T16:00:00.000Z", "2026-11-28T17:00:00.000Z"].map((id) => ({ id, texto: textoCita(id, "America/Monterrey", ahora) }));
  const conv = { paso: "cita", autoId: "crv", autos: [], opciones: ["slot:2026-11-24T16:00:00.000Z", "slot:2026-11-24T22:00:00.000Z", "otra-hora"] };
  const dice = (texto: string, c: Record<string, unknown> = conv) => decidir({ cfg: { asesor: "Mario Abarca", horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" } }, inventario: [{ id: "crv", marca: "Honda", modelo: "CR-V", anio: 2027, precio: 830900 }], conv: c, msg: { texto, nombre: "Ana", enHorario: true }, ahora, libres }) as Resultado & { reserva?: { id: string } };
  it("«el primero», «la segunda», «la última» y «a las 4» apartan el horario ofrecido", () => {
    expect(dice("el primero").reserva?.id).toBe("2026-11-24T16:00:00.000Z");
    expect(dice("va la segunda").reserva?.id).toBe("2026-11-24T22:00:00.000Z");
    expect(dice("la última").reserva?.id).toBe("2026-11-24T22:00:00.000Z");
    expect(dice("a las 4 está bien").reserva?.id).toBe("2026-11-24T22:00:00.000Z");
  });
  it("un solo horario ese día: «¿te lo aparto?» y con «sí» queda", () => {
    const r = dice("el sábado");
    expect(r.respuestas[0]!.texto).toBe("El sábado 28 tengo a las 11 am. ¿Te lo aparto?");
    expect(dice("sí", r.conv).reserva?.id).toBe("2026-11-28T17:00:00.000Z");
  });
  it("«¿quién eres?» se presenta como Mario y «no gracias» se despide sin insistir", () => {
    expect(dice("quién eres?").respuestas[0]!.texto).toMatch(/^Soy Mario Abarca, asesor de Honda 🙂 Platicamos de la CR-V/);
    expect(dice("no gracias")).toMatchObject({ motivo: "no-gracias", lead: { calor: "frio" } });
  });
});
