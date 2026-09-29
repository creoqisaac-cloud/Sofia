/**
 * Compila la APK localmente (requiere JDK 21 + Android SDK; ANDROID_HOME configurado).
 *   SOFIA_SERVER_URL=https://mi-servidor npm run android:apk
 * Sin Android SDK local, usa GitHub Actions: workflow "Android APK (Sofía tablet)".
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !fs.existsSync("android/local.properties")) {
  console.error("✗ No encuentro el Android SDK (ANDROID_HOME). Instala Android Studio o usa el workflow de GitHub Actions.");
  process.exit(1);
}
run("npx", ["cap", "sync", "android"]);
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(gradlew, ["assembleDebug"], { cwd: "android" });
const apk = path.resolve("android/app/build/outputs/apk/debug/app-debug.apk");
fs.copyFileSync(apk, "Sofia.apk");
console.log(`\n✓ APK: ${apk}\n✓ Copia: ${path.resolve("Sofia.apk")}`);
