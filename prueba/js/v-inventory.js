// Inventario de autos que Sofía ofrece por WhatsApp (con foto y precio) y el simulador "Probar a Sofía":
// el mismo cerebro (js/vendedor.js) que contesta en WhatsApp, para probarlo o enseñarlo sin conexión.
import { h, toast, uid, fmtWhen, debounce, blobToDataUrl, shrinkImage, confirmBox } from "./util.js";
import { state, save, saveFile, readFile, removeFile } from "./store.js";
import { header, section, empty, btn, go, rerender, route, field, input, textarea, select, chip } from "./ui.js";
import { connectorReady, saveInventory, uploadCarPhoto, trySales } from "./connector.js";
import { decidir, nombreAuto, pesos, VENTAS_BASE, promptIA, aplicarIA } from "./vendedor.js";
import { aiReady, salesReply } from "./ai.js";

const TIPOS = [["nuevo", "Nuevo"], ["seminuevo", "Seminuevo"]];
const TRANSMISIONES = [["", "—"], ["Automática", "Automática"], ["Manual", "Manual"], ["CVT", "CVT"]];
const fotoUrls = new Map(); // id del archivo → URL para mostrarla (se reutiliza entre pantallas)

async function fotoUrl(fileId) {
  if (!fileId) return null;
  if (!fotoUrls.has(fileId)) {
    const f = await readFile(fileId);
    if (!f?.blob) return null;
    fotoUrls.set(fileId, URL.createObjectURL(f.blob));
  }
  return fotoUrls.get(fileId);
}

// ───────── Sincronización con el conector (WhatsApp lo ofrece desde ahí) ─────────

const paraServidor = (a) => ({
  id: a.id, marca: a.marca, modelo: a.modelo, version: a.version, anio: a.anio, precio: a.precio, tipo: a.tipo, km: a.km,
  color: a.color, transmision: a.transmision, descripcion: a.descripcion, palabras: a.palabras, disponible: a.disponible !== false,
  ...(a.fotoId ? { fotoId: a.fotoId } : {}),
});

let enCurso = null;
/** Sube las fotos nuevas y manda el inventario completo. Devuelve false si no hay servidor. */
export async function syncInventory() {
  if (!connectorReady()) return false;
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      for (const a of state.inventory) {
        if (!a.foto) { delete a.fotoId; delete a.fotoSubida; continue; }
        if (a.fotoSubida === a.foto && a.fotoId) continue;
        const f = await readFile(a.foto);
        if (!f?.blob) continue;
        const r = await uploadCarPhoto(await blobToDataUrl(await shrinkImage(f.blob, 1280, 0.85)));
        Object.assign(a, { fotoId: r.fotoId, fotoSubida: a.foto });
      }
      await saveInventory(state.inventory.map(paraServidor));
      state.settings.inventorySync = { at: new Date().toISOString(), ok: true, autos: state.inventory.length };
      return true;
    } catch (e) {
      state.settings.inventorySync = { at: new Date().toISOString(), ok: false, error: e.message };
      throw e;
    } finally {
      enCurso = null;
      save();
    }
  })();
  return enCurso;
}
const repintar = () => { if (route() === "/inventario") rerender(); }; // el renglón "En WhatsApp: …" se actualiza
const syncLuego = debounce(() => syncInventory().then(repintar, repintar), 1500);

const syncLine = () => {
  const s = state.settings.inventorySync;
  if (!connectorReady()) return h("p", { class: "muted small" }, "Sin servidor conectado: Sofía usa este inventario en «Probar a Sofía». Para que lo ofrezca por WhatsApp, conecta tu servidor en Más → Conexiones.");
  if (!s) return h("p", { class: "muted small" }, "Aún no se manda a WhatsApp.");
  return h("p", { class: s.ok ? "ok-text small" : "warn small" }, s.ok ? `En WhatsApp: ${s.autos} auto${s.autos === 1 ? "" : "s"} · actualizado ${fmtWhen(s.at)}` : `No se pudo mandar a WhatsApp: ${s.error}`);
};

// ───────── Lista ─────────

export function renderInventory(root) {
  const autos = state.inventory;
  const list = h("div", { class: "list" });
  root.append(
    header("Inventario", { back: "/whatsapp?tab=auto", actions: [btn("+ Auto", () => go("/inventario/nuevo"), "small primary")] }),
    h("div", { class: "page" },
      section("Autos que Sofía ofrece",
        h("p", { class: "muted small" }, "Sofía los muestra por WhatsApp con foto, precio y mensualidad estimada, y cotiza a crédito. Los que marques como no disponibles no se ofrecen."),
        syncLine(),
        h("div", { class: "row wrap gap-s" },
          btn("+ Agregar auto", () => go("/inventario/nuevo"), "primary"),
          btn("Probar a Sofía", () => go("/probar")),
          connectorReady() ? btn("Mandar a WhatsApp ahora", async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            try { await syncInventory(); toast("Inventario actualizado en WhatsApp"); rerender(); } catch (err) { toast(err.message, 6000); b.disabled = false; }
          }, "ghost") : null)),
      autos.length ? list : empty("Aún no hay autos. Agrega los que tienes a la venta: Sofía los ofrecerá con foto y precio.", btn("+ Agregar auto", () => go("/inventario/nuevo"), "primary"))));
  for (const a of autos) {
    const img = h("div", { class: "thumb" });
    fotoUrl(a.foto).then((u) => { if (u) img.replaceChildren(h("img", { src: u, alt: "" })); });
    list.append(h("button", { class: `item ${a.disponible === false ? "muted" : ""}`, onclick: () => go(`/inventario/${a.id}`) },
      img,
      h("div", { class: "grow" },
        h("strong", {}, nombreAuto(a) || "Auto sin nombre"),
        h("div", { class: "muted small" }, [a.precio ? pesos(a.precio) : "Sin precio", a.tipo === "seminuevo" ? `Seminuevo${a.km ? ` · ${Number(a.km).toLocaleString("es-MX")} km` : ""}` : "Nuevo"].join(" · "))),
      a.disponible === false ? chip("No disponible", "off") : null));
  }
}

// ───────── Alta / edición ─────────

export function renderCarForm(root, id) {
  const editando = id && id !== "nuevo" ? state.inventory.find((a) => a.id === id) : null;
  if (id !== "nuevo" && !editando) { go("/inventario"); return; }
  const a = editando ?? { tipo: "nuevo", disponible: true };
  const marca = input({ value: a.marca ?? "", placeholder: "Honda", autocomplete: "off" });
  const modelo = input({ value: a.modelo ?? "", placeholder: "CR-V", autocomplete: "off" });
  const version = input({ value: a.version ?? "", placeholder: "Touring", autocomplete: "off" });
  const anio = input({ value: a.anio ?? "", inputmode: "numeric", placeholder: String(new Date().getFullYear()) });
  const precio = input({ value: a.precio ?? "", inputmode: "numeric", placeholder: "689900" });
  const tipo = select(TIPOS, a.tipo ?? "nuevo");
  const km = input({ value: a.km ?? "", inputmode: "numeric", placeholder: "25000" });
  const color = input({ value: a.color ?? "", placeholder: "Blanco platino" });
  const transmision = select(TRANSMISIONES, a.transmision ?? "");
  const descripcion = textarea({ rows: 3, placeholder: "Lo que lo hace atractivo: único dueño, servicios de agencia, garantía…" }, a.descripcion ?? "");
  const palabras = input({ value: a.palabras ?? "", placeholder: "Cómo le dicen tus clientes: crv, cr v, camioneta honda" });
  const disponible = h("input", { type: "checkbox", checked: a.disponible !== false });
  const kmField = field("Kilometraje", km);
  const verKm = () => { kmField.hidden = tipo.value !== "seminuevo"; };
  tipo.onchange = verKm;
  verKm();

  let foto = a.foto ?? null; // id del archivo local
  const vista = h("div", { class: "car-photo" });
  const pintar = async () => {
    const u = await fotoUrl(foto);
    vista.replaceChildren(u ? h("img", { src: u, alt: "Foto del auto" }) : h("p", { class: "muted small" }, "Sin foto. Con foto se vende mucho mejor."));
  };
  pintar();
  const pick = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    foto = await saveFile(await shrinkImage(f, 1600, 0.85), "auto.jpg");
    pintar();
  } });
  const num = (el) => { const n = Number(String(el.value).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : ""; };

  const guardar = async () => {
    if (!marca.value.trim() && !modelo.value.trim()) { toast("Escribe al menos la marca o el modelo."); return; }
    const antes = a.foto;
    const datos = {
      marca: marca.value.trim(), modelo: modelo.value.trim(), version: version.value.trim(), anio: num(anio), precio: num(precio),
      tipo: tipo.value, km: tipo.value === "seminuevo" ? num(km) : "", color: color.value.trim(), transmision: transmision.value,
      descripcion: descripcion.value.trim(), palabras: palabras.value.trim(), disponible: disponible.checked, foto,
    };
    if (editando) Object.assign(editando, datos);
    else state.inventory.unshift({ id: uid(), creado: new Date().toISOString(), ...datos });
    if (antes && antes !== foto) await removeFile(antes).catch(() => {});
    save();
    syncLuego();
    toast(editando ? "Auto actualizado" : "Auto agregado");
    go("/inventario");
  };

  root.append(
    header(editando ? "Editar auto" : "Nuevo auto", { back: "/inventario" }),
    h("div", { class: "page" },
      section("Foto", vista, pick, h("div", { class: "row wrap gap-s" },
        btn(foto ? "Cambiar foto" : "Agregar foto", () => pick.click(), "small"),
        foto ? btn("Quitar foto", () => { foto = null; pintar(); }, "small ghost") : null)),
      section("Datos",
        h("div", { class: "grid2" }, field("Marca", marca), field("Modelo", modelo)),
        h("div", { class: "grid2" }, field("Versión", version), field("Año", anio)),
        h("div", { class: "grid2" }, field("Precio de contado", precio, "Sin precio, Sofía dice que el asesor lo confirma."), field("Tipo", tipo)),
        h("div", { class: "grid2" }, kmField, field("Transmisión", transmision)),
        field("Color", color),
        field("Descripción (opcional)", descripcion),
        field("Apodos (opcional)", palabras, "Separados por coma. Sofía reconoce el modelo aunque lo escriban sin guion o con acentos."),
        h("label", { class: "row gap-s" }, disponible, h("span", {}, "Disponible (Sofía lo ofrece)"))),
      h("div", { class: "row wrap gap-s" },
        btn("Guardar", guardar, "primary"),
        editando ? btn("Borrar", async () => {
          if (!(await confirmBox("¿Borrar este auto?", `${nombreAuto(editando)} dejará de ofrecerse.`, "Borrar"))) return;
          state.inventory = state.inventory.filter((x) => x !== editando);
          if (editando.foto) await removeFile(editando.foto).catch(() => {});
          save();
          syncLuego();
          go("/inventario");
        }, "ghost") : null)));
}

// ───────── Probar a Sofía (simulador) ─────────

let sim = { conv: {}, lead: {}, mensajes: [] };

/** Lo que Sofía usa sin servidor: tu nombre y agencia de Ajustes, y la configuración de ventas por defecto. */
const cfgLocal = () => ({ asesor: state.settings.advisorName, agencia: state.settings.agency, horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, reglas: [], ventas: { ...VENTAS_BASE } });

/** *negritas* y _cursivas_ de WhatsApp, sin HTML (todo es texto). */
export function waFormat(texto) {
  return String(texto ?? "").split(/(\*[^*\n]+\*|_[^_\n]+_)/g).filter(Boolean).map((p) => {
    if (/^\*[^*\n]+\*$/.test(p)) return h("strong", {}, p.slice(1, -1));
    if (/^_[^_\n]+_$/.test(p)) return h("em", {}, p.slice(1, -1));
    return p;
  });
}

export function renderSimulator(root) {
  const chat = h("div", { class: "chat sim" });
  const tarjeta = h("div");
  const caja = input({ placeholder: "Escribe como cliente…", autocomplete: "off", "aria-label": "Mensaje del cliente" });
  // Con servidor: se le pregunta a él (su inventario, su configuración y su IA), igual que un mensaje real.
  // Sin servidor: el mismo cerebro aquí, con tu inventario local y la IA de este teléfono si la conectaste.
  const remoto = connectorReady();
  const cfg = cfgLocal();
  let inventario = [];
  const listo = remoto ? Promise.resolve() : (async () => {
    inventario = await Promise.all(state.inventory.map(async (a) => ({ ...a, foto: await fotoUrl(a.foto) })));
  })();

  const pintar = () => {
    chat.replaceChildren(...(sim.mensajes.length ? sim.mensajes : [{ dir: "in", texto: "Escríbele a Sofía como si fueras un cliente: «Hola», «¿qué autos tienen?», «cotízame la CR-V a crédito»…", nota: true }])
      .map((m) => h("div", { class: `bubble ${m.dir === "in" ? "out" : "in"} ${m.nota ? "muted" : ""}` },
        m.ia ? h("div", { class: "muted small" }, "✨ Contestó con IA") : null,
        m.foto ? h("img", { src: m.foto, alt: "Foto del auto", class: "chat-img" }) : null,
        h("div", { class: "pre" }, ...waFormat(m.texto)))));
    chat.scrollTop = chat.scrollHeight;
    const l = sim.lead;
    const filas = [
      l.interes && ["Interés", `${l.interes}${l.precio ? ` (${pesos(l.precio)})` : ""}`],
      l.formaPago && ["Pago", l.formaPago === "credito" ? `Crédito${l.enganche ? ` · enganche ${pesos(l.enganche)}` : ""}${l.mensualidad ? ` · ~${pesos(l.mensualidad)} a ${l.plazo} meses` : ""}` : "Contado"],
      l.cita && ["Cita", l.cita],
      l.quiereAsesor && ["Asesor", "Pidió hablar contigo"],
    ].filter(Boolean);
    tarjeta.replaceChildren(filas.length
      ? h("div", { class: `item col ${l.cita || l.quiereAsesor ? "late" : ""}` },
        h("strong", {}, `${l.cita || l.quiereAsesor ? "🔥 " : ""}Prospecto de prueba`),
        ...filas.map(([k, v]) => h("div", { class: "small" }, h("span", { class: "muted" }, `${k}: `), v)))
      : h("p", { class: "muted small" }, "Aquí verás lo que Sofía anota del cliente (auto, crédito, cita…), igual que en Prospectos."));
  };

  const enviar = async (texto) => {
    const t = String(texto ?? caja.value).trim();
    if (!t) return;
    caja.value = "";
    await listo;
    sim.mensajes.push({ dir: "in", texto: t });
    const antes = sim.conv;
    const primero = !Object.keys(antes).length;
    const historial = sim.mensajes.filter((m) => !m.nota).map((m) => ({ dir: m.dir, text: m.texto }));
    let r;
    if (remoto) {
      try { r = await trySales({ conv: antes, historial, texto: t, nombre: "Cliente", primero }); } catch (err) { sim.mensajes.pop(); toast(err.message, 6000); pintar(); return; }
      if (r.errorIA) toast(`IA: ${r.errorIA} (va la respuesta del menú)`, 5000);
    } else {
      r = decidir({ cfg, inventario, conv: antes, msg: { texto: t, nombre: "Cliente", primero, enHorario: true }, ahora: new Date() });
      if (aiReady() && !["freno", "con-asesor", "vacio", "borrar-datos", "sin-promociones"].includes(r.motivo)) { // con IA, ella lleva la plática
        try { r = aplicarIA(r, await salesReply(promptIA({ cfg, inventario, historial })), { inventario, antes, ahora: new Date() }); } catch (err) { toast(`IA: ${err.message} (va la respuesta del menú)`, 5000); }
      }
    }
    sim.conv = r.conv;
    Object.assign(sim.lead, r.lead);
    for (const m of r.respuestas) sim.mensajes.push({ dir: "out", texto: m.texto, foto: m.foto, ia: r.motivo === "ia" });
    if (!r.respuestas.length) sim.mensajes.push({ dir: "out", texto: r.motivo === "con-asesor" ? "(Sofía se queda callada: ya lo atiende el asesor. Escribe «menú» para volver.)" : "(Sofía no contesta este mensaje.)", nota: true });
    pintar();
  };
  caja.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } };

  const rapido = ["Hola", "¿Qué autos tienen?", "Quiero un crédito", "Agendar prueba de manejo", "Hablar con un asesor", "menú"];
  root.append(
    header("Probar a Sofía", { back: "/whatsapp?tab=auto" }),
    h("div", { class: "page" },
      section("Así contesta en WhatsApp",
        h("p", { class: "muted small" }, remoto
          ? "Contesta tu servidor, con el inventario y la configuración que ya tiene (y su IA, si la activaste). Nada se envía a nadie ni se guarda."
          : `Usa tu inventario (${state.inventory.filter((a) => a.disponible !== false).length} disponibles) y la configuración por defecto${aiReady() ? ", con la IA de este teléfono para lo que el menú no entiende" : ""}. Nada se envía a nadie.`),
        chat,
        h("div", { class: "row wrap gap-s" }, rapido.map((t) => btn(t, () => enviar(t), "small ghost"))),
        h("div", { class: "row gap-s" }, caja, btn("Enviar", () => enviar(), "primary")),
        h("div", { class: "row wrap gap-s" },
          btn("Reiniciar", () => { sim = { conv: {}, lead: {}, mensajes: [] }; pintar(); }, "small ghost"),
          btn("Inventario", () => go("/inventario"), "small ghost"))),
      section("Lo que ves en Prospectos", tarjeta)));
  pintar();
}
