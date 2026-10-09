// Modo sin conexión: primero la red (para recibir actualizaciones), si no hay, la copia guardada.
const CACHE = "sofia-prueba-v3";
const SHELL = [
  "./", "index.html", "app.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "apple-touch-icon.png", "vendor/pdf-lib.min.js",
  "js/app.js", "js/util.js", "js/db.js", "js/store.js", "js/ui.js", "js/native.js", "js/rules.js", "js/ai.js", "js/credit.js",
  "js/ine.js", "js/ine-parser.js", "js/mxid.js", "js/ocr.js", "js/ocr-obs.js",
  "js/v-home.js", "js/v-customers.js", "js/v-credit.js", "js/v-plates.js", "js/v-whatsapp.js", "js/v-reminders.js", "js/v-settings.js",
  "js/connector.js", "js/chat-import.js", "js/bank-adapters.js", "js/v-connections.js", "js/v-more.js", "js/v-style.js", "js/v-social.js", "vendor/anthropic-sdk.mjs", "js/mrz.js", "js/google.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});
