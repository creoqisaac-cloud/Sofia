import { existsSync } from "node:fs";
import "../../prueba/servidor/servidor.mjs";

const timer = setInterval(() => {
  if (existsSync(process.env.SOFIA_STOP_FILE)) {
    clearInterval(timer);
    process.emit("SIGTERM");
  }
}, 300);
timer.unref();
