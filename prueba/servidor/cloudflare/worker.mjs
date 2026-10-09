// Conector de Sofía en Cloudflare Workers (plan gratis: sin tarjeta, siempre encendido, HTTPS).
// Datos en Workers KV (variable SOFIA_KV). Secretos: SOFIA_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN,
// WA_TOKEN, WA_PHONE_NUMBER_ID, WA_WABA_ID, FB_PAGE_ID, FB_PAGE_TOKEN (Settings → Variables and Secrets).
import { handle, VERSION } from "../core.mjs";

const kvStore = (kv) => ({
  async get(key) { return kv.get(key, "json"); },
  async put(key, value) { await kv.put(key, JSON.stringify(value)); },
});

const worker = {
  async fetch(request, env) {
    if (!env.SOFIA_KV) return new Response(JSON.stringify({ ok: false, error: "Falta vincular el KV 'SOFIA_KV' al Worker" }), { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    const res = await handle(request, env, kvStore(env.SOFIA_KV));
    return res ?? new Response(`Conector de Sofía (${VERSION}) funcionando.`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};

export default worker;
