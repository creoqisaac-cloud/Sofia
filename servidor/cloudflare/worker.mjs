// Conector de Sofía en Cloudflare Workers (plan gratis: sin tarjeta, siempre encendido, HTTPS).
// Datos en Workers KV (variable SOFIA_KV). Secretos: SOFIA_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN,
// WA_TOKEN, WA_PHONE_NUMBER_ID, WA_WABA_ID, FB_PAGE_ID, FB_PAGE_TOKEN, IG_USER_ID, PUBLIC_URL
// (Settings → Variables and Secrets).
// Programador: el cron de wrangler.toml (o Settings → Triggers → Cron Triggers) llama a scheduled() cada 5 minutos.
import { handle, runScheduled, VERSION } from "../core.mjs";

const kvStore = (kv) => ({
  async get(key) { return kv.get(key, "json"); },
  async put(key, value) { await kv.put(key, JSON.stringify(value)); },
  async delete(key) { await kv.delete(key); },
});

const worker = {
  async fetch(request, env) {
    if (!env.SOFIA_KV) return new Response(JSON.stringify({ ok: false, error: "Falta vincular el KV 'SOFIA_KV' al Worker" }), { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    const res = await handle(request, env, kvStore(env.SOFIA_KV));
    return res ?? new Response(`Conector de Sofía (${VERSION}) funcionando.`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
  // Publica en Facebook/Instagram lo programado que ya venció, aunque nadie abra la app.
  async scheduled(event, env, ctx) {
    if (!env.SOFIA_KV) return;
    const ahora = new Date(event?.scheduledTime ?? Date.now()).toISOString();
    ctx.waitUntil(runScheduled(env, kvStore(env.SOFIA_KV), ahora));
  },
};

export default worker;
