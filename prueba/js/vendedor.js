// Sofía vendedora: asistente de ventas de autos por WhatsApp y Messenger, SIN IA.
// Muestra el inventario con foto y precio, cotiza crédito (estimado), anota la prueba de manejo y pasa la
// conversación al asesor. Módulo PURO (sin red ni almacenamiento): lo usan el conector, el simulador de la
// app y la demo de la página de ventas, así los tres contestan exactamente igual.
//
//   decidir({ cfg, inventario, conv, msg, ahora }) → { respuestas: [{ texto, foto? }], conv, lead, motivo }
//
// cfg: configuración del agente (asesor, agencia, horario, reglas, ventas: VENTAS_BASE).
// inventario: [{ id, marca, modelo, version, anio, precio, tipo: "nuevo"|"seminuevo", km, color, transmision,
//               descripcion, palabras: [apodos], foto (lo que el llamador sepa enviar), disponible }]
// conv: lo que Sofía recuerda de esta conversación (lo devuelve actualizado; el llamador lo guarda).
// msg: { texto, nombre, primero (primer mensaje del contacto), enHorario }
// lead: datos del prospecto que cambiaron (interés, forma de pago, enganche, cita, quiere asesor, calor).

export const VENTAS_BASE = {
  activo: true,
  tasaAnual: 15.9, // referencial, sin IVA ni seguro: siempre se aclara al cliente
  engancheMinimo: 20, // % del precio
  plazos: [24, 36, 48, 60],
  horasConAsesor: 0, // al volver a escribir el cliente, Sofía retoma; la pausa breve cubre respuestas manuales de Mario
  presentacion: "", // cómo saluda en el primer mensaje; vacío = "¡Hola {nombre}! 👋"
  ia: false, // con IA (opcional, de pago): contesta lo que el menú no entiende, con los mismos datos y reglas
  seguimiento: true, // al día siguiente y a los 3 días le escribe a quien se quedó callado (máx. 2 veces)
  resumenDiario: true, // a las 9 am le manda a Mario, a su chat «Tú», sus citas y pendientes del día
};
export const MAX_POR_HORA = 15; // freno contra bucles con otro contestador automático
const HORA = 3600 * 1000;
const MAX_LISTA = 10;

// ───────── Texto ─────────

export const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "¿Tienen la CR-V?" → "tienen la crv": sin acentos, signos ni guiones (CR-V, HR-V, CX-5 se escriben de mil formas). */
const compacto = (s) => sinAcentos(s).replace(/[-_]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** La palabra (o frase) aparece completa en el texto: sin acentos, sin mayúsculas, con límite de palabra. */
export function contienePalabra(texto, palabra) {
  const p = sinAcentos(palabra).trim();
  if (!p) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(p).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{N}])`, "u");
  return re.test(sinAcentos(texto));
}
const tieneAlguna = (t, lista) => lista.some((p) => contienePalabra(t, p));

/**
 * "ANA maría 🌸" → "Ana". Los nombres de perfil vienen como cada quien los escribió y los controla el cliente:
 * si el primero no parece un nombre (una liga, "{agencia}", 200 letras…) se omite en vez de repetirlo.
 */
export function primerNombre(nombre) {
  const t = String(nombre ?? "").normalize("NFC").split(/\s+/).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).find(Boolean) ?? "";
  if (t.length > 30 || !/^\p{L}[\p{L}\p{M}'’.-]*$/u.test(t)) return "";
  return t === t.toUpperCase() || t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

/**
 * Sustituye {nombre}, {asesor} y {agencia} (también {Nombre}: el teclado del teléfono pone mayúscula sola);
 * si alguno viene vacío no deja espacios sueltos ("¡Hola !") ni una coma al inicio ("{nombre}, gracias…").
 */
export function rellenar(plantilla, vars) {
  const t = plantilla.replace(/\{(nombre|asesor|agencia)\}/gi, (_, k) => vars[k.toLowerCase()] ?? "")
    .replace(/[ \t]+([,.!?;:])/g, "$1").replace(/([¡¿])[ \t]+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  const sinInicio = t.replace(/^[,.;:]+\s*/, "");
  return sinInicio === t ? t : sinInicio.charAt(0).toUpperCase() + sinInicio.slice(1);
}

/**
 * El asesor como se dice en una frase: con título lleva artículo («el Lic. Mario Abarca», «al…», «del…»);
 * sin título, solo el nombre («Mario», «a Mario», «de Mario»). prep: "" | "a" | "de".
 */
const TITULO = /^(licenciad[oa]|lic\.?da|lic|ingenier[oa]|ing\.?a|ing|señora|señor|sra|sr|doctora|doctor|dra|dr|arquitect[oa]|arq|contador[a]?|c\.\s?p)\.?\s+/i;
export function asesorCon(nombre, prep = "") {
  const n = String(nombre ?? "").trim();
  const la = /^(licenciada|lic\.?da|ingeniera|ing\.?a|sra|señora|dra|doctora|contadora|arquitecta)\.?(\s|$)/i.test(n);
  const el = !la && /^(lic|licenciado|ing|ingeniero|sr|señor|dr|doctor|arq|arquitecto|c\.\s?p|contador)\.?(\s|$)/i.test(n);
  const art = la ? "la" : el ? "el" : "";
  if (!art) return prep ? `${prep} ${n}` : n;
  if (art === "el" && prep === "a") return `al ${n}`;
  if (art === "el" && prep === "de") return `del ${n}`;
  return prep ? `${prep} ${art} ${n}` : `${art} ${n}`;
}
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const FORMATO = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
export const pesos = (n) => `$${FORMATO.format(Math.round(n))}`;

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** { dias: [1..6], inicio: "09:00", fin: "19:00" } → "lun a sáb de 9:00 a 19:00" */
export function textoHorario(horario) {
  const dias = [...new Set(horario?.dias ?? [])].sort((a, b) => a - b);
  if (!dias.length) return "";
  const hora = (x) => String(x ?? "").replace(/^0(\d)/, "$1");
  const seguidos = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const d = dias.length === 7 ? "todos los días" : dias.length > 2 && seguidos ? `${DIAS_CORTOS[dias[0]]} a ${DIAS_CORTOS[dias.at(-1)]}` : dias.map((x) => DIAS_CORTOS[x]).join(", ");
  return horario.inicio === horario.fin ? `${d}, todo el día` : `${d} de ${hora(horario.inicio)} a ${hora(horario.fin)}`;
}

// ───────── Crédito (estimado; no es oferta de ningún banco) ─────────

/** Mensualidad con amortización francesa. tasaAnual en % (ej. 15.9). */
export function mensualidad(monto, tasaAnual, meses) {
  if (!(monto > 0) || !(meses > 0)) return 0;
  const r = (Number(tasaAnual) || 0) / 100 / 12;
  return r ? (monto * r) / (1 - (1 + r) ** -meses) : monto / meses;
}

/**
 * Enganche que escribió el cliente: "20%", "el 30", "150 mil", "$80,000", "1.2 millones", "nada".
 * Sin unidad: menos de 100 es porcentaje y de 100 a 9,999 son miles ("150" → 150 mil). null si no hay monto.
 */
export function leerEnganche(texto, precio) {
  const t = sinAcentos(texto).replace(/\$/g, " ");
  if (/\b(nada|sin enganche|cero)\b/.test(t)) return 0;
  const pct = /(\d{1,2}(?:[.,]\d+)?)\s*(%|por\s*ciento)/.exec(t);
  if (pct) return (precio * Number(pct[1].replace(",", "."))) / 100;
  const mill = /(\d+(?:[.,]\d+)?)\s*(millon(es)?|mdp)\b/.exec(t);
  if (mill) return Number(mill[1].replace(",", ".")) * 1e6;
  const mil = /(\d+(?:[.,]\d+)?)\s*(mil|k)\b/.exec(t);
  if (mil) return Number(mil[1].replace(",", ".")) * 1000;
  const n = /(\d{1,3}(?:[,. ]\d{3})+|\d+)/.exec(t);
  if (!n) return null;
  const v = Number(n[1].replace(/[,. ]/g, ""));
  if (v < 100) return (precio * v) / 100;
  return v < 10000 ? v * 1000 : v;
}

// ───────── Inventario ─────────

export const nombreAuto = (a) => [a.marca, a.modelo, a.version, a.anio].filter(Boolean).join(" ");
const disponibles = (inv) => (inv ?? []).filter((a) => a && a.disponible !== false && (a.modelo || a.marca));

/** Autos que el cliente menciona: por modelo o apodo; solo la marca ("¿qué Honda tienen?") si no hay modelo. */
export function buscarAutos(texto, inventario) {
  const t = compacto(texto);
  const autos = disponibles(inventario);
  const clave = (s) => compacto(s);
  let hits = autos.filter((a) => [a.modelo, `${a.marca} ${a.modelo}`, ...(a.palabras ?? [])].map(clave).some((k) => k.length >= 2 && !/^\d+$/.test(k) && contienePalabra(t, k)));
  if (!hits.length) hits = autos.filter((a) => clave(a.marca).length >= 3 && contienePalabra(t, clave(a.marca)));
  const anio = /\b(19|20)\d{2}\b/.exec(t)?.[0];
  if (anio && hits.length > 1) {
    const mismos = hits.filter((a) => String(a.anio) === anio);
    if (mismos.length) hits = mismos;
  }
  return hits;
}

// ───────── Agenda de citas (pura): horarios libres según el horario de la agencia y las citas apartadas ─────────

const DIAS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const aMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

/** Día de la semana, fecha (AAAA-MM-DD) y minutos del día de un instante, en la zona horaria de la agencia. */
function local(fecha, zona) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zona, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(fecha).map((x) => [x.type, x.value]));
  return { dia: DIAS_EN[p.weekday], fecha: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), diaMes: Number(p.day) };
}

/** "hoy a las 4 pm", "mañana martes a las 11 am", "el jueves 12 a la 1 pm", "hoy a las 4:30 pm" */
export function textoCita(iso, zona = "America/Monterrey", ahora = new Date()) {
  const t = new Date(iso);
  const l = local(t, zona);
  const hoy = local(ahora, zona).fecha;
  const manana = local(new Date(ahora.getTime() + 24 * HORA), zona).fecha;
  const h24 = Math.floor(l.min / 60);
  const h12 = h24 % 12 || 12;
  const min = l.min % 60;
  const hora = `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h24 < 12 ? "am" : "pm"}`;
  const dia = l.fecha === hoy ? "hoy" : l.fecha === manana ? `mañana ${DIAS_LARGOS[l.dia]}` : `el ${DIAS_LARGOS[l.dia]} ${l.diaMes}`;
  return `${dia} ${h12 === 1 ? "a la" : "a las"} ${hora}`;
}

/**
 * Horarios libres para cita, cada hora en punto dentro del horario de la agencia, desde un poco después de ahora
 * y hasta `dias` días; sin los ya apartados. ocupadas: ids (ISO) de citas apartadas. → [{ id (ISO), texto }]
 */
export function horariosLibres({ horario, zonaHoraria = "America/Monterrey", ocupadas = [], ahora = new Date(), dias = 7, duracionMin = 60, anticipacionMin = 90, cuantos = 60 } = {}) {
  const h = horario?.dias?.length ? horario : { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" };
  const ini = aMin(h.inicio);
  const fin = h.inicio === h.fin ? 24 * 60 : aMin(h.fin);
  const tomadas = new Set(ocupadas.map((x) => new Date(x).toISOString()));
  const salida = [];
  let t = Math.ceil((ahora.getTime() + anticipacionMin * 60000) / HORA) * HORA; // la siguiente hora en punto
  const hasta = ahora.getTime() + dias * 24 * HORA;
  for (; t <= hasta && salida.length < cuantos; t += HORA) {
    const fecha = new Date(t);
    const l = local(fecha, zonaHoraria);
    if (!h.dias.includes(l.dia) || l.min < ini || l.min + duracionMin > fin) continue;
    const id = fecha.toISOString();
    if (!tomadas.has(id)) salida.push({ id, texto: textoCita(id, zonaHoraria, ahora), fecha: l.fecha, min: l.min });
  }
  return salida;
}

/** Tres opciones para ofrecer: la más pronta, una por la tarde y una de otro día (en la hora local de la agencia). */
function tresOpciones(libres) {
  const elegidas = [];
  const agregar = (x) => { if (x && !elegidas.includes(x) && elegidas.length < 3) elegidas.push(x); };
  agregar(libres[0]);
  agregar(libres.find((x) => x.min >= 15 * 60 && !elegidas.includes(x))); // tarde
  agregar(libres.find((x) => !elegidas.some((e) => e.fecha === x.fecha))); // otro día
  for (const x of libres) agregar(x);
  return elegidas.sort((a, b) => a.id.localeCompare(b.id));
}

// ───────── Intenciones (palabras completas, sin acentos) ─────────

const DICE = {
  asesor: ["asesor", "asesora", "vendedor", "vendedora", "una persona", "humano", "hablar con alguien", "llamenme", "llamame", "marcame", "me pueden llamar", "me puedes llamar", "una llamada"],
  cita: ["prueba de manejo", "manejar", "manejarlo", "manejarla", "probarlo", "probarla", "cita", "agendar", "agenda", "visitarlos", "ir a verlo", "ir a verla", "conocerlo", "conocerla", "puedo ir", "pasar a verlo", "pasar a verla", "visita", "ir a la agencia", "pasar a la agencia"],
  credito: ["credito", "financiamiento", "financiar", "financiado", "mensualidad", "mensualidades", "a meses", "plazos", "enganche", "cotizacion", "cotizar", "cotiza", "cotizame"],
  contado: ["contado", "de contado", "efectivo", "cash"],
  lista: ["catalogo", "inventario", "autos", "carros", "coches", "camionetas", "disponibles", "que tienen", "que tienes", "modelos", "unidades", "seminuevos", "nuevos"],
  precio: ["precio", "precios", "cuanto cuesta", "cuanto sale", "cuanto vale", "costo", "en cuanto", "cuanto es"],
  saludo: ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "que tal", "informacion", "info"],
  gracias: ["gracias", "muchas gracias", "mil gracias"],
};
const MENU = ["menu", "inicio", "opciones", "regresar", "volver"];
// Clientes que ya compraron o no vienen a comprar: se atienden como Mario, sin menú de ventas.
const POSTVENTA = ["devolucion", "devoluciones", "devolver", "devuelvan", "devuelven", "reembolso", "rembolso", "reembolsar", "garantia", "refaccion", "refacciones",
  "taller", "mantenimiento", "cita de servicio", "servicio de mi", "servicio a mi", "factura", "facturar", "facturacion", "falla", "fallas", "queja", "reclamo",
  "reclamacion", "cancelar mi", "cancelacion", "mi apartado", "mi deposito", "ya lo compre", "ya la compre", "ya compre", "me lo entregaron", "me la entregaron",
  "entrega de mi", "mis placas", "tarjeta de circulacion", "endoso", "pagare", "estado de cuenta", "domiciliacion"];
// Modelos Honda que la gente pide por nombre (sin inventario cargado igual se reconocen para llevarlos a la cita).
const MODELOS_HONDA = [["city", "City"], ["civic", "Civic"], ["accord", "Accord"], ["hrv", "HR-V"], ["brv", "BR-V"], ["crv", "CR-V"], ["pilot", "Pilot"], ["odyssey", "Odyssey"]];
const modeloMencionado = (texto) => { const t = compacto(texto); return MODELOS_HONDA.find(([k]) => contienePalabra(t, k))?.[1] ?? null; };
/** «del Civic», «de la CR-V» (las camionetas se dicen en femenino). */
const femenino = (m) => ["HR-V", "BR-V", "CR-V", "Pilot", "Odyssey"].includes(m);
const delModelo = (m) => (femenino(m) ? `de la ${m}` : `del ${m}`);
const NO_SABE = ["no se", "no lo se", "no tengo", "ninguno", "nada", "sin enganche", "lo minimo", "el minimo", "lo que sea", "no estoy seguro", "no estoy segura", "depende"];
/** Lo que dijo de enganche sin auto del inventario: «20%», «80 mil», «$80,000» → { texto, monto? , pct? } o null. */
function engancheDicho(texto) {
  const t = sinAcentos(texto);
  const pct = /(\d{1,2}(?:[.,]\d+)?)\s*(%|por\s*ciento)/.exec(t);
  if (pct) { const n = Number(pct[1].replace(",", ".")); return n > 0 && n < 100 ? { texto: `${n}%`, pct: n } : null; }
  if (!montoExplicito(texto)) return null;
  const n = leerEnganche(texto, 0);
  if (!(n >= 1000) || n > 1500000) return null; // más de 1.5 millones de enganche: casi seguro es un teléfono u otro número
  const monto = Math.round(n);
  return { texto: monto % 1000 === 0 && monto < 1e6 ? `${monto / 1000} mil` : pesos(monto), monto }; // «80 mil», como lo dice la gente
}
const NUMEROS = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
/** "2", "2.", "opción 2", "la 3", "#4", "dos" → número; cualquier otra cosa → null. */
function numeroElegido(texto) {
  const t = sinAcentos(texto).replace(/[^\p{L}\p{N}#\s]/gu, " ").trim();
  const m = /^(?:(?:opcion|la|el|numero|num|no|#)\s*)?(\d{1,2}|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)$/.exec(t);
  if (!m) return null;
  return NUMEROS[m[1]] ?? Number(m[1]);
}
/** El cliente ya dijo cuánto daría ("tengo 150 mil", "el 30%", "$80,000"), no un número suelto de menú. */
const montoExplicito = (texto) => /(\d\s*(%|por\s*ciento|mil\b|k\b|millon|mdp))|\$\s*\d|\d{1,3}([,.]\d{3})+|\d{4,}/.test(sinAcentos(texto));
const pareceFecha = (t) => /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|pasado|fin de semana|finde|semana|tarde|noche|mediodia|\d{1,2}\s*(:\d{2})?\s*(am|pm|hrs?|h)\b|\d{1,2}[/-]\d{1,2}|\d{1,2} de \w+)/.test(sinAcentos(t));

/** «a las 11», «a la 1», «11:30 am», «5pm» → minutos del día (horario de agencia: 1 a 7 sin am/pm es de la tarde); si no, null. */
function horaDicha(s) {
  const m = /\b(?:a|de|como a|tipo|para)?\s*las?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(s) || /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?)\b/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  if (m[3] === "pm" && h < 12) h += 12;
  else if (!m[3] && h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}
/** «mañana martes a las 10 am» → «mañana martes». */
const diaDe = (x) => x.texto.replace(/\s+a las?\s+.*$/, "");
/** Minutos del día de un horario libre (viene calculado; si no, se lee del texto). */
const minDe = (x) => x.min ?? horaDicha(sinAcentos(x.texto.slice(diaDe(x).length))) ?? 0;
/** Tres horas repartidas en el día: temprano, a medio día y en la tarde. */
const repartir = (xs) => (xs.length <= 3 ? xs : [xs[0], xs[Math.floor(xs.length / 2)], xs.at(-1)]);
/** Pasajeros del auto según su descripción o palabras («7 pasajeros»); 5 si no lo dice. */
const capacidad = (a) => Number(/(\d)\s*pasajeros/.exec(sinAcentos(`${a.descripcion ?? ""} ${(a.palabras ?? []).join(" ")}`))?.[1] ?? 5);
/** «para 7 personas», «somos ocho», «tercera fila» → personas; 0 si no lo dice. */
function personasDichas(t) {
  const m = /\b(\d{1,2}|cinco|seis|siete|ocho|nueve)\s*(personas|pasajeros|plazas|asientos|lugares|integrantes)\b/.exec(t) || /\bsomos\s+(\d{1,2}|cinco|seis|siete|ocho|nueve)\b/.exec(t);
  if (m) return NUMEROS[m[1]] ?? Number(m[1]);
  return /\b(familia grande|tercera fila|3 filas|tres filas)\b/.test(t) ? 7 : 0;
}
/** «a 48 meses», «48 mensualidades»; con `suelto`, también «48» solo. 0 si no. */
function plazoDicho(t, suelto = false) {
  const m = /\b(\d{1,2})\s*(meses|mensualidades)\b/.exec(t) || (suelto ? /^\s*(?:a|en|y a|y en)?\s*(\d{2})\s*\??\s*$/.exec(t) : null);
  const p = m ? Number(m[1]) : 0;
  return p >= 6 && p <= 84 ? p : 0;
}

// ───────── Respuestas ─────────

const LLAMADA = "Que te marque por teléfono";
const OPCIONES_MENU = ["lista", "credito", "cita", "asesor"];
const emojiNum = (i) => ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"][i] ?? `${i + 1}.`;
/** «a, b o c», como se dice en una plática. */
const yO = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} o ${xs.at(-1)}`);
const enumerar = (lineas) => lineas.map((l, i) => `${emojiNum(i)} ${l}`).join("\n");

/**
 * Decide qué contestar a un mensaje. Nunca lanza: si algo no cuadra, pasa la conversación al asesor.
 * Con respuestas: [] Sofía se queda callada (lo atiende el asesor, o es un bucle con otro bot).
 */
export function decidir({ cfg = {}, inventario = [], conv = {}, msg = {}, ahora = new Date(), libres = [] }) {
  const v = { ...VENTAS_BASE, ...(cfg.ventas ?? {}) };
  const now = ahora instanceof Date ? ahora : new Date(ahora);
  const c = { ...conv, autos: (conv.autos ?? []).filter((x) => now - new Date(x) < HORA), fallos: conv.fallos ?? 0 };
  const lead = {};
  const bruto = String(msg.texto ?? "");
  // El comando es un privilegio EXCLUSIVO del conector local y solo si éste verificó que
  // vino del chat «Tú». Un cliente normal jamás puede reiniciar el pase al asesor.
  const comandoPrueba = msg.pruebaLocal === true ? /^\/sofia(?:\s+([\s\S]*))?$/i.exec(bruto.trim()) : null;
  const texto = comandoPrueba ? (comandoPrueba[1]?.trim() || "menú") : bruto;
  const t = sinAcentos(texto);
  const vars = { nombre: primerNombre(msg.nombre), asesor: cfg.asesor || "tu asesor", agencia: cfg.agencia || "la agencia" };
  const asesor = cfg.asesor ? asesorCon(cfg.asesor) : "un asesor"; // «el Lic. Mario Abarca»
  const Asesor = mayus(asesor);
  const aAsesor = cfg.asesor ? asesorCon(cfg.asesor, "a") : "a un asesor";
  const horario = textoHorario(cfg.horario);
  const autos = disponibles(inventario);
  const porId = (id) => autos.find((a) => a.id === id);
  const quedar = (motivo) => ({ respuestas: [], conv: c, lead, motivo });

  if (msg.pruebaLocal && !comandoPrueba) return quedar("comando-prueba-requerido");
  // Al reanudar una prueba se limpia el bloqueo «asesor», sin quitar memoria comercial
  // ni alterar la regla de silencio de las conversaciones reales.
  if (comandoPrueba && c.paso === "asesor") {
    Object.assign(c, { paso: "menu", desde: now.toISOString(), opciones: null, fallos: 0 });
  }

  if (c.autos.length >= MAX_POR_HORA) return quedar("freno");
  const pideMenu = t.trim() === "0" || (texto.trim().split(/\s+/).length <= 3 && tieneAlguna(t, MENU));
  // Derechos del aviso de privacidad (privacidad.html): se contestan siempre, aunque ya lo atienda el asesor.
  const limpio = sinAcentos(texto).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(borra|borrar|borren|elimina|eliminar|eliminen) (todos )?mis datos\b/.test(limpio)) {
    Object.assign(lead, { pideBorrar: true, quiereAsesor: true });
    Object.assign(c, { paso: "asesor", desde: now.toISOString(), opciones: null, autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    return { respuestas: [{ texto: "Recibí tu solicitud para borrar tus datos. Te confirmo por este medio cuando quede hecho (máximo 15 días hábiles)." }], conv: c, lead, motivo: "borrar-datos" };
  }
  if (/\b(no|sin) (mas )?promociones\b|\bya no (me )?(manden|envien|mandes|envies) promociones\b/.test(limpio)) {
    lead.noPromociones = true;
    Object.assign(c, { autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    return { respuestas: [{ texto: "Listo, ya no te mando promociones. Cualquier cosa que necesites, aquí estoy 🙂" }], conv: c, lead, motivo: "sin-promociones" };
  }
  // Postventa (devolución, garantía, servicio, factura…): no se le vende. Mario contesta en primera persona,
  // le llega el aviso a su chat «Tú» y Sofía se queda callada en ese chat 12 horas para que él lo atienda.
  if (comandoPrueba) delete c.silencioHasta; // en el chat «Tú», /sofia siempre reanuda la prueba
  if (c.silencioHasta && now < new Date(c.silencioHasta) && !pideMenu) return quedar("postventa-silencio");
  // Se queja de que le contesta un bot: no se le responde más; Mario lo atiende personalmente.
  if (!comandoPrueba && /\b(bot|robot|contestadora|maquina|automatico|automatica)\b/.test(limpio)) {
    Object.assign(lead, { quiereAsesor: true });
    Object.assign(c, { paso: "asesor", desde: now.toISOString(), opciones: null, silencioHasta: new Date(now.getTime() + 12 * HORA).toISOString() });
    return quedar("dice-bot");
  }
  // «Ya no me interesa», «ya compré en otro lado»: se despide bonito y no se le vuelve a escribir.
  if (!comandoPrueba && /\b(ya no (me )?interesa|ya no estoy interesad[oa]|ya compre (en|con) otr\w*|ya compre otr\w*|ya adquiri otr\w*)\b/.test(limpio)) {
    Object.assign(lead, { calor: "perdido", noPromociones: true });
    Object.assign(c, { paso: "asesor", desde: now.toISOString(), opciones: null, autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    const nom = primerNombre(msg.nombre);
    return { respuestas: [{ texto: `Va${nom ? `, ${nom}` : ""}, gracias por avisarme. Si más adelante buscas auto, aquí estoy 🙂` }], conv: c, lead, motivo: "no-interesa" };
  }
  if (tieneAlguna(limpio, POSTVENTA)) {
    Object.assign(lead, { quiereAsesor: true, postventa: true });
    Object.assign(c, { paso: "asesor", desde: now.toISOString(), opciones: null, silencioHasta: new Date(now.getTime() + 12 * HORA).toISOString(), autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    const nom = primerNombre(msg.nombre);
    return { respuestas: [{ texto: `Claro${nom ? `, ${nom}` : ""}, déjame revisarlo y te confirmo en un momento.` }], conv: c, lead, motivo: "postventa" };
  }
  if (v.horasConAsesor > 0 && c.paso === "asesor" && now - new Date(c.desde ?? 0) < v.horasConAsesor * HORA && !pideMenu) return quedar("con-asesor");
  if (!texto.trim()) return quedar("vacio"); // stickers, audios, reacciones: los ve el asesor

  const resp = [];
  let motivo = "";
  let reserva = null; // horario apartado en este mensaje: { id, texto } (el llamador lo guarda en la agenda)
  const decir = (txt, foto) => resp.push(foto ? { texto: txt, foto } : { texto: txt });
  const ir = (paso, opciones = null) => { c.paso = paso; c.desde = now.toISOString(); c.opciones = opciones; };
  // Nunca la misma frase dos veces seguidas en un chat: rota entre formas de decir lo mismo.
  const variar = (clave, opciones) => { c.dichos = { ...(c.dichos ?? {}) }; const i = ((c.dichos[clave] ?? -1) + 1) % opciones.length; c.dichos[clave] = i; return opciones[i]; };
  // Cuando ya no entiende, en vez de dar vueltas: una frase como Mario, aviso a Mario y silencio 2 h en ese chat.
  const seCalla = () => { lead.quiereAsesor = true; c.silencioHasta = new Date(now.getTime() + 2 * HORA).toISOString(); ir("asesor"); return variar("me-pierdo", ["Déjame revisarlo bien y te escribo en un ratito.", "Dame chance de revisarlo y ahorita te escribo."]); };
  const calentar = (nivel) => { const orden = { frio: 0, tibio: 1, caliente: 2 }; if ((orden[nivel] ?? 0) > (orden[c.calor] ?? -1)) { c.calor = nivel; lead.calor = nivel; } };
  const elegirAuto = (a) => { c.autoId = a.id; lead.autoId = a.id; lead.interes = nombreAuto(a); if (a.precio > 0) lead.precio = a.precio; };
  const desde = (a) => {
    if (!(a.precio > 0)) return "";
    const plazo = Math.max(...v.plazos);
    return mensualidad(a.precio * (1 - v.engancheMinimo / 100), v.tasaAnual, plazo);
  };

  // ── Piezas de conversación ──
  const saludo = () => {
    let intro = rellenar(v.presentacion?.trim() || "¡Hola {nombre}! 👋", vars);
    const quien = cfg.asesor || "Mario Abarca";
    if (!sinAcentos(intro).toLowerCase().includes(sinAcentos(quien).toLowerCase())) intro += ` Soy ${quien}, de ${cfg.agencia || cfg.marca || "Honda"}.`;
    return intro;
  };
  const menu = (encabezado = "¿En qué te ayudo?") => {
    if (!autos.length) { // sin inventario: todo lleva a la cita
      ir("menu", ["cita", "asesor"]);
      return `${encabezado === "¿En qué te ayudo?" ? "" : `${encabezado} `}${variar("menu", ["¿Qué modelo traes en mente? Te paso info o, si prefieres, te marco.", "Dime qué auto te interesa y te ayudo con precio, corrida o una cita para que lo manejes."])}`;
    }
    ir("menu", OPCIONES_MENU);
    return `${encabezado === "¿En qué te ayudo?" ? "" : `${encabezado} `}${variar("menu", ["¿Qué auto andas buscando? Te paso los que tengo, te cotizo a crédito o te agendo para que lo manejes.", "Cuéntame qué modelo te interesa y te paso fotos, precio o la corrida."])}`;
  };
  const lista = (cuales = autos, pendiente = null, encabezado = null) => {
    if (!cuales.length) return pasarAsesor("Déjame confirmarte lo que tengo disponible hoy y te paso opciones.");
    const muestra = cuales.slice(0, MAX_LISTA);
    ir("lista", muestra.map((a) => `auto:${a.id}`));
    c.pendiente = pendiente;
    calentar("tibio");
    const lineas = muestra.map((a) => `*${nombreAuto(a)}*${a.precio > 0 ? ` — ${pesos(a.precio)}` : ""}${a.tipo === "seminuevo" && a.km ? ` · ${FORMATO.format(a.km)} km` : ""}`);
    const mas = cuales.length > MAX_LISTA ? `\n…y ${cuales.length - MAX_LISTA} más: escribe el modelo que buscas.` : "";
    return `${encabezado ?? (pendiente === "credito" ? "¿Para qué auto quieres la cotización?" : "Estos son los autos disponibles:")}\n${enumerar(lineas)}${mas}\n\nEscribe el número para ver detalles${pendiente === "credito" ? " y tu cotización" : " y fotos"}.`;
  };
  const ficha = (a) => {
    elegirAuto(a);
    calentar("tibio");
    ir("auto", ["cotizar", "cita", "lista", "asesor"]);
    const detalles = [a.tipo === "seminuevo" ? `Seminuevo${a.km ? ` · ${FORMATO.format(a.km)} km` : ""}` : a.tipo === "nuevo" ? "Nuevo" : "", a.transmision, a.color].filter(Boolean).join(" · ");
    const m = desde(a);
    const datos = [
      `🚗 *${nombreAuto(a)}*`,
      a.precio > 0 ? `💵 *${pesos(a.precio)}* de contado` : "💵 Precio: te lo confirmo en un momento",
      detalles && `🔹 ${detalles}`,
      a.descripcion?.trim(),
      m && `💳 A crédito desde ~${pesos(m)} al mes (${v.engancheMinimo}% de enganche, ${Math.max(...v.plazos)} meses)*`,
    ].filter(Boolean);
    return `${datos.join("\n")}\n\n${variar("ficha", ["¿Te la cotizo a crédito o prefieres venir a manejarla?", "¿Cómo la quieres, a crédito o de contado? Si gustas también te agendo una prueba de manejo."])}${m ? `\n\n_*Estimado con tasa referencial de ${v.tasaAnual}% anual; sujeto a aprobación._` : ""}`;
  };
  const pedirEnganche = (a) => {
    elegirAuto(a);
    calentar("caliente");
    lead.formaPago = "credito";
    ir("enganche");
    if (!(a.precio > 0)) return pasarAsesor(`Déjame armarte la cotización de la *${nombreAuto(a)}* con el precio vigente.`);
    return `Para cotizar la *${nombreAuto(a)}* (${pesos(a.precio)}) a crédito: ¿cuánto te gustaría dar de enganche? 💰\nPuede ser en pesos o porcentaje (mínimo ${v.engancheMinimo}%), por ejemplo «${v.engancheMinimo}%» o «${FORMATO.format(Math.round(a.precio * v.engancheMinimo / 100 / 1000))} mil».`;
  };
  const cotizar = (a, enganche) => {
    elegirAuto(a);
    calentar("caliente");
    lead.formaPago = "credito";
    const minimo = a.precio * v.engancheMinimo / 100;
    if (enganche >= a.precio) {
      lead.formaPago = "contado";
      ir("cotizado", ["cita", "lista", "asesor"]);
      return `¡Con eso la pagas de contado! 🎉 La *${nombreAuto(a)}* queda en *${pesos(a.precio)}*. ¿Cuándo vienes a verla?`;
    }
    const ajustado = enganche < minimo;
    const eng = Math.max(enganche, minimo);
    lead.enganche = Math.round(eng);
    c.enganche = Math.round(eng); // para contestar «¿y a 48 meses?» sin volver a preguntar
    const filas = v.plazos.map((p) => `• ${p} meses: *${pesos(mensualidad(a.precio - eng, v.tasaAnual, p))}*`);
    lead.plazo = Math.max(...v.plazos);
    lead.mensualidad = Math.round(mensualidad(a.precio - eng, v.tasaAnual, lead.plazo));
    ir("cotizado", ["cita", "lista", "asesor"]);
    return [
      ajustado ? `El enganche mínimo es de ${v.engancheMinimo}% (${pesos(minimo)}). Con eso te queda así:` : `Con ${pesos(eng)} de enganche para la *${nombreAuto(a)}*:`,
      filas.join("\n"),
      `_Estimado con tasa referencial de ${v.tasaAnual}% anual; no incluye seguro ni comisión. Sujeto a aprobación._`,
      "",
      variar("cotizado", ["¿Te late venir a verla y te armo la cotización formal?", "¿Cuándo te queda venir para manejarla y cerrar números?"]),
    ].join("\n");
  };
  const contado = (a) => {
    lead.formaPago = "contado";
    calentar("tibio");
    if (!a) return lista(autos, null, "¡Perfecto, de contado! ¿Qué auto te interesa?");
    elegirAuto(a);
    ir("cotizado", ["cita", "lista", "asesor"]);
    return `¡Excelente! De contado la *${nombreAuto(a)}* queda en *${a.precio > 0 ? pesos(a.precio) : "el precio que te confirmo en un momento"}*. ¿Cuándo te queda venir a verla?`;
  };
  const pedirCita = (intro = "") => {
    calentar("caliente");
    const auto = porId(c.autoId);
    const que = auto ? `la ${nombreAuto(auto)}` : c.modelo ? `${femenino(c.modelo) ? "la" : "el"} ${c.modelo}` : "";
    const ops = tresOpciones(libres);
    if (ops.length) { // horarios reales de la agenda: el cliente elige uno y queda apartado
      ir("cita", [...ops.map((x) => `slot:${x.id}`), "otra-hora"]);
      return `${intro ? `${intro} ` : ""}¿Cuándo puedes venir${que ? ` a ver ${que}` : ""}? Tengo espacio ${yO(ops.map((x) => x.texto))}, o dime qué día te acomoda.`;
    }
    ir("cita");
    return `${intro ? `${intro} ` : ""}¿Qué día y a qué hora te gustaría venir${que ? ` a ver ${que}` : ""}?${horario ? ` Puedo recibirte ${horario}.` : ""}`;
  };
  const apartar = (id) => {
    const x = libres.find((l) => l.id === id);
    if (!x) return pedirCita(); // se ocupó mientras tanto: otras opciones
    reserva = { id: x.id, texto: x.texto };
    Object.assign(lead, { cita: x.texto, citaId: x.id, citaConfirmada: true });
    calentar("caliente");
    ir("nombre");
    return `Listo, quedó ${x.texto}. ¿A nombre de quién?`;
  };
  const anotarCita = (cuando) => {
    const a = porId(c.autoId);
    lead.cita = cuando.trim().slice(0, 120);
    lead.quiereAsesor = true;
    calentar("caliente");
    ir("asesor");
    return variar("cita-ok", [`Perfecto, ahí te espero${a ? ` para que veas la ${nombreAuto(a)}` : ""}. Te confirmo el horario en un ratito.`, "Va, lo aparto y te confirmo en un momento."]);
  };
  function pasarAsesor(intro = "") {
    lead.quiereAsesor = true;
    calentar("caliente");
    ir("asesor");
    // Sofía ES Mario: nunca «le aviso al asesor». Mario recibe el aviso aparte, en su chat «Tú».
    const llamar = /\b(llam|marc|marqu|telefono|tel\b)/.test(t);
    return `${intro ? `${intro}\n` : ""}${msg.enHorario === false ? `Va, en cuanto me desocupe te ${llamar ? "marco" : "escribo"}${horario ? ` (${horario})` : ""}.` : `Claro, dame unos minutos y te ${llamar ? "marco 📞" : "escribo"}.`}`;
  }
  // Sin inventario: se pregunta el modelo; con precio o información, la corrida (cuánto de enganche) y luego la cita.
  const preguntarModelo = () => { ir("menu", ["cita", "asesor"]); return variar("modelo", ["¿Qué modelo traes en mente?", "¿Andas buscando sedán o camioneta? Tengo City, Civic, HR-V, BR-V, CR-V y más.", "¿Cuál te late más? Así te paso precio y te armo la corrida."]); };
  const pedirCorrida = () => {
    calentar("tibio");
    ir("corrida");
    const del = c.modelo ? ` ${delModelo(c.modelo)}` : "";
    return variar("corrida", [`Claro, te hago una corrida${del}. ¿Como cuánto tienes pensado dar de enganche?`, `Va, te la armo${del}. ¿Con cuánto de enganche te gustaría arrancar, más o menos?`, `Con gusto te cotizo${del}. ¿Traes algo pensado para el enganche o lo vemos con lo mínimo?`]);
  };
  const conEnganche = (e) => {
    lead.formaPago = "credito";
    if (e?.monto) lead.enganche = e.monto;
    if (e?.pct) lead.enganchePct = e.pct;
    return pedirCita(e ? `Va, con ${e.texto} te armo la corrida.` : "Va, te la armo con 20, 30, 40 y 50% de enganche para que veas cuál te acomoda.");
  };
  // «mañana a las 11», «el sábado», «a la 1»: si hay agenda, se aparta o se ofrecen horas reales de ESE día.
  const citaPara = (txt) => {
    const s = sinAcentos(txt);
    const hora = horaDicha(s);
    const dia = /\bhoy\b/.test(s) ? "hoy"
      : /\bmanana\b/.test(s) && !/\b(en|por|de) la manana\b/.test(s) ? "manana"
        : ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"].find((d) => new RegExp(`\\b${d}\\b`).test(s));
    let candidatos = [];
    if (dia) {
      candidatos = libres.filter((x) => { const tx = sinAcentos(x.texto); return dia === "hoy" ? tx.startsWith("hoy") : dia === "manana" ? tx.startsWith("manana") : tx.includes(dia); });
      const primerDia = candidatos[0] && diaDe(candidatos[0]);
      candidatos = candidatos.filter((x) => diaDe(x) === primerDia);
    } else if (hora !== null) {
      candidatos = (c.opciones ?? []).filter((o) => o.startsWith("slot:")).map((o) => libres.find((l) => l.id === o.slice(5))).filter(Boolean);
    }
    if (!libres.length || (!dia && !candidatos.length)) return anotarCita(txt);
    if (dia && !candidatos.length) return pedirCita(dia === "hoy" ? "Hoy ya no me queda espacio." : "Ese día ya lo tengo lleno.");
    const exacta = hora !== null ? candidatos.find((x) => minDe(x) === hora) : null;
    if (exacta) return apartar(exacta.id);
    const ops = (hora !== null ? [...candidatos].sort((a, b) => Math.abs(minDe(a) - hora) - Math.abs(minDe(b) - hora)) : repartir(candidatos)).slice(0, 3).sort((a, b) => a.id.localeCompare(b.id));
    calentar("caliente");
    ir("cita", [...ops.map((x) => `slot:${x.id}`), "otra-hora"]);
    const diaTxt = diaDe(ops[0]);
    const horas = ops.map((x) => x.texto.slice(diaTxt.length).trim());
    return `${hora !== null ? `A esa hora ya lo tengo ocupado, pero ${diaTxt}` : mayus(diaTxt)} tengo espacio ${yO(horas)}. ¿Cuál te acomoda?`;
  };
  const accion = (a) => {
    if (a.startsWith("slot:")) return apartar(a.slice(5));
    if (a === "otra-hora") { ir("cita"); return "Sale, ¿qué día y a qué hora te acomoda? (por ejemplo «sábado 11 am»)"; }
    if (a.startsWith("auto:")) {
      const auto = porId(a.slice(5));
      if (!auto) return lista(autos, null, "Ese auto ya no está disponible 😕. Estos sí:");
      const pendiente = c.pendiente;
      c.pendiente = null;
      return pendiente === "credito" ? pedirEnganche(auto) : { texto: ficha(auto), foto: auto.foto };
    }
    switch (a) {
      case "lista": return lista();
      case "credito": { const auto = porId(c.autoId); return auto ? pedirEnganche(auto) : lista(autos, "credito"); }
      case "cotizar": { const auto = porId(c.autoId); return auto ? pedirEnganche(auto) : lista(autos, "credito"); }
      case "cita": return pedirCita();
      case "asesor": return pasarAsesor();
      default: return menu();
    }
  };

  try {
    const primero = Boolean(msg.primero) && !c.paso;
    const mencionados = buscarAutos(texto, autos);
    const n = numeroElegido(texto);
    const dice = Object.fromEntries(Object.entries(DICE).map(([k, ps]) => [k, tieneAlguna(t, ps)]));
    if (mencionados.length === 1) elegirAuto(mencionados[0]);
    const modelo = !mencionados.length ? modeloMencionado(texto) : null;
    if (modelo) { c.modelo = modelo; lead.interes = `${cfg.marca || "Honda"} ${modelo}`; }
    const eng = !autos.length ? engancheDicho(texto) : null;

    // 1. Lo que contesta a la pregunta anterior de Sofía.
    if (pideMenu) { motivo = "menu"; decir(menu()); }
    else if (c.paso === "nombre" && texto.trim().split(/\s+/).length <= 5 && !dice.asesor) {
      motivo = "nombre"; // después de apartar: su nombre, y la plática ya la sigue el asesor
      lead.nombreCliente = texto.trim().replace(/^(soy|me llamo|a nombre de)\s+/i, "").slice(0, 60);
      lead.quiereAsesor = true;
      ir("asesor");
      decir(`Gracias, ${primerNombre(lead.nombreCliente) || lead.nombreCliente}. Al llegar a la agencia pregunta por mí, ${cfg.asesor || "Mario Abarca"}, y salgo a recibirte.`);
    }
    else if (c.paso === "corrida" && !dice.asesor && !dice.cita && !dice.contado && !(modelo && !eng) && (eng || tieneAlguna(t, NO_SABE) || c.fallos >= 1)) {
      motivo = "corrida";
      decir(conEnganche(eng));
    }
    else if (n !== null && c.opciones?.[n - 1] && c.paso !== "enganche") {
      motivo = c.opciones[n - 1].split(":")[0];
      const r = accion(c.opciones[n - 1]);
      if (typeof r === "string") decir(r); else decir(r.texto, r.foto || undefined);
    }
    else if (c.paso === "cotizado" && c.enganche > 0 && porId(c.autoId)?.precio > 0 && plazoDicho(t, true)) {
      motivo = "plazo"; // «¿y a 48 meses?» después de la corrida
      const a = porId(c.autoId);
      const p = plazoDicho(t, true);
      const m = mensualidad(a.precio - c.enganche, v.tasaAnual, p);
      Object.assign(lead, { formaPago: "credito", plazo: p, mensualidad: Math.round(m), enganche: c.enganche });
      calentar("caliente");
      ir("cotizado", ["cita", "lista", "asesor"]);
      decir(`A ${p} meses te queda en *${pesos(m)}* al mes, con ${pesos(c.enganche)} de enganche. ${variar("plazo", ["¿Cuándo vienes a manejarla y lo dejamos amarrado?", "Si te late, te aparto una cita para cerrar números. ¿Qué día puedes?"])}`);
    }
    else if ((c.paso === "enganche" || (["auto", "cotizado"].includes(c.paso) && montoExplicito(texto))) && !dice.asesor && porId(c.autoId)?.precio > 0 && leerEnganche(texto, porId(c.autoId).precio) !== null) {
      motivo = "cotizacion";
      decir(cotizar(porId(c.autoId), leerEnganche(texto, porId(c.autoId).precio)));
    } else if (["cita", "cotizado", "auto"].includes(c.paso) && !dice.asesor && (pareceFecha(texto) || (c.paso === "cita" && horaDicha(t) !== null))) {
      motivo = "cita-anotada"; // aparta la hora si está libre; si no, ofrece las de ese día
      decir(citaPara(texto));
    }
    // 2. Lo que pide el cliente, de lo más importante a lo menos.
    else if (dice.asesor) { motivo = "asesor"; decir(pasarAsesor()); }
    else if (/\b(fotos?|fotitos?|imagen|imagenes)\b/.test(t)) {
      motivo = "fotos";
      const a = mencionados.length === 1 ? mencionados[0] : porId(c.autoId);
      if (a?.foto) { elegirAuto(a); calentar("tibio"); decir(variar("fotos", [`Claro, mira 📸 así está la ${nombreAuto(a)}. ¿Te gustaría verla en persona?`, `Va, aquí te va la ${nombreAuto(a)} 📸 ¿Cuándo te late venir a manejarla?`]), a.foto); }
      else if (a) decir(pasarAsesor("Déjame tomarle unas fotos y te las mando."));
      else if (autos.length) decir(lista(mencionados.length > 1 ? mencionados : autos, null, "¡Claro! ¿De cuál te mando fotos?"));
      else decir(preguntarModelo());
    }
    else if (dice.cita) { motivo = "cita"; decir(pareceFecha(texto) ? citaPara(texto) : pedirCita()); }
    else if (dice.credito && autos.length) {
      motivo = "credito";
      const a = mencionados.length === 1 ? mencionados[0] : porId(c.autoId);
      if (a?.precio > 0 && montoExplicito(texto) && leerEnganche(texto, a.precio) !== null) { motivo = "cotizacion"; decir(cotizar(a, leerEnganche(texto, a.precio))); }
      else decir(a ? pedirEnganche(a) : lista(mencionados.length > 1 ? mencionados : autos, "credito"));
    }
    else if (dice.contado && autos.length) { motivo = "contado"; decir(contado(mencionados.length === 1 ? mencionados[0] : porId(c.autoId))); }
    else if (personasDichas(t) >= 6 && autos.length && mencionados.length !== 1) {
      motivo = "lista"; // «camioneta para 7»: solo las que caben
      const p = personasDichas(t);
      const caben = autos.filter((a) => capacidad(a) >= p).sort((a, b) => (a.precio || 9e9) - (b.precio || 9e9));
      decir(caben.length ? lista(caben, null, `Para ${p} personas te recomiendo:`) : pasarAsesor(`Para ${p} personas déjame checar qué opción te queda mejor.`));
    }
    else if (autos.length && (/\b(mas barat\w*|mas economic\w*|menos car\w*|mas accesible|algo barato|economic\w*)\b/.test(t) || (/\b(hasta|maximo|no mas de|presupuesto)\b/.test(t) && montoExplicito(texto)))) {
      motivo = "lista";
      const tope = /\b(hasta|maximo|no mas de|presupuesto)\b/.test(t) && montoExplicito(texto) ? leerEnganche(texto, 0) : 0;
      const ref = tope >= 100000 ? tope + 1 : porId(c.autoId)?.precio || Infinity;
      const porPrecio = autos.filter((a) => a.precio > 0).sort((a, b) => a.precio - b.precio);
      const bajo = porPrecio.filter((a) => a.precio < ref);
      decir(bajo.length
        ? lista(ref === Infinity ? bajo.slice(0, 3) : bajo, null, tope >= 100000 ? "Con ese presupuesto te alcanza para:" : "Claro, lo más accesible que tengo:")
        : lista(porPrecio.slice(0, 3), null, "Lo más accesible que tengo es esto:"));
    }
    else if (c.paso === "lista" && dice.precio && !mencionados.length && !modelo) {
      motivo = "lista-precio"; // ya vio la lista con precios: no se la repite
      decir(variar("lista-precio", ["El precio viene junto a cada uno 👆 ¿Cuál te late? Te mando fotos y te armo la corrida.", "Ahí arriba te puse los precios. ¿Cuál te interesa más?"]));
    }
    else if (mencionados.length === 1) { motivo = "auto"; const a = mencionados[0]; decir(ficha(a), a.foto || undefined); }
    else if (mencionados.length > 1) { motivo = "lista"; decir(lista(mencionados, null, "Tengo estas opciones:")); }
    else {
      // 3. Las respuestas propias del asesor (ubicación, garantía…) y lo general.
      const regla = (cfg.reglas ?? []).find((r) => (r.palabras ?? []).some((p) => contienePalabra(texto, p)));
      if (regla) { motivo = "regla"; decir(rellenar(regla.respuesta, vars)); }
      else if ((dice.lista || dice.precio) && autos.length) {
        motivo = "lista";
        const semi = tieneAlguna(t, ["seminuevo", "seminuevos", "usado", "usados"]);
        const nuevos = !semi && tieneAlguna(t, ["nuevo", "nuevos", "0 km"]);
        const filtro = semi ? autos.filter((a) => a.tipo === "seminuevo") : nuevos ? autos.filter((a) => a.tipo === "nuevo") : autos;
        decir(lista(filtro.length ? filtro : autos, null, filtro.length && (semi || nuevos) ? `Estos son los ${semi ? "seminuevos" : "nuevos"} disponibles:` : null));
      }
      else if (dice.lista || dice.precio || dice.credito || dice.contado || modelo) {
        // Sin inventario no hay cifras: se ofrece la corrida (pide enganche) y el asesor la da exacta en la cita.
        if (dice.contado) { motivo = "cita"; lead.formaPago = "contado"; decir(pedirCita("Va, de contado también te armo la corrida.")); }
        else if (eng) { motivo = "corrida"; decir(conEnganche(eng)); }
        else if (dice.precio || dice.credito || modelo) { motivo = "corrida"; decir(pedirCorrida()); }
        else { motivo = "menu"; decir(preguntarModelo()); }
      }
      else if (primero || dice.saludo) { motivo = "menu"; decir(autos.length ? menu() : preguntarModelo()); }
      else if (dice.gracias) { motivo = "gracias"; decir(variar("gracias", ["¡Con gusto! Aquí ando para lo que ocupes 😊", "A ti. Cualquier duda me escribes."])); c.opciones = OPCIONES_MENU; c.paso = "menu"; }
      else if (c.paso === "enganche") { motivo = "no-entendi"; c.fallos += 1; decir(c.fallos >= 2 ? pasarAsesor("No logré entender el enganche 🙈.") : "¿Cuánto darías de enganche? Escríbelo en pesos o porcentaje, por ejemplo «20%» o «100 mil»."); }
      else if (c.paso === "cita") { motivo = "no-entendi"; c.fallos += 1; decir(c.fallos >= 2 ? seCalla() : variar("cita-otra", ["¿Qué día y a qué hora te queda mejor para venir?", "¿Te acomoda más entre semana o el sábado? Dime el día y la hora."])); }
      else if (c.paso === "corrida") { motivo = "no-entendi"; c.fallos += 1; decir(variar("corrida-otra", ["¿Más o menos cuánto podrías dar de enganche? Aunque sea aproximado.", "Si no lo tienes claro, te la armo con lo mínimo y vemos opciones. ¿Va?"])); }
      else if (!autos.length) { motivo = "no-entendi"; c.fallos += 1; decir(c.fallos >= 2 ? seCalla() : variar("no-entendi", ["Perdona, ¿me lo explicas tantito más? 🙏", "Te leo, pero no me quedó claro. ¿Qué andas buscando?"])); }
      else { motivo = "no-entendi"; c.fallos += 1; decir(c.fallos >= 2 ? seCalla() : variar("no-entendi", ["Perdona, ¿me lo explicas tantito más? 🙏 ¿Qué auto andas buscando?", "Te leo, pero no me quedó claro. ¿Buscas algún modelo en especial o te paso lo que tengo?"])); }
    }
    if (motivo !== "no-entendi") c.fallos = 0;
    // Primer mensaje: siempre se presenta antes de lo demás.
    if (primero && resp.length) resp[0] = { ...resp[0], texto: `${saludo()}\n${resp[0].texto}` };
  } catch {
    resp.length = 0;
    motivo = "asesor";
    decir(pasarAsesor());
  }
  if (resp.length) c.autos = [...c.autos, now.toISOString()];
  c.ultimo = now.toISOString();
  return { respuestas: resp, conv: c, lead, motivo, ...(reserva ? { reserva } : {}) };
}

// ───────── IA opcional: solo para lo que el menú no entiende ─────────
// El llamador (conector o app) hace la llamada a Claude con su propia llave; aquí solo se arma el prompt y se
// aplica la respuesta, para que el servidor y el simulador se comporten igual.

/**
 * Cifras de dinero y porcentajes de un texto, para comparar sin importar cómo se escribieron:
 * "$8,450" y "8450" → 8450; "80 mil" → 80000; "1.2 millones" → 1200000; "20 %" → "20%".
 * No cuenta horas, días, plazos en meses ni años (2026).
 */
export function cifras(texto) {
  const salida = [];
  const re = /(\$\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)\s*(%|por\s*ciento|mil\b|k\b|millon(?:es)?\b|mdp\b)?/g;
  for (const m of sinAcentos(texto).matchAll(re)) {
    const crudo = m[2];
    const conComas = /^\d{1,3}(,\d{3})+/.test(crudo);
    const n = Number(conComas ? crudo.replace(/,/g, "") : crudo.replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const unidad = m[3] ?? "";
    if (/^(%|por)/.test(unidad)) salida.push(`${n}%`);
    else if (/^(millon|mdp)/.test(unidad)) salida.push(Math.round(n * 1e6));
    else if (/^(mil|k)/.test(unidad)) salida.push(Math.round(n * 1000));
    else if (m[1] || conComas) salida.push(Math.round(n));
    else if (n >= 1000 && !(Number.isInteger(n) && n >= 1990 && n <= 2040)) salida.push(Math.round(n));
  }
  return salida;
}

export const ESQUEMA_IA = {
  type: "object",
  properties: {
    respuesta: { type: "string", description: "El mensaje de WhatsApp para el cliente" },
    pasar_a_asesor: { type: "boolean", description: "true cuando ya toca que el asesor lo atienda" },
    auto_id: { type: "string", description: "id del auto del inventario del que se habla, o vacío" },
    resumen: { type: "string", description: "Para el asesor: quién es, qué busca, cómo paga, qué falta y qué sigue (2-4 renglones)" },
    forma_pago: { type: "string", description: "contado, credito o vacío si no se sabe" },
    cita: { type: "string", description: "día y hora que propuso el cliente para venir, o vacío" },
    reservar: { type: "string", description: "id EXACTO de la lista de horarios libres que el cliente ACEPTÓ en este mensaje, o vacío" },
    nombre: { type: "string", description: "nombre del cliente si ya lo dijo, o vacío" },
    modelo: { type: "string", description: "modelo que le interesa (ej. CR-V, Civic), o vacío" },
  },
  required: ["respuesta", "pasar_a_asesor", "auto_id", "resumen", "forma_pago", "cita", "reservar", "nombre", "modelo"],
  additionalProperties: false,
};

/**
 * historial: [{ dir: "in"|"out", text }] de la conversación (el último es el mensaje del cliente).
 * Devuelve { system, messages } para la API de mensajes. El texto del cliente va solo como mensaje del
 * usuario: nunca como instrucción.
 */
export function promptIA({ cfg = {}, inventario = [], historial = [], libres = [] }) {
  const nombre = cfg.asesor || "el asesor";
  const quien = cfg.asesor ? asesorCon(cfg.asesor) : "el asesor"; // «Mario Abarca» (con título: «el Lic. …»)
  const pila = primerNombre(nombre.replace(TITULO, "")) || nombre; // «Mario»
  const marca = cfg.marca || "Honda";
  const agencia = cfg.agencia || marca;
  const autos = disponibles(inventario).map((a) => ({
    id: a.id, auto: nombreAuto(a), precio_contado: a.precio > 0 ? pesos(a.precio) : "te lo confirmo en un momento", tipo: a.tipo, km: a.km || undefined,
    color: a.color || undefined, transmision: a.transmision || undefined, descripcion: a.descripcion || undefined,
  }));
  const corridas = String(cfg.corridas ?? "").trim().slice(0, 12000);
  const reglas = (cfg.reglas ?? []).map((r) => `- Si preguntan por ${(r.palabras ?? []).join(", ")}: ${r.respuesta}`).join("\n");
  // Mensajes reales del asesor: los que la app tomó de «Mi estilo de venta» y los que el servidor aprendió de su historial.
  const ejemplos = [...(cfg.estilo?.ejemplos ?? []), ...(cfg.estilo?.deChats ?? [])].slice(0, 40);
  const opciones = libres.slice(0, 30);
  const system = [
    `Eres ${quien}, asesor de ventas de ${marca}${agencia !== marca ? ` (${agencia})` : ""} en Monterrey. Responde en primera persona como Mario, con su estilo cercano, atento y directo. No uses el nombre Sofía ni te presentes espontáneamente como secretaria o bot. No afirmes que hiciste algo que no hayas hecho. Si preguntan directamente si eres una IA, responde con honestidad que eres el asistente digital que contesta por Mario.`,
    `Tu meta: ayudar al cliente a elegir un auto, resolver sus dudas y facilitar una visita con cita. La cita no termina la conversación: después de confirmarla, sigue contestando con naturalidad, ofrece ayuda con preparación, documentos o dudas del vehículo y no repitas la invitación a cada mensaje.`,
    "",
    "Cómo escribes:",
    "- Como una persona normal por WhatsApp: cálido, muy servicial, atento y con humor ligero cuando encaje. Corto (1 o 2 renglones), sencillo y amable. Sin listas ni menús.",
    "- Mantén siempre un trato respetuoso y profesional. No sexualices al cliente, no hagas insinuaciones ni comentarios sobre su cuerpo o atractivo. No confundas amabilidad con coqueteo.",
    "- Nada de frases de vendedor ni de call center: «con gusto te ayudo», «excelente elección», «promoción del mes», «lo siento», «no puedo», «¿en qué más te ayudo?».",
    "- Una pregunta a la vez. No repitas lo que ya dijiste. Si te saludan, saluda.",
    pila !== quien ? `- Si hablas de él di «${quien}», nunca solo «${pila}» ni «${pila} te dice».` : "",
    "- Horas como se dicen: «mañana a las 10», «hoy a las 4».",
    ejemplos.length ? `- Así escribe ${quien} en sus chats (copia su forma de escribir, no los datos):\n${ejemplos.map((x) => `  · ${x.replace(/\s+/g, " ")}`).join("\n")}` : "",
    cfg.estilo?.notas ? `- Indicaciones ${asesorCon(nombre, "de")}: ${cfg.estilo.notas}` : "",
    "",
    "Qué haces:",
    "- Si pide precio, información o mensualidades: ofrécele una corrida y pregúntale como cuánto tiene pensado dar de enganche. Si no sabe, dile que se la armas con 20, 30, 40 y 50%.",
    "- Si no sabes qué modelo busca, pregúntaselo.",
    corridas ? "- Ya con el enganche, si su modelo está en CORRIDAS, dale el ejemplo más cercano tal cual (enganche, plazo y mensualidad), dile que es aproximado y pregúntale cuándo puede venir a verlo." : "",
    `- ${corridas ? "Si su modelo no está en CORRIDAS" : "Aún no tienes las cifras"}: no des números. Dile que se la armas y pregúntale cuándo puede venir a verla. Si la quiere por aquí, dile que ahorita se la mandas tú (pasar_a_asesor = true). Nunca digas que le avisas a un asesor ni que alguien más le escribe: tú eres Mario.`,
    "- Para la cita ofrece DOS horarios de la lista de libres. Si pide otro, el más cercano de la lista.",
    "- Si acepta un horario: pon su id exacto en «reservar», confírmale día y hora y pregúntale a nombre de quién.",
    `- Confirma claramente el día y la hora de la cita. Si tienes el nombre, di: «Al llegar a la agencia pregunta por mí, ${nombre}, y salgo a recibirte.» pasar_a_asesor = true solo sirve para avisarle a ${quien}; no des por terminada la conversación. Si el cliente vuelve a escribir después, responde sus dudas y sigue ayudando.`,
    "- Si duda («luego paso», «solo estoy viendo»): sin presionar, dale una razón para venir (verlo, manejarlo, su corrida).",
    "",
    "Nunca:",
    "- Inventes cifras (precios, mensualidades, tasas, descuentos, avalúos, entregas). Solo las de CORRIDAS o las de los autos con precio.",
    "- Digas que la agencia está cerrada o que no puedes atender por la hora. Sigue ayudando por aquí y acuerda una visita en un horario disponible.",
    `- Digas espontáneamente que eres bot, secretaria o asistente. Si te preguntan directamente si eres una IA, dilo con honestidad y ofrece que ${quien} le escriba personalmente.`,
    "",
    `pasar_a_asesor = true también si pide negociar, descuento o hablar contigo por llamada (dile que le marcas en unos minutos). Si el cliente ya compró o habla de devolución, garantía, servicio, factura o trámites: no le vendas, dile que lo revisas y le confirmas en un momento, y pasar_a_asesor = true.`,
    `resumen (siempre, para ${quien}): nombre, modelo, contado o crédito, enganche, auto a cuenta, cita y qué sigue.`,
    "",
    "Así suena una plática (no copies los datos):",
    "Cliente: Hola precio del civic",
    "Tú: Hola! Claro, te hago una corrida del Civic. ¿Como cuánto tienes pensado dar de enganche?",
    "Cliente: como 80 mil",
    "Tú: Va. ¿Cuándo puedes venir a verlo? Tengo mañana a las 10 o a las 4.",
    "Cliente: a las 4",
    "Tú: Listo, mañana a las 4. ¿A nombre de quién?",
    "Cliente: Luis Treviño",
    `Tú: Gracias Luis. Quedamos mañana a las 4. Al llegar pregunta por mí, ${nombre}, y salgo a recibirte. ¿Quieres que te pase qué documentos conviene llevar?`,
    "",
    `Modelos ${marca} que la gente suele pedir: City (sedán y hatchback), Civic, Accord, HR-V, BR-V, CR-V, Pilot y Odyssey. Si piden otro, di que ${quien} te confirma si lo tienen.`,
    `Horario de la agencia: ${textoHorario(cfg.horario) || "el que confirme el asesor"}.`,
    opciones.length ? `Horarios LIBRES para cita (ofrece solo estos; id → texto):\n${opciones.map((x) => `${x.id} → ${x.texto}`).join("\n")}` : `No hay horarios libres cargados: pregúntale día y hora y dile que ${quien} se lo confirma.`,
    corridas ? `CORRIDAS (las únicas cifras de crédito que puedes dar; tal cual):\n${corridas}` : "",
    reglas ? `Respuestas ${asesorCon(nombre, "de")} que debes respetar:\n${reglas}` : "",
    autos.length ? `Autos con precio que SÍ puedes mencionar (JSON):\n${JSON.stringify(autos)}` : "",
  ].filter((x) => x !== "").join("\n");
  // Turnos alternados que empiezan con el cliente (mensajes vacíos o fotos sin texto no aportan).
  const turnos = historial.filter((m) => String(m.text ?? "").trim()).slice(-20).map((m) => ({ role: m.dir === "in" ? "user" : "assistant", content: String(m.text).slice(0, 1500) }));
  while (turnos.length && turnos[0].role !== "user") turnos.shift();
  return { system, messages: turnos };
}

/**
 * Cuando la IA contesta, lo que decidió el menú para ese mensaje (que no entendió) se descarta: se parte de lo que
 * Sofía recordaba ANTES (conv anterior) y solo se conserva el freno contra bucles. Si la IA falla, el llamador
 * manda la respuesta del menú tal cual.
 */
export function aplicarIA(r, salida, { inventario = [], antes = {}, ahora = new Date(), libres = [], cfg = {}, historial = [] } = {}) {
  const texto = String(salida?.respuesta ?? "").trim().slice(0, 1200);
  if (!texto) return r;
  // Ninguna cifra que no venga de las corridas, del inventario o de lo que dijo el cliente (la IA a veces inventa).
  const permitidas = new Set([
    ...cifras(cfg.corridas), ...(cfg.reglas ?? []).flatMap((x) => cifras(x?.respuesta)), ...historial.filter((m) => m.dir === "in").flatMap((m) => cifras(m.text)),
    ...disponibles(inventario).filter((a) => a.precio > 0).map((a) => Math.round(a.precio)),
    "20%", "30%", "40%", "50%", `${(cfg.ventas ?? VENTAS_BASE).engancheMinimo ?? VENTAS_BASE.engancheMinimo}%`,
  ]);
  const inventada = cifras(texto).find((x) => !permitidas.has(x));
  if (inventada !== undefined) throw new Error(`dio una cifra que no está en las corridas (${typeof inventada === "number" ? pesos(inventada) : inventada})`);
  const now = ahora instanceof Date ? ahora : new Date(ahora);
  const conv = { ...antes, autos: r.conv.autos, ultimo: r.conv.ultimo, fallos: 0 };
  const lead = {};
  const auto = salida.auto_id ? disponibles(inventario).find((a) => a.id === salida.auto_id) : null;
  if (auto) { conv.autoId = auto.id; lead.autoId = auto.id; lead.interes = nombreAuto(auto); if (auto.precio > 0) lead.precio = auto.precio; }
  if (salida.resumen?.trim()) lead.resumen = salida.resumen.trim().slice(0, 800);
  if (["contado", "credito"].includes(salida.forma_pago)) lead.formaPago = salida.forma_pago;
  if (salida.cita?.trim()) { lead.cita = salida.cita.trim().slice(0, 120); lead.calor = "caliente"; }
  if (salida.nombre?.trim()) lead.nombreCliente = salida.nombre.trim().slice(0, 60);
  if (salida.modelo?.trim() && !lead.interes) lead.interes = `${salida.modelo.trim().slice(0, 60)}`;
  // Solo se aparta un horario que de verdad está libre (la IA no puede inventar uno).
  const libre = salida.reservar ? libres.find((x) => x.id === salida.reservar) : null;
  if (libre) Object.assign(lead, { cita: libre.texto, citaId: libre.id, citaConfirmada: true, calor: "caliente" });
  // La foto del auto va la primera vez que se habla de él (como haría un vendedor), no en cada mensaje.
  const foto = auto?.foto && !(antes.fotos ?? []).includes(auto.id) ? auto.foto : null;
  if (foto) conv.fotos = [...(antes.fotos ?? []), auto.id];
  if (salida.pasar_a_asesor) {
    Object.assign(conv, { paso: "asesor", desde: now.toISOString(), opciones: null, calor: "caliente" });
    Object.assign(lead, { quiereAsesor: true, calor: "caliente" });
  } else if (!conv.paso || conv.paso === "asesor") {
    Object.assign(conv, { paso: "menu", opciones: ["lista", "credito", "cita", "asesor"] }); // «1», «2»… siguen funcionando
  }
  return { respuestas: [foto ? { texto, foto } : { texto }], conv, lead, motivo: "ia", ...(libre ? { reserva: { id: libre.id, texto: libre.texto } } : {}) };
}
