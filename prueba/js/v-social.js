// Redes: publicar en la página de Facebook (vía conector) con textos de IA en el estilo del asesor,
// y preparar anuncios (copy listo para el Administrador de anuncios de Meta).
import { h, toast, fmtWhen, blobToDataUrl, shrinkImage } from "./util.js";
import { state, save } from "./store.js";
import { header, section, btn, rerender, field, input, textarea, select, go, empty } from "./ui.js";
import { aiReady, socialCopy } from "./ai.js";
import { fbReady, publishPost, connectorReady } from "./connector.js";
import { deliverFiles, openExternal } from "./native.js";

const GOALS = [["vender", "Vender este auto"], ["prueba", "Agendar pruebas de manejo"], ["credito", "Promover crédito / financiamiento"], ["evento", "Evento o promoción del mes"], ["entrega", "Celebrar una entrega (con permiso del cliente)"]];
let photo = null; // foto elegida (se conserva al redibujar)

export function renderSocial(root) {
  const vehicle = input({ placeholder: "Ej. CR-V Touring 2026, blanca" });
  const offer = textarea({ rows: 2, placeholder: "Lo que SÍ puedes anunciar: precio, bono, tasa, enganche… (la IA no inventa nada)" });
  const goal = select(GOALS, "vender");
  const text = textarea({ rows: 7, placeholder: "Texto de la publicación" });
  const preview = h("div");
  const drawPhoto = () => preview.replaceChildren(photo ? h("img", { src: URL.createObjectURL(photo), alt: "Foto de la publicación", class: "chat-img" }) : h("p", { class: "muted small" }, "Sin foto (las publicaciones con foto funcionan mucho mejor)."));
  drawPhoto();
  const pick = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => { const f = e.target.files?.[0]; if (f) { photo = await shrinkImage(f, 2048, 0.9); drawPhoto(); } } });
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
          fbReady() ? btn("Publicar en Facebook", async (e) => {
            if (!text.value.trim() && !photo) { toast("Escribe el texto o agrega una foto."); return; }
            const b = e.currentTarget;
            b.disabled = true;
            b.textContent = "Publicando…";
            try {
              const r = await publishPost({ message: text.value.trim(), image: photo ? await blobToDataUrl(photo) : undefined });
              state.posts.unshift({ id: r.id, url: r.url, at: new Date().toISOString(), message: text.value.trim().slice(0, 300), vehicle: vehicle.value });
              save();
              toast("¡Publicado en tu página!");
              photo = null;
              rerender();
            } catch (err) { toast(err.message, 7000); b.disabled = false; b.textContent = "Publicar en Facebook"; }
          }, "primary") : null,
          btn("Compartir (Instagram, Facebook, estados…)", async () => {
            if (photo) await deliverFiles([{ blob: photo, name: "publicacion.jpg" }], { title: "Publicación", text: text.value });
            else if (navigator.share) await navigator.share({ text: text.value }).catch(() => {});
            else { await navigator.clipboard?.writeText(text.value); toast("Texto copiado"); }
          }, "ghost"))),

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
