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
  horasConAsesor: 12, // al pedir asesor o anotar una visita, Sofía deja esa conversación al asesor
  presentacion: "", // cómo se presenta en el primer mensaje; vacío = "¡Hola {nombre}! 👋 Soy Sofía, asistente de {asesor} en {agencia}."
  ia: false, // con IA (opcional, de pago): contesta lo que el menú no entiende, con los mismos datos y reglas
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

// ───────── Intenciones (palabras completas, sin acentos) ─────────

const DICE = {
  asesor: ["asesor", "asesora", "vendedor", "vendedora", "una persona", "humano", "hablar con alguien", "llamenme", "llamame", "marcame", "me pueden llamar", "me puedes llamar", "una llamada"],
  cita: ["prueba de manejo", "manejarlo", "manejarla", "probarlo", "probarla", "cita", "agendar", "agenda", "visitarlos", "ir a verlo", "ir a verla", "conocerlo", "conocerla", "puedo ir", "pasar a verlo", "pasar a verla", "visita"],
  credito: ["credito", "financiamiento", "financiar", "financiado", "mensualidad", "mensualidades", "a meses", "plazos", "enganche", "cotizacion", "cotizar", "cotiza", "cotizame"],
  contado: ["contado", "de contado", "efectivo", "cash"],
  lista: ["catalogo", "inventario", "autos", "carros", "coches", "camionetas", "disponibles", "que tienen", "que tienes", "modelos", "unidades", "seminuevos", "nuevos"],
  precio: ["precio", "precios", "cuanto cuesta", "cuanto sale", "cuanto vale", "costo", "en cuanto", "cuanto es"],
  saludo: ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "que tal", "informacion", "info"],
  gracias: ["gracias", "muchas gracias", "mil gracias"],
};
const MENU = ["menu", "inicio", "opciones", "regresar", "volver"];
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

// ───────── Respuestas ─────────

const OPCIONES_MENU = ["lista", "credito", "cita", "asesor"];
const emojiNum = (i) => ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"][i] ?? `${i + 1}.`;
const enumerar = (lineas) => lineas.map((l, i) => `${emojiNum(i)} ${l}`).join("\n");

/**
 * Decide qué contestar a un mensaje. Nunca lanza: si algo no cuadra, pasa la conversación al asesor.
 * Con respuestas: [] Sofía se queda callada (lo atiende el asesor, o es un bucle con otro bot).
 */
export function decidir({ cfg = {}, inventario = [], conv = {}, msg = {}, ahora = new Date() }) {
  const v = { ...VENTAS_BASE, ...(cfg.ventas ?? {}) };
  const now = ahora instanceof Date ? ahora : new Date(ahora);
  const c = { ...conv, autos: (conv.autos ?? []).filter((x) => now - new Date(x) < HORA), fallos: conv.fallos ?? 0 };
  const lead = {};
  const texto = String(msg.texto ?? "");
  const t = sinAcentos(texto);
  const vars = { nombre: primerNombre(msg.nombre), asesor: cfg.asesor || "tu asesor", agencia: cfg.agencia || "la agencia" };
  const asesor = cfg.asesor || "un asesor";
  const horario = textoHorario(cfg.horario);
  const autos = disponibles(inventario);
  const porId = (id) => autos.find((a) => a.id === id);
  const quedar = (motivo) => ({ respuestas: [], conv: c, lead, motivo });

  if (c.autos.length >= MAX_POR_HORA) return quedar("freno");
  const pideMenu = t.trim() === "0" || (texto.trim().split(/\s+/).length <= 3 && tieneAlguna(t, MENU));
  // Derechos del aviso de privacidad (privacidad.html): se contestan siempre, aunque ya lo atienda el asesor.
  const limpio = sinAcentos(texto).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(borra|borrar|borren|elimina|eliminar|eliminen) (todos )?mis datos\b/.test(limpio)) {
    Object.assign(lead, { pideBorrar: true, quiereAsesor: true });
    Object.assign(c, { paso: "asesor", desde: now.toISOString(), opciones: null, autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    return { respuestas: [{ texto: `Recibimos tu solicitud para borrar tus datos. ${cfg.asesor || "Un asesor"} la confirma contigo por este medio y te avisa cuando quede hecho (máximo 15 días hábiles).` }], conv: c, lead, motivo: "borrar-datos" };
  }
  if (/\b(no|sin) (mas )?promociones\b|\bya no (me )?(manden|envien|mandes|envies) promociones\b/.test(limpio)) {
    lead.noPromociones = true;
    Object.assign(c, { autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    return { respuestas: [{ texto: "Listo, ya no te enviaremos promociones. Te seguimos contestando lo que nos preguntes 🙂" }], conv: c, lead, motivo: "sin-promociones" };
  }
  if (c.paso === "asesor" && now - new Date(c.desde ?? 0) < v.horasConAsesor * HORA && !pideMenu) return quedar("con-asesor");
  if (!texto.trim()) return quedar("vacio"); // stickers, audios, reacciones: los ve el asesor

  const resp = [];
  let motivo = "";
  const decir = (txt, foto) => resp.push(foto ? { texto: txt, foto } : { texto: txt });
  const ir = (paso, opciones = null) => { c.paso = paso; c.desde = now.toISOString(); c.opciones = opciones; };
  const calentar = (nivel) => { const orden = { frio: 0, tibio: 1, caliente: 2 }; if ((orden[nivel] ?? 0) > (orden[c.calor] ?? -1)) { c.calor = nivel; lead.calor = nivel; } };
  const elegirAuto = (a) => { c.autoId = a.id; lead.autoId = a.id; lead.interes = nombreAuto(a); if (a.precio > 0) lead.precio = a.precio; };
  const desde = (a) => {
    if (!(a.precio > 0)) return "";
    const plazo = Math.max(...v.plazos);
    return mensualidad(a.precio * (1 - v.engancheMinimo / 100), v.tasaAnual, plazo);
  };

  // ── Piezas de conversación ──
  const saludo = () => {
    const intro = rellenar(v.presentacion?.trim() || `¡Hola {nombre}! 👋 Soy Sofía, asistente de ${cfg.asesor ? "{asesor}" : "ventas"} en {agencia}.`, vars);
    return msg.enHorario === false ? `${intro}\nAhorita estamos fuera de horario${horario ? ` (${horario})` : ""}, pero yo te ayudo con lo que necesites 😉` : intro;
  };
  const menu = (encabezado = "¿En qué te ayudo?") => {
    ir("menu", OPCIONES_MENU);
    return `${encabezado}\n${enumerar(["Ver autos disponibles", "Cotizar a crédito", "Agendar prueba de manejo", `Hablar con ${asesor}`])}\n\nTambién puedes escribir el auto que buscas (ej. «${autos[0]?.modelo || "CR-V"}»).`;
  };
  const lista = (cuales = autos, pendiente = null, encabezado = null) => {
    if (!cuales.length) return pasarAsesor(`Por ahora ${asesor} te comparte personalmente lo que tenemos disponible.`);
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
      a.precio > 0 ? `💵 *${pesos(a.precio)}* de contado` : "💵 Precio: te lo confirma el asesor",
      detalles && `🔹 ${detalles}`,
      a.descripcion?.trim(),
      m && `💳 A crédito desde ~${pesos(m)} al mes (${v.engancheMinimo}% de enganche, ${Math.max(...v.plazos)} meses)*`,
    ].filter(Boolean);
    return `${datos.join("\n")}\n\n¿Qué sigue?\n${enumerar(["Cotizar a mi medida", "Agendar prueba de manejo", "Ver otros autos", `Hablar con ${asesor}`])}${m ? `\n\n_*Estimado con tasa referencial de ${v.tasaAnual}% anual; sujeto a aprobación._` : ""}`;
  };
  const pedirEnganche = (a) => {
    elegirAuto(a);
    calentar("caliente");
    lead.formaPago = "credito";
    ir("enganche");
    if (!(a.precio > 0)) return pasarAsesor(`Para la *${nombreAuto(a)}* ${asesor} te arma la cotización con el precio vigente.`);
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
      return `¡Con eso la pagas de contado! 🎉 La *${nombreAuto(a)}* queda en *${pesos(a.precio)}*.\n\n${enumerar(["Agendar visita / prueba de manejo", "Ver otros autos", `Hablar con ${asesor}`])}`;
    }
    const ajustado = enganche < minimo;
    const eng = Math.max(enganche, minimo);
    lead.enganche = Math.round(eng);
    const filas = v.plazos.map((p) => `• ${p} meses: *${pesos(mensualidad(a.precio - eng, v.tasaAnual, p))}*`);
    lead.plazo = Math.max(...v.plazos);
    lead.mensualidad = Math.round(mensualidad(a.precio - eng, v.tasaAnual, lead.plazo));
    ir("cotizado", ["cita", "lista", "asesor"]);
    return [
      ajustado ? `El enganche mínimo es de ${v.engancheMinimo}% (${pesos(minimo)}). Con eso te queda así:` : `Con ${pesos(eng)} de enganche para la *${nombreAuto(a)}*:`,
      filas.join("\n"),
      `_Estimado con tasa referencial de ${v.tasaAnual}% anual; no incluye seguro ni comisión. Sujeto a aprobación._`,
      "",
      enumerar(["Agendar visita para tu cotización formal", "Ver otros autos", `Hablar con ${asesor}`]),
    ].join("\n");
  };
  const contado = (a) => {
    lead.formaPago = "contado";
    calentar("tibio");
    if (!a) return lista(autos, null, "¡Perfecto, de contado! ¿Qué auto te interesa?");
    elegirAuto(a);
    ir("cotizado", ["cita", "lista", "asesor"]);
    return `¡Excelente! De contado la *${nombreAuto(a)}* queda en *${a.precio > 0 ? pesos(a.precio) : "el precio que te confirma el asesor"}*. ¿Te gustaría venir a verla?\n\n${enumerar(["Agendar visita / prueba de manejo", "Ver otros autos", `Hablar con ${asesor}`])}`;
  };
  const pedirCita = () => {
    calentar("caliente");
    ir("cita");
    const a = porId(c.autoId);
    return `¡Con gusto! 🙌 ¿Qué día y a qué hora te acomoda venir${a ? ` a manejar la *${nombreAuto(a)}*` : ""}? (por ejemplo «sábado 11 am»)${horario ? `\nNuestro horario: ${horario}.` : ""}`;
  };
  const anotarCita = (cuando) => {
    const a = porId(c.autoId);
    lead.cita = cuando.trim().slice(0, 120);
    lead.quiereAsesor = true;
    calentar("caliente");
    ir("asesor");
    return rellenar(`¡Listo, {nombre}! ✅ Anoté tu visita: *${lead.cita}*${a ? ` para la *${nombreAuto(a)}*` : ""}. ${cfg.asesor ? "{asesor}" : "Un asesor"} te confirma en breve.`, vars);
  };
  function pasarAsesor(intro = "") {
    lead.quiereAsesor = true;
    calentar("caliente");
    ir("asesor");
    const cuando = msg.enHorario === false ? ` en cuanto abramos${horario ? ` (${horario})` : ""}` : " en breve";
    return `${intro ? `${intro}\n` : ""}¡Claro! Le aviso a ${asesor} para que te escriba${cuando} 🙌. Si quieres, déjame aquí tu duda y se la paso.`;
  }
  const accion = (a) => {
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

    // 1. Lo que contesta a la pregunta anterior de Sofía.
    if (pideMenu) { motivo = "menu"; decir(menu()); }
    else if (n !== null && c.opciones?.[n - 1] && c.paso !== "enganche") {
      motivo = c.opciones[n - 1].split(":")[0];
      const r = accion(c.opciones[n - 1]);
      if (typeof r === "string") decir(r); else decir(r.texto, r.foto || undefined);
    }
    else if ((c.paso === "enganche" || (["auto", "cotizado"].includes(c.paso) && montoExplicito(texto))) && !dice.asesor && porId(c.autoId)?.precio > 0 && leerEnganche(texto, porId(c.autoId).precio) !== null) {
      motivo = "cotizacion";
      decir(cotizar(porId(c.autoId), leerEnganche(texto, porId(c.autoId).precio)));
    } else if (c.paso === "cita" && !dice.asesor && (pareceFecha(texto) || (c.fallos >= 1 && !dice.credito && !dice.contado && !dice.lista && !mencionados.length))) {
      motivo = "cita-anotada"; // a la segunda se anota lo que haya escrito: el asesor lo confirma
      decir(anotarCita(texto));
    }
    // 2. Lo que pide el cliente, de lo más importante a lo menos.
    else if (dice.asesor) { motivo = "asesor"; decir(pasarAsesor()); }
    else if (dice.cita) { motivo = "cita"; decir(pareceFecha(texto) ? anotarCita(texto) : pedirCita()); }
    else if (dice.credito) {
      motivo = "credito";
      const a = mencionados.length === 1 ? mencionados[0] : porId(c.autoId);
      if (a?.precio > 0 && montoExplicito(texto) && leerEnganche(texto, a.precio) !== null) { motivo = "cotizacion"; decir(cotizar(a, leerEnganche(texto, a.precio))); }
      else decir(a ? pedirEnganche(a) : lista(mencionados.length > 1 ? mencionados : autos, "credito"));
    }
    else if (dice.contado) { motivo = "contado"; decir(contado(mencionados.length === 1 ? mencionados[0] : porId(c.autoId))); }
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
      else if (dice.lista || dice.precio) { motivo = "asesor"; decir(pasarAsesor(`Cuéntame qué auto buscas y ${asesor} te pasa precio y disponibilidad.`)); }
      else if (primero || dice.saludo) { motivo = "menu"; decir(menu()); }
      else if (dice.gracias) { motivo = "gracias"; decir("¡Con gusto! 😊 Si necesitas algo más, escribe *menú*."); c.opciones = OPCIONES_MENU; c.paso = "menu"; }
      else if (c.paso === "enganche") { motivo = "no-entendi"; c.fallos += 1; decir(c.fallos >= 2 ? pasarAsesor("No logré entender el enganche 🙈.") : "¿Cuánto darías de enganche? Escríbelo en pesos o porcentaje, por ejemplo «20%» o «100 mil»."); }
      else if (c.paso === "cita") { motivo = "no-entendi"; c.fallos += 1; decir("¿Qué día y a qué hora te acomoda? Por ejemplo «sábado 11 am»."); }
      else { motivo = "no-entendi"; c.fallos += 1; decir(c.fallos >= 2 ? pasarAsesor("Mejor te paso con una persona para ayudarte bien.") : `Perdón, no te entendí 🙈. Escribe el *número* de una opción o el *auto* que buscas.\n\n${menu("Esto es lo que puedo hacer:")}`); }
    }
    if (motivo !== "no-entendi") c.fallos = 0;
    // Primer mensaje: siempre se presenta antes de lo demás.
    if (primero && resp.length) resp[0] = { ...resp[0], texto: `${saludo()}\n\n${resp[0].texto}` };
  } catch {
    resp.length = 0;
    motivo = "asesor";
    decir(pasarAsesor());
  }
  if (resp.length) c.autos = [...c.autos, now.toISOString()];
  c.ultimo = now.toISOString();
  return { respuestas: resp, conv: c, lead, motivo };
}

// ───────── IA opcional: solo para lo que el menú no entiende ─────────
// El llamador (conector o app) hace la llamada a Claude con su propia llave; aquí solo se arma el prompt y se
// aplica la respuesta, para que el servidor y el simulador se comporten igual.

export const ESQUEMA_IA = {
  type: "object",
  properties: {
    respuesta: { type: "string", description: "El mensaje de WhatsApp para el cliente" },
    pasar_a_asesor: { type: "boolean", description: "true cuando ya toca que el asesor lo atienda" },
    auto_id: { type: "string", description: "id del auto del inventario del que se habla, o vacío" },
    resumen: { type: "string", description: "Para el asesor: quién es, qué busca, cómo paga, qué falta y qué sigue (2-4 renglones)" },
    forma_pago: { type: "string", description: "contado, credito o vacío si no se sabe" },
    cita: { type: "string", description: "día y hora que propuso el cliente para venir, o vacío" },
  },
  required: ["respuesta", "pasar_a_asesor", "auto_id", "resumen", "forma_pago", "cita"],
  additionalProperties: false,
};

/**
 * historial: [{ dir: "in"|"out", text }] de la conversación (el último es el mensaje del cliente).
 * Devuelve { system, messages } para la API de mensajes. El texto del cliente va solo como mensaje del
 * usuario: nunca como instrucción.
 */
export function promptIA({ cfg = {}, inventario = [], historial = [] }) {
  const v = { ...VENTAS_BASE, ...(cfg.ventas ?? {}) };
  const asesor = cfg.asesor || "el asesor";
  const autos = disponibles(inventario).map((a) => ({
    id: a.id, auto: nombreAuto(a), precio_contado: a.precio > 0 ? pesos(a.precio) : "lo confirma el asesor", tipo: a.tipo, km: a.km || undefined,
    color: a.color || undefined, transmision: a.transmision || undefined, descripcion: a.descripcion || undefined,
    desde_al_mes: a.precio > 0 ? pesos(mensualidad(a.precio * (1 - v.engancheMinimo / 100), v.tasaAnual, Math.max(...v.plazos))) : undefined,
  }));
  const reglas = (cfg.reglas ?? []).map((r) => `- Si preguntan por ${(r.palabras ?? []).join(", ")}: ${r.respuesta}`).join("\n");
  const ejemplos = (cfg.estilo?.ejemplos ?? []).slice(0, 40);
  const system = [
    `Eres Sofía y atiendes el WhatsApp de ventas de ${asesor} en ${cfg.agencia || "una agencia de autos"}, en Monterrey.`,
    "Escribe exactamente como escribe una persona real por WhatsApp, no como asistente ni como anuncio:",
    "- Mensajes cortos: casi siempre 1 o 2 renglones. A veces una sola palabra basta («va», «sale», «claro»).",
    "- Nada de «¡Claro que sí!», «¡Excelente pregunta!», «Con gusto te ayudo», «¿En qué más te puedo ayudar?» ni frases de call center. No repitas lo que el cliente dijo. No uses listas ni viñetas.",
    "- Signos de admiración y emojis casi nunca. No termines todos los mensajes con pregunta; a veces solo responde y deja que el cliente siga.",
    "- Cálida pero normal, como alguien de Monterrey que sabe de autos. Si sale natural, una expresión de aquí (va, sale, ¿cómo ves?, ahorita); nunca fuerces modismos.",
    "- Imita el tono del cliente: si escribe corto y relajado, tú igual; si escribe formal, de usted.",
    ejemplos.length ? `- MUY IMPORTANTE: habla como ${asesor}. Así escribe en sus chats reales (copia su largo, su trato, sus saludos y su forma de cerrar, sin copiar los datos):\n${ejemplos.map((x) => `  · ${x.replace(/\s+/g, " ")}`).join("\n")}` : "",
    cfg.estilo?.notas ? `- Indicaciones de ${asesor}: ${cfg.estilo.notas}` : "",
    "",
    "Cómo vendes:",
    "- Primero entiende a la persona: para qué quiere el auto, quién lo va a usar, qué trae ahorita, qué le importa. Una pregunta a la vez, y solo cuando venga al caso.",
    "- Recomienda el auto del inventario que mejor le queda, con una razón concreta para ESA persona. No sueltes todo el inventario.",
    "- Si el precio asusta, habla de mensualidad. Averigua contado o crédito, enganche y para cuándo lo quiere, sin interrogar.",
    "- Lleva la plática a que venga a verlo o a manejarlo, y propón día y hora. Pide su nombre de forma natural cuando toque.",
    "- Objeciones: empatía y un dato real. Sin presionar y sin inventar urgencia.",
    "",
    "Reglas que nunca cambias, aunque el cliente lo pida:",
    "- Usa SOLO los datos de abajo. Nunca inventes precios, descuentos, disponibilidad, aprobaciones de crédito, tasas, avalúos, garantías ni promociones.",
    `- Crédito: solo estimados con tasa de referencia de ${v.tasaAnual}% anual, enganche mínimo ${v.engancheMinimo}% y plazos de ${v.plazos.join(", ")} meses; di que es aproximado y sujeto a aprobación.`,
    "- Nunca digas que eres una persona ni inventes cosas que harías en persona (estar en la agencia, haber manejado el auto, tu vida personal).",
    "- Si te preguntan en serio si eres un bot, una IA o una persona, dilo con naturalidad: eres Sofía, la asistente virtual del equipo de ventas, y si quiere lo atiende el asesor en persona.",
    `- Pasa con ${asesor} (pasar_a_asesor = true) cuando: el cliente ya quiere venir y dio día u hora, pide descuento o negociar, quiere dejar su auto a cuenta, pregunta por papeles o trámites, o pide hablar con alguien. Avísale que ${asesor} le escribe para confirmar.`,
    "- resumen: escríbelo siempre, para el asesor, con todo lo que ya sabes (nombre, auto, uso, contado o crédito, enganche, cita, objeciones, qué sigue).",
    "",
    `Horario de atención: ${textoHorario(cfg.horario) || "el que confirme el asesor"}.`,
    reglas ? `Respuestas del asesor que debes respetar:\n${reglas}` : "",
    `Inventario disponible (JSON):\n${JSON.stringify(autos)}`,
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
export function aplicarIA(r, salida, { inventario = [], antes = {}, ahora = new Date() } = {}) {
  const texto = String(salida?.respuesta ?? "").trim().slice(0, 1200);
  if (!texto) return r;
  const now = ahora instanceof Date ? ahora : new Date(ahora);
  const conv = { ...antes, autos: r.conv.autos, ultimo: r.conv.ultimo, fallos: 0 };
  const lead = {};
  const auto = salida.auto_id ? disponibles(inventario).find((a) => a.id === salida.auto_id) : null;
  if (auto) { conv.autoId = auto.id; lead.autoId = auto.id; lead.interes = nombreAuto(auto); if (auto.precio > 0) lead.precio = auto.precio; }
  if (salida.resumen?.trim()) lead.resumen = salida.resumen.trim().slice(0, 800);
  if (["contado", "credito"].includes(salida.forma_pago)) lead.formaPago = salida.forma_pago;
  if (salida.cita?.trim()) { lead.cita = salida.cita.trim().slice(0, 120); lead.calor = "caliente"; }
  // La foto del auto va la primera vez que se habla de él (como haría un vendedor), no en cada mensaje.
  const foto = auto?.foto && !(antes.fotos ?? []).includes(auto.id) ? auto.foto : null;
  if (foto) conv.fotos = [...(antes.fotos ?? []), auto.id];
  if (salida.pasar_a_asesor) {
    Object.assign(conv, { paso: "asesor", desde: now.toISOString(), opciones: null, calor: "caliente" });
    Object.assign(lead, { quiereAsesor: true, calor: "caliente" });
  } else if (!conv.paso || conv.paso === "asesor") {
    Object.assign(conv, { paso: "menu", opciones: ["lista", "credito", "cita", "asesor"] }); // «1», «2»… siguen funcionando
  }
  return { respuestas: [foto ? { texto, foto } : { texto }], conv, lead, motivo: "ia" };
}
