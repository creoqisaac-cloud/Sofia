/**
 * Túnel HTTPS temporal para probar la skill de Alexa contra Sofía local.
 *
 *   npm run alexa:dev            (Sofía debe estar corriendo en localhost:3000)
 *
 * - Verifica que Sofía responde en localhost:3000.
 * - Exige que la app esté protegida con SOFIA_BASIC_AUTH: el túnel publica TODA la app,
 *   no solo /api/alexa (que se protege con la firma de Amazon). Usa --allow-open para omitirlo
 *   bajo tu responsabilidad.
 * - Usa cloudflared si está instalado (nunca instala nada con sudo).
 * - Imprime el endpoint para la Alexa Developer Console. La URL es temporal y no se guarda.
 */
import { spawn, spawnSync } from "node:child_process";

const PORT = process.env.PORT ?? "3000";
const LOCAL = `http://localhost:${PORT}`;
const allowOpen = process.argv.includes("--allow-open");

async function check() {
  try {
    const home = await fetch(`${LOCAL}/`, { redirect: "manual" });
    const alexa = await fetch(`${LOCAL}/api/alexa`, { method: "POST", body: "{}" });
    return { up: true, protected: home.status === 401, alexaReachable: alexa.status === 400 };
  } catch {
    return { up: false };
  }
}

const st = await check();
if (!st.up) {
  console.error(`✗ Sofía no responde en ${LOCAL}.\n  Arráncala primero en otra terminal:\n    SOFIA_BASIC_AUTH=mario:una-contraseña-larga npm run demo:iphone`);
  process.exit(1);
}
if (!st.alexaReachable) console.warn("⚠ /api/alexa no respondió como se esperaba (debería rechazar un request sin firma con 400).");
if (!st.protected && !allowOpen) {
  console.error(
    "✗ Sofía está SIN contraseña. El túnel haría pública toda la app (clientes, ventas…).\n" +
      "  Reinicia Sofía con:  SOFIA_BASIC_AUTH=mario:una-contraseña-larga npm run demo:iphone\n" +
      "  (/api/alexa queda fuera de la contraseña porque Amazon firma cada request.)\n" +
      "  Si aun así quieres continuar: npm run alexa:dev -- --allow-open",
  );
  process.exit(1);
}

const has = spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).status === 0;
if (!has) {
  console.error(
    "✗ cloudflared no está instalado. Instálalo tú (no se instala automáticamente):\n" +
      "  macOS:   brew install cloudflared\n" +
      "  Windows: winget install --id Cloudflare.cloudflared\n" +
      "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n" +
      "Luego vuelve a correr: npm run alexa:dev",
  );
  process.exit(1);
}

console.log(`Abriendo túnel HTTPS temporal hacia ${LOCAL}…`);
const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", LOCAL], { stdio: ["ignore", "pipe", "pipe"] });
let shown = false;
const onData = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    console.log("\n  ─────────────────────────────────────────────");
    console.log("  Alexa endpoint:");
    console.log(`  ${m[0]}/api/alexa`);
    console.log("  ─────────────────────────────────────────────");
    console.log("  Developer Console → Build → Endpoint → HTTPS → pega la URL →");
    console.log("  certificado: “My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority”.");
    console.log("  La URL cambia cada vez que reinicias el túnel (no se guarda en git). Ctrl+C para cerrar.\n");
  }
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
