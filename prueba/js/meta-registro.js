// Registro integrado de Meta (Embedded Signup) para conectar a Sofía el WhatsApp Business que el asesor ya usa en
// su celular (coexistencia): él sigue con su app y sus chats, y Sofía contesta desde el mismo número.
// Solo corre en el navegador, desde un dominio que la app de Meta tenga permitido para el SDK de JavaScript.

const SDK = "https://connect.facebook.net/es_LA/sdk.js";
const VERSION = "v23.0";
let cargando = null;

/** Carga el SDK de Facebook (una vez). Conviene llamarlo antes del clic: la ventana de Meta debe abrirse en el clic. */
export function cargarFacebook(appId) {
  const iniciar = () => window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: VERSION });
  if (window.FB) { iniciar(); return Promise.resolve(); }
  cargando ??= new Promise((ok, mal) => {
    window.fbAsyncInit = () => { iniciar(); ok(); };
    const s = document.createElement("script");
    Object.assign(s, { src: SDK, async: true, defer: true, crossOrigin: "anonymous" });
    s.onerror = () => { cargando = null; mal(new Error("No cargó el inicio de sesión de Facebook. Revisa tu internet o quita el bloqueador de anuncios.")); };
    document.head.append(s);
  });
  return cargando;
}

/**
 * Abre la ventana de Meta para conectar un WhatsApp Business que ya está en un celular.
 * Llamarlo directo desde el clic (si no, el navegador bloquea la ventana).
 * → { code, waba_id?, phone_number_id?, evento? } para mandarlo al servidor, que termina la conexión.
 */
export function registrarWhatsApp(configId) {
  return new Promise((resolve, reject) => {
    if (!window.FB) { reject(new Error("Facebook aún no carga; espera un segundo y vuelve a tocar.")); return; }
    let sesion = {};
    const oir = (ev) => {
      let host = "";
      try { host = new URL(ev.origin).hostname; } catch { return; }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type === "WA_EMBEDDED_SIGNUP") sesion = { evento: d.event, ...(d.data ?? {}) };
      } catch { /* otros avisos de Facebook que no son JSON */ }
    };
    window.addEventListener("message", oir);
    window.FB.login((r) => {
      // El aviso de la ventana (con la cuenta conectada) a veces llega justo después: se espera un momento.
      setTimeout(() => {
        window.removeEventListener("message", oir);
        const code = r?.authResponse?.code;
        if (code) { resolve({ code, waba_id: sesion.waba_id, phone_number_id: sesion.phone_number_id, evento: sesion.evento }); return; }
        reject(new Error(sesion.evento === "CANCEL"
          ? `Se cerró la ventana de Meta${sesion.current_step ? ` (en «${sesion.current_step}»)` : ""}.`
          : sesion.error_message ? `Meta dice: ${sesion.error_message}` : "No se terminó la conexión con Meta."));
      }, 800);
    }, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  });
}
