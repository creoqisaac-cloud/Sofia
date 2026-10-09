// Más: accesos a lo que no cabe en la barra inferior.
import { h } from "./util.js";
import { state, openReminders } from "./store.js";
import { header, go } from "./ui.js";
import { aiReady } from "./ai.js";
import { connectorReady, lastStatus } from "./connector.js";

export function renderMore(root) {
  const st = lastStatus();
  const item = (path, title, sub) => h("button", { class: "item", onclick: () => go(path) }, h("div", { class: "grow" }, h("strong", {}, title), h("div", { class: "muted small" }, sub)), h("span", { class: "muted" }, "›"));
  root.append(
    header("Más"),
    h("div", { class: "page" },
      h("div", { class: "list" },
        item("/recordatorios", "Recordatorios", `${openReminders().length} abiertos`),
        item("/estilo", "Mi estilo de venta", state.settings.style.profile ? "Sofía ya escribe como tú" : `${state.settings.style.examples.length} mensajes aprendidos · enséñale tus chats`),
        item("/conexiones", "Conexiones", [aiReady() ? "IA ✓" : "IA —", connectorReady() ? "Servidor ✓" : "Servidor —", st?.whatsapp?.ok ? "WhatsApp ✓" : "WhatsApp —", st?.facebook?.ok ? "Facebook ✓" : "Facebook —"].join(" · ")),
        item("/ajustes", "Ajustes", "Perfil, placas, formatos de crédito, respaldo, comentarios"))));
}
