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

const config: CapacitorConfig = {
  appId: "mx.sofia.mario",
  appName: "Sofía",
  webDir: "android-shell/www",
  appendUserAgent: "SofiaTablet/1",
  server: {
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
