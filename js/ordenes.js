// «Dile a Sofía…»: entiende órdenes de Mario escritas como las diría, sin IA.
//   «háblale a los interesados en CR-V», «a los calientes de octubre diles que llegó la promo»,
//   «manda foto de la HR-V a los que no contestaron», «confírmales la cita a los de mañana».
// Módulo PURO: recibe prospectos, bandeja, citas e inventario y devuelve a quién y qué mandar.

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DIA = 24 * 3600 * 1000;

export const MODELOS = [
  ["City", ["city", "siti"]], ["Civic", ["civic", "sivic", "civik"]], ["Accord", ["accord", "acord"]],
  ["HR-V", ["hrv", "hr-v", "hr v", "jrv", "jr-v"]], ["BR-V", ["brv", "br-v", "br v"]], ["CR-V", ["crv", "cr-v", "cr v", "cr b", "crb"]],
  ["Pilot", ["pilot", "pailot"]], ["Odyssey", ["odyssey", "odisey", "odisei", "odysey"]],
];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function modeloEn(texto) {
  const t = ` ${sinAcentos(texto).replace(/[^a-z0-9\s-]/g, " ")} `;
  return MODELOS.find(([, alias]) => alias.some((a) => t.includes(` ${a} `)))?.[0] ?? null;
}

const primerNombre = (n) => {
  const p = String(n ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}]{2,}$/u.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
};

/** Lo que Mario quiere decir, si lo escribió: «…diles que X», «…: X», «…con el mensaje X». */
function mensajeDicho(orden) {
  const m = /(?:\b(?:diles|dile|decirles|mandales|mándales|enviales|envíales|escribeles|escríbeles)\s+(?:que\s+)?|:\s*|con el mensaje\s+)([\s\S]{4,})$/i.exec(orden);
  if (!m) return "";
  let x = m[1].trim();
  // «diles que ya llegó la promo» → «Ya llegó la promo»
  x = x.replace(/^que\s+/i, "");
  return x.charAt(0).toUpperCase() + x.slice(1);
}

/**
 * Interpreta la orden. Devuelve { filtros (texto para mostrar), destinatarios [{clave, id, nombre, modelo, motivo}],
 * mensaje (con {nombre}), foto (modelo cuya foto adjuntar o null), tipo }.
 */
export function interpretarOrden(orden, { prospectos = [], bandeja = {}, citas = [], inventario = [], ahora = new Date() } = {}) {
  const t = sinAcentos(orden);
  const filtros = [];
  const modelo = modeloEn(orden);
  const calor = /\bcalientes?\b/.test(t) ? "caliente" : /\btibios?\b/.test(t) ? "tibio" : /\bfrios?\b/.test(t) ? "frio" : null;
  const sinContestar = /(no (me )?(han )?(contest|respond)|ya no (me )?(contest|respond|escrib)|dejaron en visto|sin contestar(me)?\b|perdidos?|reviv|reactiv)/.test(t);
  const pendientes = /(pendientes|esperando respuesta|sin respuesta|no les he contestado)/.test(t) && !sinContestar;
  const confirmarCita = /(confirma|recuerda|recordatorio).*\bcita/.test(t) || /\bcitas?\b.*(manana|hoy)/.test(t);
  const conFoto = /\b(foto|fotos|imagen|imagenes)\b/.test(t);
  // Fechas: mes, «de hoy/ayer», «esta semana», «semana pasada», «del 15 (de noviembre)».
  const mes = MESES.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  const diaNum = /\bdel?\s+(\d{1,2})(?:\s+de\s+([a-z]+))?/.exec(t);
  let desde = null, hasta = null;
  const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  if (/\b(de|del) hoy\b/.test(t)) { desde = inicioDia(ahora); hasta = new Date(desde.getTime() + DIA); filtros.push("de hoy"); }
  else if (/\bayer\b/.test(t)) { hasta = inicioDia(ahora); desde = new Date(hasta.getTime() - DIA); filtros.push("de ayer"); }
  else if (/esta semana/.test(t)) { desde = new Date(inicioDia(ahora).getTime() - ((ahora.getDay() + 6) % 7) * DIA); filtros.push("de esta semana"); }
  else if (/semana pasada/.test(t)) { hasta = new Date(inicioDia(ahora).getTime() - ((ahora.getDay() + 6) % 7) * DIA); desde = new Date(hasta.getTime() - 7 * DIA); filtros.push("de la semana pasada"); }
  else if (diaNum && !confirmarCita) {
    const m = diaNum[2] ? MESES.indexOf(diaNum[2]) : mes >= 0 ? mes : ahora.getMonth();
    if (m >= 0) {
      let y = ahora.getFullYear();
      if (new Date(y, m, Number(diaNum[1])) > ahora) y -= 1;
      desde = new Date(y, m, Number(diaNum[1])); hasta = new Date(desde.getTime() + DIA);
      filtros.push(`del ${diaNum[1]} de ${MESES[m]}`);
    }
  } else if (mes >= 0) {
    let y = ahora.getFullYear();
    if (mes > ahora.getMonth()) y -= 1;
    desde = new Date(y, mes, 1); hasta = new Date(y, mes + 1, 1);
    filtros.push(`de ${MESES[mes]}`);
  }
  if (modelo) filtros.unshift(`interesados en ${modelo}`);
  if (calor) filtros.unshift(calor === "caliente" ? "calientes" : calor === "tibio" ? "tibios" : "fríos");
  if (sinContestar) filtros.push("que ya no contestaron");
  if (pendientes) filtros.push("que esperan respuesta");

  let destinatarios = [];
  if (confirmarCita) {
    const manana = /manana/.test(t);
    const dia = inicioDia(new Date(ahora.getTime() + (manana ? DIA : 0)));
    destinatarios = citas
      .filter((c) => c.estado === "apartada" && new Date(c.id) >= dia && new Date(c.id) < new Date(dia.getTime() + DIA))
      .map((c) => ({ clave: `${c.canal || "wa"}:${c.cliente}`, id: c.cliente, nombre: c.nombre || bandeja[`wa:${c.cliente}`]?.name || "", modelo: modeloEn(c.interes || ""), cita: c.texto, motivo: c.texto }));
    filtros.splice(0, filtros.length, `con cita ${manana ? "mañana" : "hoy"}`);
  } else {
    destinatarios = prospectos.filter((p) => {
      if (!String(p.clave).startsWith("wa:") || p.noPromociones || p.postventa || p.pideBorrar) return false;
      const conv = bandeja[p.clave] ?? {};
      const interes = `${p.interes ?? ""} ${p.primerMensaje ?? ""}`;
      if (modelo && modeloEn(interes) !== modelo) return false;
      if (calor && (p.calor ?? "frio") !== calor) return false;
      const fecha = new Date(p.at);
      if (desde && fecha < desde) return false;
      if (hasta && fecha >= hasta) return false;
      if (sinContestar && !(conv.lastDir === "out" && ahora - new Date(conv.lastAt) > 2 * DIA)) return false;
      if (pendientes && conv.lastDir !== "in") return false;
      return true;
    }).map((p) => ({ clave: p.clave, id: p.id, nombre: p.nombreCliente || p.nombre || bandeja[p.clave]?.name || "", modelo: modeloEn(`${p.interes ?? ""} ${p.primerMensaje ?? ""}`), motivo: p.interes || "" }));
  }

  const dicho = mensajeDicho(orden);
  let mensaje = dicho;
  if (!mensaje) {
    if (confirmarCita) mensaje = "¡Hola {nombre}! Te escribo para confirmar tu cita {cita} 🙌 ¿Sigue en pie? Cualquier cambio me avisas.";
    else if (sinContestar) mensaje = "¡Hola {nombre}! ¿Cómo vas? Soy Mario de Honda. ¿Sigues buscando {modelo}? Esta semana te puedo armar una corrida a tu medida, sin compromiso.";
    else if (pendientes) mensaje = "¡Hola {nombre}! Perdón la demora, ya estoy contigo. ¿Me recuerdas qué modelo te interesa y te paso la info?";
    else mensaje = "¡Hola {nombre}! Soy Mario de Honda. ¿Sigues interesado en {modelo}? Tengo opciones que te pueden acomodar, ¿te paso la corrida?";
  } else if (!/\{nombre\}/.test(mensaje) && !/^(hola|buen|que tal)/i.test(sinAcentos(mensaje))) {
    mensaje = `¡Hola {nombre}! ${mensaje}`;
  }
  const fotoModelo = conFoto ? (modelo || null) : null;
  const tieneFoto = fotoModelo ? inventario.some((a) => modeloEn(a.modelo) === fotoModelo && a.fotoId) : false;
  return {
    tipo: confirmarCita ? "cita" : "mensaje",
    filtros: filtros.length ? filtros : ["todos tus clientes"],
    destinatarios,
    mensaje,
    foto: tieneFoto ? fotoModelo : null,
    avisoFoto: conFoto && !tieneFoto ? (fotoModelo ? `No hay foto de ${fotoModelo} en Autos; se manda solo el texto.` : "Dime de qué modelo es la foto (por ejemplo «foto de la CR-V»).") : "",
  };
}

/** El mensaje final para una persona: rellena {nombre}, {modelo} y {cita} sin dejar huecos raros. */
export function mensajePara(plantilla, d) {
  const nombre = primerNombre(d.nombre);
  return plantilla
    .replace(/\{nombre\}/g, nombre)
    .replace(/\{modelo\}/g, d.modelo ? (["HR-V", "BR-V", "CR-V", "Pilot", "Odyssey"].includes(d.modelo) ? `la ${d.modelo}` : `el ${d.modelo}`) : "tu próximo Honda")
    .replace(/\{cita\}/g, d.cita || "")
    .replace(/¡Hola\s+!/g, "¡Hola!")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
