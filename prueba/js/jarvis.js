// «Modo Jarvis»: lo que Mario le dice a Sofía en sus palabras («recuérdame marcarle a Juan mañana a las 10»,
// «anota que Ana quiere la CR-V blanca», «apágate», «¿quién tiene cita mañana?») y lo que piden los clientes
// que Sofía NO puede dar (reembolsos, valuaciones, facturas…) para avisarle a Mario.
// Módulo PURO: sin red ni almacenamiento. Las reglas van primero; la IA solo ayuda con lo que no entienden.

const sa = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MIN = 60e3, HORA = 60 * MIN, DIA = 24 * HORA;
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20, treinta: 30, cuarenta: 40 };

/** Fecha y hora de pared en la zona de la agencia. */
function local(t, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour % 24, min: +p.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
/** Instante UTC de una fecha/hora de pared en la zona tz. */
function aUTC(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m, d, h, min);
  const l = local(guess, tz);
  const off = Date.UTC(l.y, l.m, l.d, l.h, l.min) - guess;
  return guess - off;
}

/** Texto bonito para Mario: «hoy 4:30 pm», «mañana 10:00 am», «jue 27 nov 10:00 am». */
export function cuandoTexto(t, ahora, tz = "America/Monterrey") {
  const a = local(t, tz), h = local(ahora, tz);
  const hora = `${a.h % 12 || 12}:${String(a.min).padStart(2, "0")} ${a.h < 12 ? "am" : "pm"}`;
  const dias = Math.round((Date.UTC(a.y, a.m, a.d) - Date.UTC(h.y, h.m, h.d)) / DIA);
  const dia = dias === 0 ? "hoy" : dias === 1 ? "mañana" : `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][a.dow]} ${a.d} ${MESES[a.m].slice(0, 3)}`;
  return `${dia} ${hora}`;
}

/**
 * Busca CUÁNDO en la frase. Devuelve { at (ms), resto (frase sin la fecha) } o null si no dice cuándo.
 * Sin am/pm, de 1 a 7 se toma como de la tarde (horario de agencia). Si la hora ya pasó hoy, es mañana.
 */
export function leerCuando(texto, ahora = Date.now(), tz = "America/Monterrey") {
  let t = ` ${sa(texto)} `;
  const quitar = (re) => { t = t.replace(re, " "); };
  const now = typeof ahora === "number" ? ahora : new Date(ahora).getTime();
  // Relativo: «en 20 minutos», «en una hora», «en media hora», «en 2 días», «al rato».
  const rel = /\ben (\d+|un|una|dos|tres|cuatro|cinco|seis|diez|quince|veinte|treinta|cuarenta|media) ?(min(?:uto)?s?|hrs?|horas?|dias?)\b/.exec(t);
  if (rel) {
    const n = rel[1] === "media" ? 0.5 : NUM[rel[1]] ?? Number(rel[1]);
    const u = /^m/.test(rel[2]) ? MIN : /^d/.test(rel[2]) ? DIA : HORA;
    quitar(rel[0]);
    return { at: now + n * u, resto: limpiar(t) };
  }
  if (/\b(al rato|mas tarde|ahorita)\b/.test(t) && !/\b(manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|a las)\b/.test(t)) {
    quitar(/\b(al rato|mas tarde|ahorita)\b/);
    return { at: now + 2 * HORA, resto: limpiar(t) };
  }
  const h = local(now, tz);
  let y = h.y, m = h.m, d = h.d, conDia = false;
  t = t.replace(/\b(en|por|de) la manana\b/g, " $1 la mananita "); // «en la mañana» es franja, no «mañana» el día
  if (/\bpasado manana\b/.test(t)) { d += 2; conDia = true; quitar(/\bpasado manana\b/); }
  else if (/\bmanana\b/.test(t)) { d += 1; conDia = true; quitar(/\bmanana\b/); }
  if (/\bhoy\b/.test(t)) { conDia = true; quitar(/\bhoy\b/); }
  const dow = DIAS.findIndex((x) => new RegExp(`\\b(el |este |el proximo |proximo )?${x}\\b`).test(t));
  if (dow >= 0) {
    let mas = (dow - h.dow + 7) % 7; if (mas === 0) mas = 7;
    d = h.d + mas; conDia = true; quitar(new RegExp(`\\b(el |este |el proximo |proximo )?${DIAS[dow]}\\b`));
  }
  const fecha = /\bel (\d{1,2})(?: de ([a-z]+))?\b(?!\s*(?:min|hora|dia))/.exec(t);
  if (fecha && (!fecha[2] || MESES.includes(fecha[2]))) {
    const dd = Number(fecha[1]);
    if (dd >= 1 && dd <= 31) {
      m = fecha[2] ? MESES.indexOf(fecha[2]) : h.m; d = dd; conDia = true;
      if (Date.UTC(y, m, d) < Date.UTC(h.y, h.m, h.d)) { if (fecha[2]) y += 1; else m += 1; }
      quitar(fecha[0]);
    }
  }
  // Hora: «a las 10», «a las 4:30 pm», «10am», «a mediodía», «en la tarde».
  let hh = null, mm = 0;
  const hora = /\b(?:a las?|alas|a eso de las|tipo|como a las) (\d{1,2})(?::(\d{2})| y (media|cuarto))?\s*(am|pm|a\.m\.|p\.m\.|de la mananita|de la tarde|de la noche)?/.exec(t)
    ?? /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs)\b/.exec(t);
  if (hora) {
    hh = Number(hora[1]);
    const sufijo = hora.length > 4 ? hora[4] : hora[3];
    mm = hora[3] === "media" ? 30 : hora[3] === "cuarto" ? 15 : Number(/^\d+$/.test(hora[2] ?? "") ? hora[2] : 0);
    if (/^p|tarde|noche/.test(sufijo ?? "") && hh < 12) hh += 12;
    else if (/^a|mananita/.test(sufijo ?? "") && hh === 12) hh = 0;
    else if (!sufijo && hh >= 1 && hh <= 7) hh += 12;
    quitar(hora[0]);
  } else if (/\bmedio ?dia\b/.test(t)) { hh = 12; quitar(/\b(a )?medio ?dia\b/); }
  else if (/\b(en|por) la tarde\b/.test(t)) { hh = 16; quitar(/\b(en|por) la tarde\b/); }
  else if (/\b(en|por) la noche\b/.test(t)) { hh = 19; quitar(/\b(en|por) la noche\b/); }
  else if (/\b(en|por|de) la mananita\b/.test(t)) { hh = 10; quitar(/\b(en|por|de) la mananita\b/); }
  if (hh === null && !conDia) return null;
  if (hh === null) hh = 10;
  let at = aUTC(y, m, d, hh, mm, tz);
  if (!conDia && at <= now) at += DIA; // «a las 10» cuando ya pasaron las 10: mañana
  return { at, resto: limpiar(t) };
}

const limpiar = (t) => t.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();

/** El cliente del que habla Mario: por nombre («a Juan», «con la señora Ana») o por los últimos 4 dígitos. */
export function buscarCliente(texto, leads = {}) {
  const t = ` ${sa(texto).replace(/[^a-z0-9\s]/g, " ")} `;
  const dig = /\b(\d{4,13})\b/.exec(t)?.[1];
  const lista = Object.entries(leads).filter(([k]) => k.startsWith("wa:"));
  if (dig) {
    const hit = lista.filter(([k]) => k.endsWith(dig));
    if (hit.length === 1) return { clave: hit[0][0], ...hit[0][1] };
  }
  const RARO = new Set(["mario", "sofia", "honda", "cliente", "senor", "senora", "lic", "ing", "don", "dona", "que", "para", "con", "los", "las"]);
  const candidatos = [];
  for (const [clave, l] of lista) {
    for (const n of [l.nombreCliente, l.nombre]) {
      const p = sa(n).replace(/[^a-z\s]/g, " ").trim().split(/\s+/).filter((x) => x.length >= 3 && !RARO.has(x));
      if (!p.length) continue;
      const completo = p.slice(0, 2).join(" ");
      const score = p.length >= 2 && t.includes(` ${completo} `) ? 2 : t.includes(` ${p[0]} `) ? 1 : 0;
      if (score) { candidatos.push({ clave, l, score }); break; }
    }
  }
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => b.score - a.score || String(b.l.at ?? "").localeCompare(String(a.l.at ?? "")));
  const mejor = candidatos[0];
  const empatados = candidatos.filter((c) => c.score === mejor.score).length;
  return { clave: mejor.clave, ...mejor.l, ambiguo: empatados > 1 ? empatados : 0 };
}

/**
 * Qué quiere Mario. Devuelve { accion, ... }:
 *  recordar {texto, at} · falta-cuando {texto} · recordatorios · hecho {n|texto} · nota {texto} · apagar · prender
 *  citas {dia: 0|1} · cliente {texto} · personal {texto} · cliente-si {texto} · resumen · pendientes · masivo · ayuda · null (no entendí)
 */
export function entenderOrden(orden, ahora = Date.now(), tz = "America/Monterrey") {
  const o = sa(orden).replace(/[¿?¡!]/g, " ").replace(/^\s*\/?\s*sofia[\s,;:]*/, "").replace(/\s+/g, " ").trim();
  if (!o) return { accion: "ayuda" };
  if (/^(ayuda|ayudame|que (puedes|sabes) hacer|comandos)\b/.test(o)) return { accion: "ayuda" };
  if (/^(apagate|apaga(te)?|descansa|callate|para de contestar|deja de contestar|pausa(te)?|detente|stop)\b/.test(o)) return { accion: "apagar" };
  if (/^(prendete|prende(te)?|enciende(te)?|activate|vuelve a contestar|ponte a (trabajar|contestar)|arranca)\b/.test(o)) return { accion: "prender" };
  if (/^(mis |que |cuales |ver |dame (los |mis )?)?recordatorios\b|^que (tengo|me toca) (pendiente|hoy|manana)\b/.test(o)) return { accion: "recordatorios" };
  if (/^(listo|ya (quedo|le marque|le llame|lo hice|le escribi)|hecho|borra(r)?( el)? recordatorio|quita(r)?( el)? recordatorio|cancela(r)?( el)? recordatorio)\b/.test(o)) {
    const n = /\b(\d{1,2})\b/.exec(o)?.[1];
    return { accion: "hecho", n: n ? Number(n) : null, texto: orden };
  }
  if (/\b(cita|citas)\b/.test(o) && /^(quien|quienes|que|cuales|cuantas|ver|dame|mis)\b|^citas\b/.test(o) && !/\b(confirma|recuerdales|diles|mandales)\b/.test(o)) {
    return { accion: "citas", dia: /\bmanana\b/.test(o) ? 1 : 0 };
  }
  if (/^resumen\b|^como (voy|vamos|va el dia)\b/.test(o)) return { accion: "resumen" };
  if (/^pendientes\b|^quien (me )?(falta|esta esperando)\b/.test(o)) return { accion: "pendientes" };
  if (/\b(recuerdame|recordarme|recuerdas|avisame|acuerdame|no me dejes olvidar|ponme (un )?recordatorio|agenda(me)?\s+(un )?recordatorio|que no se me olvide)\b/.test(o)) {
    const c = leerCuando(orden, ahora, tz);
    const texto = tareaDe(conMayusculas(orden, c ? c.resto : sa(orden)));
    return c ? { accion: "recordar", texto, at: c.at } : { accion: "falta-cuando", texto };
  }
  if (/^(anota|apunta|guarda|toma nota|nota)\b/.test(o)) return { accion: "nota", texto: orden.replace(/^\s*\/?\s*sof[ií]a[\s,;:]*/i, "").replace(/^\s*(anota|apunta|guarda|toma nota|nota)\s*(que|de que|:)?\s*/i, "").trim() };
  if (/\b(es (mi )?(amig[oa]|familia|compa|herman[oa]|primo|prima|mama|papa|esposa|novia)|no le contestes|no le escribas|ignora a)\b/.test(o)) return { accion: "personal", texto: orden };
  if (/\b(si es cliente|es cliente|atiendel[oa]|contestale tu)\b/.test(o)) return { accion: "cliente-si", texto: orden };
  if (/^(que onda con|como va|como vamos con|que paso con|info de|dime de|quien es|que sabes de|resumen de)\b/.test(o)) return { accion: "cliente", texto: orden };
  if (/\b(hablale|hablales|escribele|escribeles|mandale|mandales|diles|dile|revive|reactiva|confirmales|recuerdales|manda foto|envia(les)?)\b/.test(o)) return { accion: "masivo" };
  return null;
}

/** Recupera las palabras originales (con acentos y mayúsculas) de lo que quedó tras quitar la fecha. */
function conMayusculas(original, resto) {
  const quedan = resto.split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  for (const w of String(original).split(/\s+/)) {
    if (i < quedan.length && sa(w) === quedan[i]) { out.push(w); i++; }
  }
  return i === quedan.length ? out.join(" ") : resto;
}

/** «marcarle a Juan para lo del enganche» (sin «recuérdame», sin fechas). */
function tareaDe(resto) {
  let x = String(resto).replace(/^\s*\/?\s*sof[ií]a[\s,;:]*/i, "")
    .replace(/(^|\s)(recu[eé]rdame|recordarme|av[ií]same|acu[eé]rdame|no me dejes olvidar|ponme (un )?recordatorio( de| para)?|ag[eé]nda(me)? (un )?recordatorio( de| para)?|que no se me olvide)(?=\s|$|[,.:;])/gi, " ")
    .replace(/^\s*(que|de|para)\s+/, "").replace(/\s+/g, " ").trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : "Lo que me pediste";
}

// ───────── Lo que piden los clientes y Sofía NO puede dar: se le avisa a Mario ─────────

export const PETICIONES = [
  ["reembolso", "💸 REEMBOLSO / DEVOLUCIÓN", /\b(devoluci\w*|reembols\w*|regres\w* (mi|el|la) (dinero|apartado|enganche|anticipo)|me (devuelvan|regresen|devuelven|regresan)|comprobante de (la )?(devoluci\w*|transferencia)|(reflejad\w*|llegado|caido) (el |mi |la )?(deposito|transferencia)|(no|aun no) (veo|me ha llegado|me llega|me cae) .{0,25}(deposito|transferencia))\b/],
  ["valuacion", "🚙 VALUACIÓN / AUTO A CUENTA", /\b(valua\w*|avaluo|cuanto me (dan|das|ofrecen|ofreces|darian)|toma(n|s|rian)? (mi|el) (carro|auto|coche|camioneta)|(dejar|dejo|dar|doy) (mi|el) (carro|auto|coche) a cuenta|a cuenta (mi|el) (carro|auto)|ofrecen en la agencia|con adeudo)\b/],
  ["papeles", "📄 FACTURA / PLACAS / PAPELES", /\b((mi|la|me (das|mandas|envias|pasas) la|enviar la|mandar la) factura|refactur\w*|carta factura|tarjeta de circulacion|(mis|las) placas (ya|cuando|no)|cuando (salen|me (dan|entregan|llegan)|estan) (mis |las )?placas|traer (esas |las )?placas|tenencia|pedimento|endoso)\b/],
  ["credito", "🏦 ESTADO DE SU CRÉDITO", /\b(ya (salio|paso|aprobaron|autorizaron) (mi |el )?credito|(salio|paso) el credito|respuesta del (banco|credito)|como va (mi|el) credito|aprobacion del credito|hubo respuesta)\b/],
  ["llamada", "📞 QUIERE QUE LE MARQUES", /\b(llamame|marcame|me (puedes|podrias|puede|podria) (llamar|marcar)|hablame por telefono|me llamas|me marcas|me hablas)\b/],
  ["descuento", "🏷️ DESCUENTO / NEGOCIAR", /\b(descuento|mejor precio|precio especial|me lo (dejas|deja) en|rebaja|negociar|ultimo precio|lo menos)\b/],
  ["entrega", "🚚 SU ENTREGA", /\b(cuando (me )?(la|lo) (entregan|entregas|dan)|fecha de entrega|ya (llego|esta lista?) (mi|la|el) (auto|carro|camioneta|unidad)|entrega de (mi|la) (unidad|camioneta|auto))\b/],
  ["queja", "⚠️ MOLESTO / QUEJA", /\b(queja|molest[oa]|no me (han|has|ha) (contestado|respondido|marcado|enviado)|pesimo|mal servicio|me (dejaron|dejaste) (en visto|esperando)|cancelar (mi|el) (pedido|apartado|credito|compra)|ya no (lo|la) quiero)\b/],
  ["cita", "📅 CAMBIO DE CITA", /\b(cambiar (la|mi) cita|no (voy a )?(poder|alcanzo a) (ir|llegar)|cancelar (la|mi) cita|mover (la|mi) cita|llego tarde|voy tarde)\b/],
];

/** Lo que pide el cliente que solo Mario puede resolver. Devuelve [{ id, titulo }] (vacío si nada). */
export function peticionesDe(texto) {
  const t = ` ${sa(texto).replace(/[¿?¡!.,;:]/g, " ")} `;
  return PETICIONES.filter(([, , re]) => re.test(t)).map(([id, titulo]) => ({ id, titulo }));
}

export const AYUDA_JARVIS = [
  "🧠 *Modo Jarvis* — escríbeme como le hablarías a tu asistente (aquí en tu chat «Tú», empezando con *sofia*, o en la app):",
  "⏰ *sofia recuérdame marcarle a Juan mañana a las 10* · «en 2 horas», «el jueves en la tarde», «el 28 a las 4:30»",
  "📋 *sofia recordatorios* — lo que tienes pendiente · *sofia listo 2* — marca el 2 como hecho",
  "📝 *sofia anota que Ana quiere la CR-V blanca* — se guarda en su ficha",
  "🔎 *sofia qué onda con Ana* — resumen del cliente · *sofia citas mañana*",
  "👥 *sofia Pedro es mi amigo* — no le contesta más · *sofia Pedro sí es cliente*",
  "⏸️ *sofia apágate* / ▶️ *sofia préndete* — respuestas automáticas",
  "🗣️ *sofia háblale a los interesados en CR-V de octubre* — te enseño a quién y qué antes de mandar (*sofia sí* / *sofia no*)",
  "🔔 Te aviso solo cuando un cliente pide algo que yo no puedo dar: reembolsos, valuaciones, factura/placas, su crédito, que le marques, descuentos, su entrega, quejas o cambio de cita.",
].join("\n");
