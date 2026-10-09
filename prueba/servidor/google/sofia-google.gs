/**
 * Sofía en tu cuenta de Google: servidor GRATIS con Google Apps Script (sin tarjeta, sin servidor propio).
 * Un solo archivo para pegar en https://script.google.com. Pasos exactos: LEEME.md (misma carpeta).
 *
 * Todo funciona sin IA:
 *  - Datos:       respaldo de la app en tu Drive ("sofia-datos.json" y una copia anterior).
 *  - Correo:      envía desde tu Gmail con adjuntos (p. ej. trámite de placas), etiqueta los hilos "Sofía",
 *                 revisa las respuestas, sugiere el estado por palabras clave y manda seguimientos solo.
 *  - Calendario:  recordatorios en el calendario "Sofía" con aviso: suenan en el iPhone vía Google Calendar.
 *  - OCR:         texto de fotos con el OCR gratuito de Google Drive (la foto no se queda guardada).
 *
 * Protocolo (la app manda text/plain para evitar la "preflight" de CORS y sigue el 302 de Google):
 *   GET  ?token=…[&meta=1]        → { ok, updatedAt, backup }     (el mismo de servidor.mjs)
 *   POST { token, backup }        → { ok, updatedAt }
 *   POST { token, action, … }     → { ok, … }                     (acciones: ver ACCIONES)
 *
 * Propiedades del script: TOKEN (la clave de la app; la pones tú). Lo demás lo guarda este script.
 * Requiere el tiempo de ejecución V8 y el manifiesto appsscript.json de esta carpeta.
 */
const VERSION = 'google-1.0';
const FILE_NAME = 'sofia-datos.json';
const PREV_NAME = 'sofia-datos-anterior.json';
const ETIQUETA = 'Sofía';
const CALENDARIO = 'Sofía';
const DIA = 24 * 60 * 60 * 1000;

// Límites: Google acepta ~50 MB por petición y Gmail 25 MB por correo (contando la codificación).
const MAX_PETICION = 45 * 1024 * 1024; // caracteres del cuerpo POST
const MAX_ADJUNTOS = 20;
const MAX_ADJUNTOS_BYTES = 18 * 1024 * 1024;
const MAX_DESTINATARIOS = 10;
const MAX_OCR_IMAGENES = 6;
const MAX_OCR_BYTES = 8 * 1024 * 1024;
const OCR_TIPOS = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
const MAX_TEXTO_RESPUESTA = 1500;
const MAX_CASOS_REVISAR = 50; // cada caso lee su hilo de Gmail
const MAX_SEGUIMIENTOS = 3; // seguimientos automáticos por caso: insistir más ya no ayuda
const MAX_SEGUIMIENTOS_POR_VUELTA = 20;
const DIAS_GUARDAR_CASO = 180;

const CONFIG_INICIAL = {
  seguimientoAuto: false,
  dias: 3,
  texto: 'Buen día. Doy seguimiento a este trámite: ¿me pueden compartir el estatus? Quedo al pendiente, gracias.',
};

const SIN_CLAVE = 'Clave incorrecta (o falta TOKEN en las propiedades del script)';

// ───────── Entrada ─────────

const ACCIONES = {
  'estado': estado_,
  'correo.enviar': correoEnviar_,
  'correo.revisar': correoRevisar_,
  'correo.config': correoConfig_,
  'correo.cerrar': correoCerrar_,
  'calendario.guardar': calendarioGuardar_,
  'calendario.borrar': calendarioBorrar_,
  'ocr': ocr_,
};
// Solo leen: no esperan el candado (así una lectura de fotos no frena el respaldo).
const SIN_CANDADO = { 'estado': true, 'correo.revisar': true, 'ocr': true };

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!claveValida_(p.token)) return out_({ ok: false, error: SIN_CLAVE });
  try {
    const f = file_(FILE_NAME);
    if (!f) return out_({ ok: true, updatedAt: null, backup: null });
    const doc = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
    if (p.meta) return out_({ ok: true, updatedAt: doc.updatedAt });
    return out_({ ok: true, updatedAt: doc.updatedAt, backup: doc.backup });
  } catch (err) {
    return out_({ ok: false, error: mensaje_(err) });
  }
}

function doPost(e) {
  const raw = (e && e.postData && e.postData.contents) || '';
  if (raw.length > MAX_PETICION) return out_({ ok: false, error: 'La petición pesa más de 45 MB.' });
  let body;
  try { body = JSON.parse(raw); } catch (err) { return out_({ ok: false, error: 'JSON inválido' }); }
  if (!body || typeof body !== 'object') return out_({ ok: false, error: 'JSON inválido' });
  if (!claveValida_(body.token)) return out_({ ok: false, error: SIN_CLAVE });

  // Sin "action" es el respaldo de siempre: { token, backup }.
  const nombre = body.action ? String(body.action) : '';
  if (nombre && !Object.prototype.hasOwnProperty.call(ACCIONES, nombre)) return out_({ ok: false, error: 'Acción desconocida: ' + nombre.slice(0, 40) });
  const accion = nombre ? ACCIONES[nombre] : guardarRespaldo_;

  const lock = SIN_CANDADO[nombre] ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(20000)) return out_({ ok: false, error: 'Google está ocupado con otra operación de Sofía. Intenta de nuevo en un momento.' });
  try {
    return out_(Object.assign({ ok: true }, accion(body)));
  } catch (err) {
    return out_({ ok: false, error: mensaje_(err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const mensaje_ = (err) => String((err && err.message) || err).slice(0, 300);
const props_ = () => PropertiesService.getScriptProperties();
const token_ = () => (props_().getProperty('TOKEN') || '').trim();

/** Compara la clave en tiempo constante: se comparan sus huellas SHA-256 (siempre del mismo largo). */
function claveValida_(recibida) {
  const t = token_();
  if (!t) return false;
  const a = huella_(String(recibida == null ? '' : recibida));
  const b = huella_(t);
  let d = 0;
  for (let i = 0; i < b.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const huella_ = (s) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);

/** Texto de una sola línea, recortado. */
const linea_ = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/** Número entero dentro de [min, max]; si no es número, el valor por omisión. */
function entre_(v, min, max, porOmision) {
  const n = Math.round(Number(v));
  return isFinite(n) ? Math.min(max, Math.max(min, n)) : porOmision;
}

// ───────── Datos (respaldo de la app) ─────────

/**
 * Archivo de Drive por nombre: el más reciente que sea TUYO y no esté en la papelera. DriveApp también lista
 * lo que otras personas comparten contigo: un archivo ajeno con el mismo nombre no se lee ni se sobrescribe
 * (si no, alguien podría compartirte un "sofia-datos.json" y recibir ahí los datos de tus clientes).
 */
function file_(name) {
  const yo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const it = DriveApp.getFilesByName(name);
  let mejor = null;
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed() || (yo && !esTuyo_(f, yo))) continue;
    if (!mejor || f.getLastUpdated() > mejor.getLastUpdated()) mejor = f;
  }
  return mejor;
}

function esTuyo_(f, yo) {
  try {
    const dueno = f.getOwner();
    return Boolean(dueno) && String(dueno.getEmail()).toLowerCase() === yo;
  } catch (err) {
    return false;
  }
}

const driveAvanzado_ = () => typeof Drive !== 'undefined' && Boolean(Drive.Files);

/**
 * Escribe (o crea) un archivo con el contenido de un Blob. Con el servicio avanzado de Drive se reemplaza
 * el contenido sin el tope de 10 MB de setContent (los respaldos con fotos pesan más); sin él, setContent.
 */
function writeFile_(name, blob) {
  blob.setName(name);
  const f = file_(name);
  if (!f) DriveApp.createFile(blob);
  else if (driveAvanzado_()) Drive.Files.update({}, f.getId(), blob);
  else f.setContent(blob.getDataAsString('UTF-8'));
}

function guardarRespaldo_(body) {
  if (!body.backup || body.backup.app !== 'sofia-prueba') throw new Error('No es un respaldo de Sofía');
  const updatedAt = new Date().toISOString();
  const nuevo = Utilities.newBlob(JSON.stringify({ updatedAt: updatedAt, backup: body.backup }), 'application/json', FILE_NAME);
  const actual = file_(FILE_NAME);
  if (actual) writeFile_(PREV_NAME, actual.getBlob());
  writeFile_(FILE_NAME, nuevo);
  return { updatedAt: updatedAt };
}

// ───────── Estado ─────────

function estado_() {
  const cfg = config_();
  return {
    version: VERSION,
    cuenta: Session.getEffectiveUser().getEmail(),
    zonaHoraria: Session.getScriptTimeZone(),
    servicios: { datos: true, correo: true, calendario: true, ocr: driveAvanzado_() },
    correo: {
      cuotaRestante: MailApp.getRemainingDailyQuota(),
      agenteActivo: agenteInstalado_(),
      seguimientoAuto: cfg.seguimientoAuto,
      dias: cfg.dias,
      texto: cfg.texto,
      casos: casos_().length,
    },
    bitacora: bitacora_().slice(0, 20),
  };
}

// ───────── Correo (Gmail) ─────────
// Cada caso de la app (ref, p. ej. el id del cliente) guarda su hilo en las propiedades del script:
//   "hilo:<ref>" → { ref, threadId, to, cc, subject, enviadoAt, dias?, seguimientos: [fechas], cerrado }

const PREFIJO_CASO = 'hilo:';

function ref_(v) {
  const ref = String(v == null ? '' : v).trim();
  if (!/^[\w.:-]{1,100}$/.test(ref)) throw new Error('Falta el caso (ref) o no es válido.');
  return ref;
}

function correos_(v, campo) {
  const lista = (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean);
  if (!lista.length) throw new Error('Falta el correo en "' + campo + '".');
  if (lista.length > MAX_DESTINATARIOS) throw new Error('Máximo ' + MAX_DESTINATARIOS + ' correos en "' + campo + '".');
  for (const c of lista) {
    // 254 caracteres es el máximo de una dirección de correo (RFC 5321).
    if (c.length > 254 || !/^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i.test(c)) throw new Error('Correo inválido en "' + campo + '": ' + c.slice(0, 80));
  }
  return lista;
}

function adjuntos_(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw new Error('Los adjuntos no vienen en una lista.');
  if (lista.length > MAX_ADJUNTOS) throw new Error('Máximo ' + MAX_ADJUNTOS + ' archivos por correo.');
  let total = 0;
  return lista.map((a, i) => {
    const bytes = Utilities.base64Decode(String((a && a.base64) || ''));
    if (!bytes.length) throw new Error('El archivo ' + (i + 1) + ' llegó vacío.');
    total += bytes.length;
    if (total > MAX_ADJUNTOS_BYTES) throw new Error('Los adjuntos pesan más de 18 MB (límite de Gmail). Manda menos fotos o más ligeras.');
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(a.mime || '')) ? String(a.mime) : 'application/octet-stream';
    const nombre = String(a.name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'archivo-' + (i + 1);
    return Utilities.newBlob(bytes, mime, nombre);
  });
}

function caso_(ref) {
  const v = props_().getProperty(PREFIJO_CASO + ref);
  return v ? JSON.parse(v) : null;
}

const guardarCaso_ = (c) => props_().setProperty(PREFIJO_CASO + c.ref, JSON.stringify(c));

/** Casos seguidos, el envío más reciente primero. */
function casos_() {
  const todo = props_().getProperties();
  return Object.keys(todo)
    .filter((k) => k.indexOf(PREFIJO_CASO) === 0)
    .map((k) => JSON.parse(todo[k]))
    .sort((a, b) => String(b.enviadoAt).localeCompare(String(a.enviadoAt)));
}

function hilo_(id) {
  if (!id) return null;
  try { return GmailApp.getThreadById(id); } catch (err) { return null; }
}

const etiqueta_ = () => GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
const mensajes_ = (hilo) => hilo.getMessages().filter((m) => !m.isDraft() && !m.isInTrash());

/** Direcciones de la cuenta (y sus alias) para distinguir lo que mandó el asesor de lo que le contestan. */
function misCorreos_() {
  const yo = {};
  [Session.getEffectiveUser().getEmail()].concat(GmailApp.getAliases()).forEach((c) => { if (c) yo[String(c).toLowerCase()] = true; });
  return yo;
}

function correoDe_(texto) {
  const m = /<([^>]+)>/.exec(texto || '');
  return String(m ? m[1] : texto || '').trim().toLowerCase();
}

const esMio_ = (msg, yo) => Boolean(yo[correoDe_(msg.getFrom())]);
const contarCorreos_ = (s) => String(s || '').split(',').filter((x) => x.trim()).length;

/**
 * { to, cc?, subject, body, attachments: [{ name, mime, base64 }], ref, seguimientoDias?, enHilo?, nombre? }
 * Envía desde el Gmail de la cuenta con adjuntos y deja el hilo seguido para revisar respuestas.
 * enHilo: true contesta a todos en el hilo que ya tiene ese caso (si existe) en vez de abrir uno nuevo.
 */
function correoEnviar_(p) {
  const ref = ref_(p.ref);
  const to = correos_(p.to, 'Para');
  const cc = p.cc && String(p.cc).trim() ? correos_(p.cc, 'CC') : [];
  const subject = linea_(p.subject, 250);
  const body = String(p.body == null ? '' : p.body);
  if (!subject || !body.trim()) throw new Error('Falta el asunto o el mensaje.');
  if (body.length > 50000) throw new Error('El mensaje es demasiado largo.');
  const adjuntos = adjuntos_(p.attachments);
  const cuota = MailApp.getRemainingDailyQuota();
  if (cuota < to.length + cc.length) throw new Error('Gmail ya no deja enviar más correos hoy desde Sofía (quedan ' + cuota + '). Intenta mañana.');

  const opciones = { attachments: adjuntos };
  if (cc.length) opciones.cc = cc.join(',');
  if (p.nombre) opciones.name = linea_(p.nombre, 80);

  let caso = caso_(ref);
  let hilo = p.enHilo && caso ? hilo_(caso.threadId) : null;
  const previos = hilo ? mensajes_(hilo) : [];
  if (previos.length) {
    previos[previos.length - 1].replyAll(body, opciones);
  } else {
    // createDraft + send devuelve el mensaje enviado, y con él su hilo (sendEmail no lo devuelve).
    hilo = GmailApp.createDraft(to.join(','), subject, body, opciones).send().getThread();
    caso = { ref: ref, threadId: hilo.getId(), subject: subject, seguimientos: [] };
  }

  // El correo ya salió: lo que sigue no debe responder error, porque un reintento lo mandaría dos veces.
  const avisos = [];
  try { hilo.addLabel(etiqueta_()); } catch (err) { avisos.push('no se pudo etiquetar (' + mensaje_(err) + ')'); }
  const ahora = new Date().toISOString();
  caso.to = to.join(', ');
  caso.cc = cc.join(', ');
  caso.enviadoAt = ahora;
  caso.cerrado = false;
  if (p.seguimientoDias != null && p.seguimientoDias !== '') caso.dias = entre_(p.seguimientoDias, 0, 30, null);
  try { guardarCaso_(caso); } catch (err) { avisos.push('no quedó en seguimiento (' + mensaje_(err) + ')'); }
  anotar_('enviado', ref, 'Correo a ' + caso.to + ': ' + caso.subject + (adjuntos.length ? ' (' + adjuntos.length + ' adjuntos)' : ''));
  const r = { ref: ref, threadId: caso.threadId, enviadoAt: ahora, adjuntos: adjuntos.length, cuotaRestante: MailApp.getRemainingDailyQuota() };
  if (avisos.length) r.aviso = 'El correo sí se envió, pero ' + avisos.join(' y ') + '.';
  return r;
}

/** { refs? } → por caso: respuestas recibidas y un estado sugerido por palabras clave (sin IA). */
function correoRevisar_(p) {
  const refs = p.refs ? [].concat(p.refs) : null;
  if (refs && refs.length > MAX_CASOS_REVISAR) throw new Error('Máximo ' + MAX_CASOS_REVISAR + ' casos por revisión.');
  const lista = refs ? refs.map((r) => caso_(ref_(r))).filter(Boolean) : casos_().slice(0, MAX_CASOS_REVISAR);
  const yo = misCorreos_();
  return { casos: lista.map((c) => resumenCaso_(c, yo)) };
}

function resumenCaso_(c, yo) {
  const r = {
    ref: c.ref, threadId: c.threadId, asunto: c.subject, para: c.to, enviadoAt: c.enviadoAt,
    seguimientos: c.seguimientos || [], cerrado: Boolean(c.cerrado), respuestas: [], sugerido: null, esperando: false,
  };
  const hilo = hilo_(c.threadId);
  if (!hilo) { r.error = 'No se encontró el hilo en Gmail (¿se borró?).'; return r; }
  const msgs = mensajes_(hilo);
  for (const m of msgs) {
    if (esMio_(m, yo)) continue;
    const texto = sinCitas_(m.getPlainBody());
    r.respuestas.push({
      de: m.getFrom(),
      fecha: m.getDate().toISOString(),
      texto: texto.slice(0, MAX_TEXTO_RESPUESTA),
      adjuntos: m.getAttachments({ includeInlineImages: false }).map((a) => a.getName()),
      estado: clasificar_(texto),
    });
  }
  r.respuestas = r.respuestas.slice(-10);
  const ultima = r.respuestas[r.respuestas.length - 1];
  r.sugerido = ultima ? ultima.estado : null;
  r.esperando = msgs.length > 0 && esMio_(msgs[msgs.length - 1], yo); // la última palabra es del asesor
  return r;
}

/** Quita lo citado de una respuesta ("El … escribió:", líneas con ">") para leer solo lo nuevo. */
function sinCitas_(texto) {
  const lineas = String(texto || '').replace(/\r/g, '').split('\n');
  const encabezado = /^\s*(El|On)\s.{4,250}\s(escribi[oó]|wrote):/;
  const out = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (encabezado.test(l) || encabezado.test(l + ' ' + (lineas[i + 1] || ''))) break;
    if (/^\s*-{2,}\s*(Mensaje original|Original Message)/i.test(l) || /^\s*(De|From):\s.+@/.test(l)) break;
    if (/^\s*_{10,}\s*$/.test(l)) break; // Outlook separa lo citado con una línea de guiones bajos
    if (/^\s*>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ───────── Estado sugerido por palabras clave (sin IA) ─────────
// En orden: lo que pide acción del asesor (falta un documento, falta pagar) va antes que "placas listas";
// "en trámite" es la señal más débil. Si nada coincide: null (sin cambio). Se compara sin acentos.

const DOCS = '(documentos?|documentacion|ine|identificacion|credencial|comprobante|domicilio|factura|curp|rfc|constancia|situacion fiscal|carta poder|firma|copia|original|acta|pedimento|contrato|poliza|endoso|baja)';
const REGLAS = [
  { clave: 'falta_documento', texto: 'Falta documento', res: [
    new RegExp('\\b(falta|faltan|faltaria|hace falta|hacen falta|faltante|faltantes)\\b[^.!?]{0,60}\\b' + DOCS + '\\b'),
    new RegExp('\\b' + DOCS + '\\b[^.!?]{0,60}\\b(ilegibles?|vencid[oa]s?|no (es|esta|son|estan) vigentes?|no coincide|incorrect[oa]s?|no se ve|borros[oa]s?|cortad[oa]s?)\\b'),
    new RegExp('\\b(reenvi\\w*|volver a enviar|vuelva a enviar|enviar de nuevo|necesitamos|requerimos)\\b[^.!?]{0,60}\\b' + DOCS + '\\b'),
  ] },
  { clave: 'pago', texto: 'Pago pendiente', res: [
    /\b(pago|pagar|pague|paguen|deposito|depositar|deposite|transferencia|linea de captura|ficha de pago|importe|monto|costo|adeudo)\b/,
    /\$\s?\d/,
  ] },
  // sinNegacion: "placas listas" frena los seguimientos; si la frase lleva un "no" o está en futuro
  // ("no están listas", "estarán listas el viernes", "cuando estén listas"), todavía no lo están.
  { clave: 'placas_listas', texto: 'Placas listas', sinNegacion: true, res: [
    /\b(placas|tarjeta de circulacion|engomado|tramite)\b[^.!?]{0,40}\b(listas?|terminad[oa]s?|concluid[oa]s?|salieron)\b/,
    /\b(listas? para (recoger|entrega\w*)|pasen? a recoger\w*|pueden? pasar por (ellas|las placas)|ya (las )?puedes? recoger|ya (las )?pueden recoger)\b/,
    /\bya (salieron|estan|quedaron)\b[^.!?]{0,30}\b(placas|tarjeta de circulacion)\b/,
  ] },
  { clave: 'en_tramite', texto: 'En trámite', res: [
    /\b(en tramite|en proceso|ingresad[oa]s?|ingresamos|recibid[oa]s?|recibimos|en revision|en espera|estamos trabajando|le (aviso|avisamos|informo|informamos)|en cuanto (tenga|tengamos|esten|salgan)|dias habiles|aun no|todavia no|no han salido)\b/,
    /\b(estaran|estara|quedaran|quedara|saldran|saldra)\b[^.!?]{0,30}\b(listas?|terminad[oa]s?|concluid[oa]s?|placas)\b/,
  ] },
];
// Frases que engañarían a las reglas: se neutralizan antes de revisar.
const NEUTRAS = [
  [/\bno (nos |le |les )?falta(n)? (nada|ningun\w*)\b|\bfalta(n)? poco\b/g, ' '],
  [/\b(recibimos|recibido|confirmamos|ya quedo|ya esta|quedo) (su |el )?pago\b|\bpago (ya )?((quedo|esta|fue) )?(recibido|confirmado|aplicado|realizado|registrado|cubierto)\b/g, ' '],
  [/\bno (nos |le |les )?hacen? falta\b/g, ' '],
  [/\b((aun|todavia) )?no (estan|esta|quedan|quedaron|han quedado|salen|han salido)( (aun|todavia))? (listas?|terminad[oa]s?|concluid[oa]s?|las placas)\b/g, ' en tramite '],
  [/\b((aun|todavia) )?no (ha |han )?(salido|salieron|salen|concluido|terminado)\b/g, ' en tramite '],
];
const NIEGA = /\b(no|ni|sin|cuando|estaran|estara|esten|estarian|quedaran|quedara|queden|saldran|saldra|salgan)\b/;

const normalizar_ = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

/** "Le falta la constancia…" → { clave: 'falta_documento', texto: 'Falta documento', coincidencia: 'falta la constancia' } */
function clasificar_(texto) {
  let t = normalizar_(texto);
  for (const [re, por] of NEUTRAS) t = t.replace(re, por);
  for (const regla of REGLAS) {
    for (const re of regla.res) {
      const m = re.exec(t);
      if (m && !(regla.sinNegacion && NIEGA.test(m[0]))) return { clave: regla.clave, texto: regla.texto, coincidencia: m[0].trim().slice(0, 80) };
    }
  }
  return null;
}

// ───────── Seguimiento automático ─────────

function config_() {
  const v = props_().getProperty('CORREO_CONFIG');
  const c = v ? JSON.parse(v) : {};
  return {
    seguimientoAuto: Boolean(c.seguimientoAuto),
    dias: c.dias || CONFIG_INICIAL.dias,
    texto: c.texto || CONFIG_INICIAL.texto,
  };
}

/** { seguimientoAuto?, dias?, texto? } Al encenderlo se instala el disparador si falta. */
function correoConfig_(p) {
  const c = config_();
  if (p.seguimientoAuto != null) c.seguimientoAuto = Boolean(p.seguimientoAuto);
  if (p.dias != null) {
    const d = Math.round(Number(p.dias));
    if (!(d >= 1 && d <= 30)) throw new Error('Los días de seguimiento van de 1 a 30.');
    c.dias = d;
  }
  if (p.texto != null) {
    const t = String(p.texto).trim();
    if (!t) throw new Error('Escribe el texto del seguimiento.');
    c.texto = t.slice(0, 2000);
  }
  props_().setProperty('CORREO_CONFIG', JSON.stringify(c));
  if (c.seguimientoAuto) instalarAgente_();
  return { config: c, agenteActivo: agenteInstalado_() };
}

/** { ref } Deja de dar seguimiento automático a ese caso (p. ej. placas ya entregadas). */
function correoCerrar_(p) {
  const c = caso_(ref_(p.ref));
  if (!c) return { cerrado: false };
  c.cerrado = true;
  guardarCaso_(c);
  anotar_('cerrado', c.ref, 'Sin más seguimientos automáticos');
  return { cerrado: true };
}

/**
 * ¿Toca mandar seguimiento a este caso? Devuelve el mensaje al que se contesta, o null.
 * Toca si el seguimiento está encendido, el caso sigue abierto, la última palabra del hilo es del asesor y
 * lleva N días sin respuesta. Uno por periodo y máximo MAX_SEGUIMIENTOS; nunca si ya avisaron "placas listas".
 */
function seguimientoPendiente_(c, cfg, yo, ahora) {
  const dias = c.dias != null ? c.dias : cfg.dias;
  const hechos = c.seguimientos || [];
  if (!cfg.seguimientoAuto || c.cerrado || !(dias > 0) || hechos.length >= MAX_SEGUIMIENTOS) return null;
  if (hechos.length && ahora - new Date(hechos[hechos.length - 1]).getTime() < dias * DIA) return null;
  const hilo = hilo_(c.threadId);
  if (!hilo) return null;
  const msgs = mensajes_(hilo);
  const ultimo = msgs[msgs.length - 1];
  if (!ultimo || !esMio_(ultimo, yo)) return null; // contestaron: ahora le toca al asesor
  if (ahora - ultimo.getDate().getTime() < dias * DIA) return null;
  const suyos = msgs.filter((m) => !esMio_(m, yo));
  const estado = suyos.length ? clasificar_(sinCitas_(suyos[suyos.length - 1].getPlainBody())) : null;
  if (estado && estado.clave === 'placas_listas') return null;
  return ultimo;
}

/**
 * Disparador cada hora (lo crea instalar() o correo.config). Manda UN correo de seguimiento en el mismo
 * hilo a cada caso que lleve N días sin respuesta y lo anota en la bitácora. También olvida casos viejos.
 */
function agenteCorreo() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // otra vuelta sigue trabajando
  try {
    const cfg = config_();
    const yo = misCorreos_();
    const ahora = Date.now();
    let enviados = 0;
    for (const c of casos_()) {
      if (ahora - new Date(c.enviadoAt).getTime() > DIAS_GUARDAR_CASO * DIA) { props_().deleteProperty(PREFIJO_CASO + c.ref); continue; }
      if (enviados >= MAX_SEGUIMIENTOS_POR_VUELTA) break;
      try {
        const msg = seguimientoPendiente_(c, cfg, yo, ahora);
        if (!msg) continue;
        if (MailApp.getRemainingDailyQuota() < contarCorreos_(c.to) + contarCorreos_(c.cc) + 1) break; // sin cuota: la siguiente hora
        // Primero se anota y luego se manda: si no se pudiera guardar, el tope de 3 no contaría y se repetiría sin fin.
        const antes = c.seguimientos || [];
        c.seguimientos = antes.concat(new Date().toISOString());
        guardarCaso_(c);
        try {
          msg.replyAll(cfg.texto);
        } catch (err) {
          c.seguimientos = antes;
          try { guardarCaso_(c); } catch (e) { /* queda contado sin enviarse: mejor uno menos que uno de más */ }
          throw err;
        }
        enviados++;
        anotar_('seguimiento', c.ref, 'Seguimiento automático #' + c.seguimientos.length + ' a ' + c.to);
      } catch (err) {
        anotar_('error', c.ref, mensaje_(err));
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/** Ejecútala UNA vez desde el editor (▶ Ejecutar): Google pide los permisos y queda el disparador del agente. */
function instalar() {
  if (!token_()) throw new Error('Primero agrega TOKEN en Configuración del proyecto → Propiedades de la secuencia de comandos.');
  instalarAgente_();
  console.log('Listo. Cuenta: ' + Session.getEffectiveUser().getEmail() + ' · correos que puedes enviar hoy: ' + MailApp.getRemainingDailyQuota());
}

function instalarAgente_() {
  if (!agenteInstalado_()) ScriptApp.newTrigger('agenteCorreo').timeBased().everyHours(1).create();
}

const agenteInstalado_ = () => ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'agenteCorreo');

// ───────── Bitácora (lo que hizo el script por su cuenta) ─────────

function bitacora_() {
  const v = props_().getProperty('BITACORA');
  return v ? JSON.parse(v) : [];
}

/** Bytes en UTF-8: el tope de una propiedad (9 KB) se mide en bytes, y "á" o "…" pesan más de uno. */
const bytes_ = (s) => Utilities.newBlob(s).getBytes().length;

/** Anota en la bitácora. Nunca truena: la bitácora es secundaria y no debe frenar un envío ya hecho. */
function anotar_(tipo, ref, texto) {
  try {
    const lista = [{ at: new Date().toISOString(), tipo: tipo, ref: ref || null, texto: String(texto).slice(0, 200) }].concat(bitacora_()).slice(0, 30);
    let json = JSON.stringify(lista);
    while (bytes_(json) > 8000 && lista.length > 1) { lista.pop(); json = JSON.stringify(lista); }
    props_().setProperty('BITACORA', json);
  } catch (err) {
    console.log('No se pudo anotar en la bitácora: ' + mensaje_(err));
  }
}

// ───────── Calendario ─────────

/** Calendario "Sofía" (se crea la primera vez). Su id queda guardado por si cambias el nombre. */
function calendario_() {
  const id = props_().getProperty('CALENDARIO_ID');
  let cal = id ? CalendarApp.getCalendarById(id) : null;
  if (cal) return cal;
  // Solo uno tuyo: un calendario "Sofía" que otra persona te compartió no recibe tus recordatorios.
  const mios = CalendarApp.getCalendarsByName(CALENDARIO).filter((c) => c.isOwnedByMe());
  cal = mios.length ? mios[0] : CalendarApp.createCalendar(CALENDARIO, { summary: 'Recordatorios de Sofía' });
  props_().setProperty('CALENDARIO_ID', cal.getId());
  return cal;
}

function evento_(cal, id) {
  try { return cal.getEventById(String(id)); } catch (err) { return null; }
}

/** Minutos antes del evento: Google Calendar acepta de 5 a 40320 (4 semanas) y hasta 5 avisos. */
function avisos_(lista) {
  const v = (Array.isArray(lista) ? lista : []).map(Number).filter((m) => isFinite(m)).map((m) => entre_(m, 5, 40320, 5));
  const unicos = v.filter((m, i) => v.indexOf(m) === i).slice(0, 5);
  return unicos.length ? unicos : [5]; // sin avisos válidos, uno 5 min antes: un recordatorio que no suena no sirve
}

/** { id?, titulo, descripcion?, inicio (ISO), minutos?, avisos?: [minutos antes] } → { id } */
function calendarioGuardar_(p) {
  const titulo = linea_(p.titulo, 200);
  if (!titulo) throw new Error('Falta el título del recordatorio.');
  const inicio = new Date(p.inicio);
  if (!p.inicio || isNaN(inicio.getTime())) throw new Error('La fecha del recordatorio no es válida.');
  const fin = new Date(inicio.getTime() + entre_(p.minutos, 5, 24 * 60, 15) * 60000);
  const descripcion = String(p.descripcion || '').slice(0, 4000);
  const avisos = avisos_(p.avisos);
  const cal = calendario_();
  let ev = p.id ? evento_(cal, p.id) : null; // si lo borraron en Google Calendar, se crea de nuevo
  if (ev) {
    ev.setTitle(titulo);
    ev.setDescription(descripcion);
    ev.setTime(inicio, fin);
  } else {
    ev = cal.createEvent(titulo, inicio, fin, { description: descripcion });
  }
  ev.removeAllReminders();
  avisos.forEach((m) => ev.addPopupReminder(m));
  return { id: ev.getId(), inicio: inicio.toISOString(), avisos: avisos };
}

/** { id } */
function calendarioBorrar_(p) {
  if (!p.id) throw new Error('Falta el id del evento.');
  const ev = evento_(calendario_(), p.id);
  if (ev) ev.deleteEvent();
  return { borrado: Boolean(ev) };
}

// ───────── OCR gratuito de Google Drive ─────────

/** { images: [{ base64, mime }] } → { texts: [texto por imagen] } */
function ocr_(p) {
  if (!driveAvanzado_()) throw new Error('Falta activar el servicio avanzado de Drive: pega el appsscript.json de la guía.');
  const imagenes = p.images;
  if (!Array.isArray(imagenes) || !imagenes.length) throw new Error('No llegó ninguna imagen.');
  if (imagenes.length > MAX_OCR_IMAGENES) throw new Error('Máximo ' + MAX_OCR_IMAGENES + ' fotos por lectura.');
  return { texts: imagenes.map(leerImagen_) };
}

/** Convierte la foto en un Google Doc con OCR, lee su texto y borra el archivo: la foto no se queda en Drive. */
function leerImagen_(img, i) {
  const mime = String((img && img.mime) || 'image/jpeg').toLowerCase();
  if (OCR_TIPOS.indexOf(mime) < 0) throw new Error('La foto ' + (i + 1) + ' debe ser JPG, PNG, GIF o PDF.');
  const bytes = Utilities.base64Decode(String(img.base64 || ''));
  if (!bytes.length) throw new Error('La foto ' + (i + 1) + ' llegó vacía.');
  if (bytes.length > MAX_OCR_BYTES) throw new Error('La foto ' + (i + 1) + ' pesa más de 8 MB.');
  const doc = Drive.Files.create(
    { name: 'sofia-ocr-' + Date.now() + '-' + i, mimeType: 'application/vnd.google-apps.document' },
    Utilities.newBlob(bytes, mime, 'sofia-ocr'),
    { ocrLanguage: 'es' });
  try {
    return limpiarOcr_(DocumentApp.openById(doc.id).getBody().getText());
  } finally {
    borrarTemporal_(doc.id);
  }
}

function borrarTemporal_(id) {
  DriveApp.getFileById(id).setTrashed(true);
  // El Doc convertido incluye la foto: además se intenta borrarlo de la papelera. Si Drive no lo permite,
  // queda en la papelera (Google la vacía sola a los 30 días).
  try { Drive.Files.remove(id); } catch (err) { /* se queda en la papelera */ }
}

const limpiarOcr_ = (t) => String(t || '').replace(/\uFFFC/g, '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
