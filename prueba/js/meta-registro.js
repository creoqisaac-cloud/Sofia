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
    let respuesta;
    let espera;
    const terminar = () => {
      clearTimeout(espera);
      window.removeEventListener("message", oir);
      const code = respuesta?.authResponse?.code;
      if (code && sesion.evento === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" && sesion.waba_id) {
        resolve({ code, waba_id: sesion.waba_id, phone_number_id: sesion.phone_number_id, evento: sesion.evento });
        return;
      }
      let mensaje = "Vuelve a abrir la ventana de Meta y pulsa «Finalizar» en el último paso.";
      if (sesion.evento === "CANCEL") mensaje = "Se canceló la conexión en Meta.";
      else if (sesion.error_message || respuesta?.error?.message) mensaje = String(sesion.error_message || respuesta.error.message);
      else if (code) mensaje = "Meta no confirmó el WhatsApp Business del celular. En «Antes de conectar», revisa la plantilla de registro insertado y elige conectar tu cuenta existente.";
      const referencia = [sesion.error_code, sesion.session_id].filter(Boolean).join(" · ");
      reject(new Error(referencia ? mensaje + " (" + referencia + ")" : mensaje));
    };
    const oir = (ev) => {
      if (!/^https:\/\/(?:[\w-]+\.)*facebook\.com$/.test(ev.origin)) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP" || !/^(FINISH.*|CANCEL|ERROR)$/.test(d.event)) return;
        sesion = { ...(d.data ?? {}), evento: d.event };
        if (respuesta || d.event === "CANCEL" || d.event === "ERROR") terminar();
      } catch { /* otros avisos de Facebook que no son JSON */ }
    };
    window.addEventListener("message", oir);
    const recibirCodigo = (r) => {
      respuesta = r;
      if (sesion.evento || !r?.authResponse?.code) terminar();
      else espera = setTimeout(terminar, 10000);
    };
    try {
      window.FB.login(recibirCodigo, {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      });
    } catch (error) {
      window.removeEventListener("message", oir);
      reject(error);
    }
  });
}
