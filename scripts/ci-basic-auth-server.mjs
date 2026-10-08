/**
 * Servidor HTTP Basic sintético para la prueba real de conexión Android.
 * Credenciales exclusivamente de CI. Nunca escucha en el despliegue Render.
 */
import http from "node:http";

const port = Number(process.argv[2] ?? 3333);
const user = "sofia-ci";
const pass = "test-android-only";
const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.headers.authorization !== expected) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Sofia", charset="UTF-8"' });
    res.end("Autenticacion requerida");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><h1>SOFIA BASIC OK</h1><p>Autenticacion Android comprobada</p></body></html>");
});
server.listen(port, "0.0.0.0", () => console.log("CI basic server ready port " + port));
