/**
 * APK Android de Sofía (modo tablet de Mario) — Capacitor.
 *
 * Arranque seguro:
 * - sin una URL remota explícita, carga SIEMPRE el shell local del APK;
 * - una URL remota se puede guardar después desde la pantalla "Conexión".
 *
 * Esto evita que la app quede negra intentando abrir una IP LAN inexistente.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.SOFIA_SERVER_URL?.trim();
// SOFIA_PRUEBA=1 empaqueta la versión de prueba (carpeta prueba/): funciona sola, sin servidor.
const prueba = process.env.SOFIA_PRUEBA === "1";

const config: CapacitorConfig = {
  appId: prueba ? "mx.sofia.prueba" : "mx.sofia.mario",
  appName: prueba ? "Sofía Prueba" : "Sofía",
  webDir: prueba ? "prueba" : "android-shell/www",
  appendUserAgent: prueba ? "SofiaPrueba/1" : "SofiaTablet/1",
  server: prueba
    ? { androidScheme: "https" }
    : {
        ...(serverUrl ? { url: serverUrl } : {}),
        cleartext: true,
        errorPath: "conexion.html",
        androidScheme: "https",
      },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_sofia",
      iconColor: "#e7d3ae",
    },
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#0a0a0b",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
  },
};

export default config;
