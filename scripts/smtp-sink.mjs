/**
 * CI: servidor SMTP local que GUARDA cada correo recibido (no reenvía nada). Sirve para comprobar
 * que el correo de placas sale de Sofía con su adjunto. Credenciales sintéticas, solo para CI.
 *
 *   node scripts/smtp-sink.mjs <carpeta> <puerto>
 */
import fs from "node:fs";
import path from "node:path";
import { SMTPServer } from "smtp-server";

const [dir = "demo/smtp", port = "2525"] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
let n = 0;
const server = new SMTPServer({
  secure: false,
  disabledCommands: ["STARTTLS"],
  allowInsecureAuth: true,
  authMethods: ["PLAIN", "LOGIN"],
  onAuth(auth, _s, cb) {
    if (auth.username === "sofia.ci@example.com" && auth.password === "ci-sintetico") cb(null, { user: auth.username });
    else cb(new Error("535 credenciales inválidas"));
  },
  onData(stream, _s, cb) {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => {
      fs.writeFileSync(path.join(dir, `${String(++n).padStart(3, "0")}.eml`), Buffer.concat(chunks));
      console.log(`correo recibido #${n}`);
      cb();
    });
  },
  logger: false,
});
server.listen(Number(port), "127.0.0.1", () => console.log(`SMTP de prueba en 127.0.0.1:${port}`));
