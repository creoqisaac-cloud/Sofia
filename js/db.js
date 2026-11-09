// Almacenamiento en el propio dispositivo (IndexedDB). Sin servidor: los datos viven en este
// teléfono/tablet/computadora hasta que se respalden o se conecte un servidor propio.

const DB_NAME = "sofia-prueba";
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("files");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const kvGet = (key) => tx("kv", "readonly", (s) => reqP(s.get(key)));
export const kvSet = (key, value) => tx("kv", "readwrite", (s) => { s.put(value, key); });

/** Archivo: { name, mime, blob } */
export const fileGet = (id) => tx("files", "readonly", (s) => reqP(s.get(id)));
export const filePut = (id, file) => tx("files", "readwrite", (s) => { s.put(file, id); });
export const fileDelete = (id) => tx("files", "readwrite", (s) => { s.delete(id); });
export const fileKeys = () => tx("files", "readonly", (s) => reqP(s.getAllKeys()));

export async function clearAll() {
  await tx("kv", "readwrite", (s) => { s.clear(); });
  await tx("files", "readwrite", (s) => { s.clear(); });
}

/** Pide al navegador no borrar los datos por falta de espacio (si lo permite). */
export async function askPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
