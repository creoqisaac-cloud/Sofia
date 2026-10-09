/**
 * Servidor GRATIS de Sofía en Google (Apps Script + Google Drive). No requiere tarjeta.
 *
 * 1. Entra a https://script.google.com → Nuevo proyecto. Borra todo y pega este archivo.
 * 2. Engrane (Configuración del proyecto) → Propiedades de la secuencia de comandos →
 *    agrega  TOKEN = una clave que inventes (ej. sofia-2026-xyz).
 * 3. Implementar → Nueva implementación → tipo "Aplicación web":
 *      Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier usuario
 *    Autoriza el acceso a tu Drive cuando lo pida.
 * 4. Copia la URL que termina en /exec y pégala en Sofía → Ajustes → Servidor propio,
 *    junto con la misma clave TOKEN.
 *
 * Los datos quedan en tu Google Drive, en el archivo "sofia-datos.json" (y una copia anterior).
 * Mismo protocolo que servidor.mjs:
 *   GET  ?token=…[&meta=1]                   → { ok, updatedAt, backup }
 *   POST (text/plain JSON { token, backup }) → { ok, updatedAt }
 */
var FILE_NAME = 'sofia-datos.json';
var PREV_NAME = 'sofia-datos-anterior.json';

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function token_() {
  return PropertiesService.getScriptProperties().getProperty('TOKEN') || '';
}

function file_(name) {
  var it = DriveApp.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function doGet(e) {
  var t = token_();
  if (!t || e.parameter.token !== t) return out_({ ok: false, error: 'Clave incorrecta (o falta TOKEN en las propiedades del script)' });
  var f = file_(FILE_NAME);
  if (!f) return out_({ ok: true, updatedAt: null, backup: null });
  var doc = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  if (e.parameter.meta) return out_({ ok: true, updatedAt: doc.updatedAt });
  return out_({ ok: true, updatedAt: doc.updatedAt, backup: doc.backup });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var t = token_();
    if (!t || body.token !== t) return out_({ ok: false, error: 'Clave incorrecta' });
    if (!body.backup || body.backup.app !== 'sofia-prueba') return out_({ ok: false, error: 'No es un respaldo de Sofía' });
    var updatedAt = new Date().toISOString();
    var content = JSON.stringify({ updatedAt: updatedAt, backup: body.backup });
    var f = file_(FILE_NAME);
    if (f) {
      var prev = file_(PREV_NAME);
      if (prev) prev.setContent(f.getBlob().getDataAsString('UTF-8'));
      else DriveApp.createFile(PREV_NAME, f.getBlob().getDataAsString('UTF-8'), 'application/json');
      f.setContent(content);
    } else {
      DriveApp.createFile(FILE_NAME, content, 'application/json');
    }
    return out_({ ok: true, updatedAt: updatedAt });
  } finally {
    lock.releaseLock();
  }
}
