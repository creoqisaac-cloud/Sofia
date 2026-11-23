import { existsSync, appendFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import "../../prueba/servidor/servidor.mjs";

const timer = setInterval(() => {
  if (existsSync(process.env.SOFIA_STOP_FILE)) {
    clearInterval(timer);
    process.emit("SIGTERM");
  }
}, 300);
timer.unref();

// Se actualiza sola (solo en la PC de Mario): cada 10 minutos revisa si en GitHub hay una versión nueva de su
// misma rama. Solo avanza si aquí no hay cambios sin guardar y el avance es directo (--ff-only); entonces cierra
// y Sofia.ps1 la vuelve a abrir con el código nuevo, conservando el vínculo de WhatsApp y el túnel.
const repo = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) => new Promise((ok) => execFile("git", ["-C", repo, ...args], { timeout: 60_000, windowsHide: true }, (e, out) => ok(e ? null : String(out).trim())));
async function actualizar() {
  const rama = await git("rev-parse", "--abbrev-ref", "HEAD");
  if (!rama || rama === "HEAD") return;
  if ((await git("status", "--porcelain", "--untracked-files=no")) !== "") return; // cambios locales: no tocar
  if ((await git("fetch", "--quiet", "origin", rama)) === null) return;
  const antes = await git("rev-parse", "HEAD");
  if (!antes || antes === (await git("rev-parse", "FETCH_HEAD"))) return;
  if ((await git("merge", "--ff-only", "--quiet", "FETCH_HEAD")) === null) return;
  const despues = await git("rev-parse", "HEAD");
  if (!despues || despues === antes) return;
  try { appendFileSync(join(process.env.SOFIA_DATA_DIR ?? ".", "..", "actualizaciones.log"), `${new Date().toISOString()} ${antes.slice(0, 7)} -> ${despues.slice(0, 7)}\n`); } catch {}
  console.log(`Sofía se actualizó (${antes.slice(0, 7)} → ${despues.slice(0, 7)}); reiniciando…`);
  process.emit("SIGTERM");
}
if (/SofiaWhatsAppMario/i.test(process.env.SOFIA_DATA_DIR ?? "") && process.env.SOFIA_AUTO_ACTUALIZAR !== "0") {
  setInterval(() => actualizar().catch(() => {}), 10 * 60_000).unref();
}
