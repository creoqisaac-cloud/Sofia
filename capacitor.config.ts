/**
 * APK Android de Sofía (modo tablet de Mario) — Capacitor.
 *
 * La APK es un CASCARÓN nativo: carga la app web de Sofía desde el servidor (Next.js + BD)
 * y agrega lo nativo (compartir PDF, guardar archivos, cámara al subir documentos).
 * No lleva Next.js, base de datos, secretos ni credenciales.
 *
 * URL del servidor:
 *  - por defecto: SOFIA_SERVER_URL al momento de `npm run android:sync` (o la de abajo);
 *  - en la tablet: pantalla "Conexión" (se abre sola si no hay servidor) → se guarda en el
 *    dispositivo, sin recompilar.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.SOFIA_SERVER_URL ?? "http://192.168.1.100:3000";

const config: CapacitorConfig = {
  appId: "mx.sofia.mario",
  appName: "Sofía",
  webDir: "android-shell/www",
  // El servidor detecta el modo tablet por este sufijo (oculta herramientas de desarrollo).
  appendUserAgent: "SofiaTablet/1",
  server: {
    url: serverUrl,
    cleartext: true,
    errorPath: "conexion.html",
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: "#0a0a0b",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
  },
};

export default config;
