// IA GRATIS de Cloudflare (Workers AI) por su API, para el servidor que corre en una computadora (Windows, Linux,
// Mac). En el Worker de Cloudflare se usa el enlace «AI»; aquí la cuenta y un token de Workers AI hacen lo mismo,
// con la misma cuota diaria sin costo. Devuelve un objeto con run(modelo, entrada) igual al enlace «AI», o null.
//
//   CF_ACCOUNT_ID  → el Account ID de Cloudflare (32 letras y números)
//   CF_API_TOKEN   → un token con permiso «Workers AI» (Cloudflare → AI → Workers AI → Use REST API)

export function iaPorApi({ cuenta, llave, url } = {}) {
  const id = String(cuenta ?? "").trim();
  const token = String(llave ?? "").trim();
  if (!/^[a-f0-9]{32}$/i.test(id) || !token) return null;
  const base = String(url || "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
  return {
    async run(modelo, entrada) {
      const res = await fetch(`${base}/accounts/${id}/ai/run/${modelo}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(entrada),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
      return data.result;
    },
  };
}
