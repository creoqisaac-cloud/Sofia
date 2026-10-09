// Redes: publicar YA o PROGRAMAR (el servidor publica solo a la hora, aunque la app esté cerrada) en la
// página de Facebook e Instagram, con textos de IA opcionales, y preparar anuncios para el Administrador de Meta.
import { h, toast, fmtWhen, blobToDataUrl, shrinkImage, toLocalInput } from "./util.js";
import { state, save } from "./store.js";
import { header, section, btn, rerender, field, input, textarea, select, go, empty } from "./ui.js";
import { aiReady, socialCopy } from "./ai.js";
import { fbReady, igReady, connectorReady, schedulePost, listQueue, cancelPost, refreshStatus } from "./connector.js";
import { deliverFiles, openExternal } from "./native.js";

const GOALS = [["vender", "Vender este auto"], ["prueba", "Agendar pruebas de manejo"], ["credito", "Promover crédito / financiamiento"], ["evento", "Evento o promoción del mes"], ["entrega", "Celebrar una entrega (con permiso del cliente)"]];
let photo = null; // foto elegida (se conserva al redibujar)
let ratio = null; // ancho/alto de la foto (Instagram acepta de 4:5 a 1.91:1)

export function renderSocial(root) {
  const vehicle = input({ placeholder: "Ej. CR-V Touring 2026, blanca" });
  const offer = textarea({ rows: 2, placeholder: "Lo que SÍ puedes anunciar: precio, bono, tasa, enganche… (la IA no inventa nada)" });
  const goal = select(GOALS, "vender");
  const text = textarea({ rows: 7, placeholder: "Texto de la publicación" });
  const preview = h("div");
  const drawPhoto = () => preview.replaceChildren(photo ? h("img", { src: URL.createObjectURL(photo), alt: "Foto de la publicación", class: "chat-img" }) : h("p", { class: "muted small" }, "Sin foto (las publicaciones con foto funcionan mucho mejor)."));
  drawPhoto();
  const pick = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    photo = await shrinkImage(f, 1440, 0.9); // JPG (Instagram solo acepta JPG)
    try { const bmp = await createImageBitmap(photo); ratio = bmp.width / bmp.height; } catch { ratio = null; }
    rerender();
  } });
  const when = input({ type: "datetime-local", value: toLocalInput(new Date(Date.now() + 3600000)) });
  const igOk = igReady() && photo && (ratio === null || (ratio >= 0.8 && ratio <= 1.91));
  const chFb = h("input", { type: "checkbox", checked: fbReady(), disabled: !fbReady() });
  const chIg = h("input", { type: "checkbox", checked: Boolean(igOk), disabled: !igOk });
  const queue = h("div", { class: "list" }, h("p", { class: "muted" }, "Cargando…"));
  const send = async (b, cuando) => {
    const canales = [chFb.checked && "facebook", chIg.checked && "instagram"].filter(Boolean);
    if (!canales.length) { toast("Elige Facebook y/o Instagram."); return; }
    if (!text.value.trim() && !photo) { toast("Escribe el texto o agrega una foto."); return; }
    const label = b.textContent;
    b.disabled = true;
    b.textContent = cuando ? "Programando…" : "Publicando…";
    try {
      const item = await schedulePost({ texto: text.value.trim(), imagen: photo ? await blobToDataUrl(photo) : undefined, cuando: cuando ?? new Date().toISOString(), canales });
      for (const [canal, r] of Object.entries(item.resultados ?? {})) if (r.ok && r.url) state.posts.unshift({ id: r.id, url: r.url, at: r.at, message: text.value.trim().slice(0, 300), vehicle: vehicle.value, canal });
      save();
      const fallas = Object.entries(item.resultados ?? {}).filter(([, r]) => !r.ok);
      toast(cuando ? `Programada para ${fmtWhen(item.cuando)}: se publica sola aunque Sofía esté cerrada.` : fallas.length ? `Publicada con errores: ${fallas.map(([c, r]) => `${c}: ${r.error}`).join(" · ")}` : "¡Publicado en tu página!", 7000);
      photo = null;
      ratio = null;
      refreshStatus().catch(() => {});
      rerender();
    } catch (err) { toast(err.message, 7000); b.disabled = false; b.textContent = label; }
  };
  const ad = h("div");

  const aiFill = (kind) => async (e) => {
    const b = e.currentTarget;
    const old = b.textContent;
    b.disabled = true;
    b.textContent = "Escribiendo…";
    try {
      const r = await socialCopy({ kind, vehicle: vehicle.value, offer: offer.value, goal: GOALS.find((g) => g[0] === goal.value)?.[1] });
      if (kind === "post") text.value = `${r.texto}${r.hashtags?.length ? `\n\n${r.hashtags.map((x) => (x.startsWith("#") ? x : `#${x}`)).join(" ")}` : ""}`;
      else ad.replaceChildren(adView(r));
    } catch (err) { toast(err.message, 6000); }
    finally { b.disabled = false; b.textContent = old; }
  };

  root.append(
    header("Redes"),
    h("div", { class: "page" },
      !fbReady() ? section("Conecta tu página de Facebook",
        h("p", { class: "muted small" }, connectorReady() ? "El servidor está conectado, pero falta configurar la página de Facebook en él (ver la guía en Conexiones)." : "Para publicar directo desde Sofía conecta tu servidor y tu página. Mientras tanto puedes escribir con IA y compartir a Facebook/Instagram con un toque."),
        btn("Ir a Conexiones", () => go("/conexiones"), "small")) : null,

      section("Nueva publicación",
        h("div", { class: "grid2" }, field("Auto", vehicle), field("Objetivo", goal)),
        field("Oferta / datos confirmados", offer),
        pick,
        h("div", { class: "row wrap gap-s" }, btn(photo ? "Cambiar foto" : "Agregar foto", () => pick.click(), "small"), photo ? btn("Quitar foto", () => { photo = null; drawPhoto(); }, "small ghost") : null),
        preview,
        field("Texto", text),
        h("div", { class: "row wrap gap-s" },
          aiReady() ? btn("✨ Escribir con IA", aiFill("post"), "ghost") : btn("Conectar IA para escribir", () => go("/conexiones"), "ghost small"),
          fbReady() ? btn("Publicar ahora", (e) => send(e.currentTarget, null), "primary") : null,
          btn("Compartir a mano (estados, grupos…)", async () => {
            if (photo) await deliverFiles([{ blob: photo, name: "publicacion.jpg" }], { title: "Publicación", text: text.value });
            else if (navigator.share) await navigator.share({ text: text.value }).catch(() => {});
            else { await navigator.clipboard?.writeText(text.value); toast("Texto copiado"); }
          }, "ghost"))),

      fbReady() ? section("Dónde y cuándo",
        h("div", { class: "row wrap gap-s" },
          h("label", { class: "row gap-s" }, chFb, h("span", {}, "Facebook")),
          h("label", { class: "row gap-s" }, chIg, h("span", {}, igReady() ? (photo ? (igOk ? "Instagram" : "Instagram (la foto debe ser entre 4:5 y 1.91:1)") : "Instagram (necesita foto)") : "Instagram (sin conectar)"))),
        h("div", { class: "row gap-s" }, when, btn("Programar", (e) => {
          const t = new Date(when.value);
          if (Number.isNaN(t.getTime()) || t < new Date()) { toast("Elige una fecha y hora futura."); return; }
          send(e.currentTarget, t.toISOString());
        })),
        h("p", { class: "muted small" }, "Lo programado lo publica tu servidor a la hora indicada, aunque el teléfono esté apagado.")) : null,

      fbReady() ? section("Programadas", queue) : null,

      section("Anuncio pagado (Facebook / Instagram)",
        h("p", { class: "muted small" }, "La IA arma el anuncio (título, texto, descripción y botón) en tu estilo. Lo pegas en el Administrador de anuncios o promocionas una publicación ya hecha. Crear campañas automáticamente requiere el permiso «ads_management» aprobado por Meta (siguiente fase)."),
        h("div", { class: "row wrap gap-s" },
          aiReady() ? btn("✨ Crear anuncio con IA", aiFill("anuncio"), "primary") : null,
          btn("Abrir Administrador de anuncios", () => openExternal("https://adsmanager.facebook.com/adsmanager/manage/campaigns"), "ghost")),
        ad),

      section("Publicado desde Sofía",
        state.posts.length ? h("div", { class: "list" }, state.posts.slice(0, 20).map((p) => h("div", { class: "item col" },
          h("div", { class: "row between" }, h("strong", {}, p.vehicle || "Publicación"), h("span", { class: "muted small" }, fmtWhen(p.at))),
          h("p", { class: "preview" }, p.message),
          h("div", { class: "row wrap gap-s" },
            btn("Ver / promocionar", () => openExternal(p.url), "small"))))) : empty("Aún no publicas desde Sofía."))));
  if (fbReady()) drawQueue(queue);
}

const ESTADOS = { pendiente: "Programada", publicando: "Publicando…", publicado: "Publicada", error: "Con error" };

async function drawQueue(box) {
  try {
    const cola = (await listQueue()).slice(-30).reverse();
    if (!cola.length) { box.replaceChildren(empty("Nada programado.")); return; }
    box.replaceChildren(...cola.map((x) => h("div", { class: `item col ${x.estado === "error" ? "late" : ""}` },
      h("div", { class: "row between" }, h("strong", { class: "small" }, `${ESTADOS[x.estado] ?? x.estado} · ${fmtWhen(x.cuando)}`), h("span", { class: "muted small" }, x.canales.join(" + "))),
      x.texto ? h("p", { class: "preview" }, x.texto.slice(0, 160)) : null,
      ...Object.entries(x.resultados ?? {}).map(([canal, r]) => h("p", { class: r.ok ? "ok-text small" : "warn small" }, `${canal}: ${r.ok ? "publicada" : r.error}`)),
      h("div", { class: "row wrap gap-s" },
        ...Object.values(x.resultados ?? {}).filter((r) => r.ok && r.url).map((r) => btn("Ver", () => openExternal(r.url), "small ghost")),
        x.estado === "pendiente" ? btn("Cancelar", async () => { try { await cancelPost(x.id); toast("Cancelada"); drawQueue(box); } catch (e) { toast(e.message, 5000); } }, "small ghost") : null))));
  } catch (e) { box.replaceChildren(h("p", { class: "warn" }, e.message)); }
}

function adView(r) {
  const row = (label, value) => h("div", { class: "copy-row" },
    h("div", { class: "grow" }, h("span", { class: "muted small" }, label), h("div", { class: "pre" }, value)),
    btn("Copiar", async () => { await navigator.clipboard?.writeText(value); toast(`${label} copiado`); }, "small ghost"));
  return h("div", { class: "reading" },
    row("Título", r.titulo),
    row("Texto principal", r.texto),
    row("Descripción", r.descripcion),
    row("Botón", r.llamado_accion),
    r.hashtags?.length ? row("Hashtags", r.hashtags.join(" ")) : null);
}
