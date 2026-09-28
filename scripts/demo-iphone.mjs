/**
 * Demo en iPhone por la misma Wi-Fi (sin infraestructura en la nube).
 *
 *   npm run demo:iphone            → build (si hace falta) + servidor en 0.0.0.0:3000
 *   npm run demo:iphone -- --https → servidor HTTPS de desarrollo (certificado local)
 *
 * La voz del navegador (SpeechRecognition) puede requerir HTTPS en Safari. Sin HTTPS,
 * Mario usa el micrófono del teclado del iPhone en el campo de Sofía: funciona igual.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const args = process.argv.slice(2);
const https = args.includes("--https");
const port = process.env.PORT ?? "3000";
const bin = "./node_modules/.bin/next";

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

const proto = https ? "https" : "http";
const banner = () => {
  console.log("\n  SOFÍA — demo iPhone (datos DEMO, sin API de IA)\n");
  console.log(`  Local:    ${proto}://localhost:${port}`);
  for (const ip of ips) console.log(`  Network:  ${proto}://${ip}:${port}   ← ábrelo en Safari del iPhone (misma Wi-Fi)`);
  if (!ips.length) console.log("  Network:  (no se detectó IP de red; conecta la computadora a la Wi-Fi)");
  console.log("\n  Tip: en Safari → Compartir → “Agregar a inicio” para abrirla como app.");
  if (!https) console.log("  Voz: si el micrófono de Sofía no está disponible sin HTTPS, usa el 🎤 del teclado.\n");
};

const env = { ...process.env, SOFIA_LLM_PROVIDER: process.env.SOFIA_LLM_PROVIDER ?? "demo" };
let child;
if (https) {
  banner();
  child = spawn(bin, ["dev", "--experimental-https", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", env });
} else {
  if (!fs.existsSync(".next/BUILD_ID")) {
    console.log("Compilando (solo la primera vez)…");
    const r = spawnSync(bin, ["build"], { stdio: "inherit", env });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  banner();
  child = spawn(bin, ["start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", env });
}
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
