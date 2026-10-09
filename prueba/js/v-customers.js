// Clientes: lista, alta/edición y ficha con seguimiento, bitácora y accesos a crédito/placas/WhatsApp.
import { h, fmtWhen, toast, confirmBox } from "./util.js";
import { state, customer, addCustomer, updateCustomer, deleteCustomer, activityOf, log, save, STAGES, plateLabel } from "./store.js";
import { header, section, empty, btn, go, rerender, query, field, input, textarea, select, stageChip, stageSelect, followUpPicker, sendWhatsApp, call, chip } from "./ui.js";
import { fillTemplate, suggestTemplateId, template } from "./rules.js";
import { missingFields } from "./credit.js";

export function renderCustomers(root) {
  const f = query().get("f") ?? "";
  const qInput = input({ type: "search", placeholder: "Buscar por nombre, teléfono o auto", value: (() => { try { return sessionStorage.getItem("q") ?? ""; } catch { return ""; } })(), "aria-label": "Buscar" });
  const list = h("div", { class: "list" });
  const filters = [["", "Todos"], ["hoy", "Seguimiento hoy"], ["placas", "Placas"], ["credito", "Crédito"], ...STAGES.filter((s) => !["credito"].includes(s[0]))];
  const draw = () => {
    const q = qInput.value.trim().toLowerCase();
    try { sessionStorage.setItem("q", qInput.value); } catch { /* sin almacenamiento */ }
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const items = state.customers.filter((c) => {
      if (q && ![c.name, c.phone, c.vehicle, c.email].join(" ").toLowerCase().includes(q)) return false;
      if (f === "hoy") return c.nextFollowUp && new Date(c.nextFollowUp) <= end;
      if (f === "placas") return Boolean(c.plates);
      if (f === "credito") return c.stage === "credito" || Boolean(c.credit);
      if (f) return c.stage === f;
      return true;
    });
    list.replaceChildren(...(items.length ? items.map(row) : [empty(state.customers.length ? "Nadie coincide con la búsqueda." : "Aún no hay clientes. Agrega el primero.", btn("+ Agregar cliente", () => go("/cliente/nuevo"), "primary"))]));
  };
  qInput.addEventListener("input", draw);
  root.append(
    header("Clientes", { actions: [btn("+ Nuevo", () => go("/cliente/nuevo"), "primary small")] }),
    h("div", { class: "page" },
      qInput,
      h("div", { class: "chips-scroll" }, filters.map(([id, label]) => h("button", { class: `chip-btn ${f === id ? "on" : ""}`, onclick: () => go(id ? `/clientes?f=${id}` : "/clientes") }, label))),
      list));
  draw();
}

function row(c) {
  const due = c.nextFollowUp && new Date(c.nextFollowUp) <= new Date();
  return h("button", { class: `item ${due ? "late" : ""}`, onclick: () => go(`/cliente/${c.id}`) },
    h("div", { class: "grow" },
      h("strong", {}, c.name || "(sin nombre)"),
      h("div", { class: "muted" }, [c.vehicle, c.phone].filter(Boolean).join(" · ") || "—"),
      c.nextFollowUp ? h("div", { class: `small ${due ? "warn" : "muted"}` }, `Seguimiento ${fmtWhen(c.nextFollowUp)}`) : null),
    stageChip(c.stage));
}

// ───────── Alta / edición ─────────

export function renderCustomerForm(root, id) {
  const c = id ? customer(id) : null;
  const next = query().get("siguiente");
  const v = { name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", vehicle: c?.vehicle ?? "", source: c?.source ?? "", stage: c?.stage ?? (next === "credito" ? "credito" : "nuevo"), notes: c?.notes ?? "" };
  const name = input({ value: v.name, required: true, autocomplete: "off", placeholder: "Nombre y apellidos" });
  const phone = input({ value: v.phone, type: "tel", inputmode: "tel", placeholder: "81 1234 5678" });
  const email = input({ value: v.email, type: "email", inputmode: "email", placeholder: "correo@ejemplo.com" });
  const vehicle = input({ value: v.vehicle, placeholder: "Ej. CR-V Touring 2026" });
  const source = select([["", "—"], ["piso", "Piso / agencia"], ["whatsapp", "WhatsApp"], ["telefono", "Teléfono"], ["redes", "Redes sociales"], ["referido", "Referido"], ["web", "Página web"], ["otro", "Otro"]], v.source);
  const stage = select(STAGES, v.stage);
  const notes = textarea({ rows: 3, placeholder: "Lo que quiere, presupuesto, cómo pagaría, etc." }, v.notes);
  const submit = () => {
    const data = { name: name.value.trim(), phone: phone.value.trim(), email: email.value.trim(), vehicle: vehicle.value.trim(), source: source.value, stage: stage.value, notes: notes.value.trim() };
    if (!data.name) { toast("Escribe el nombre del cliente."); name.focus(); return; }
    if (c) { updateCustomer(c.id, data); toast("Guardado"); go(`/cliente/${c.id}`); return; }
    const created = addCustomer(data);
    toast("Cliente agregado");
    go(next === "credito" ? `/cliente/${created.id}/credito` : `/cliente/${created.id}`);
  };
  root.append(
    header(c ? "Editar cliente" : next === "credito" ? "Nueva solicitud de crédito" : "Nuevo cliente", { back: true }),
    h("form", { class: "page", onsubmit: (e) => { e.preventDefault(); submit(); } },
      next === "credito" ? h("p", { class: "lead" }, "Primero el nombre y el celular. En el siguiente paso escaneas la INE.") : null,
      section("", field("Nombre *", name), field("Celular (WhatsApp)", phone), field("Correo", email), field("Auto de interés", vehicle),
        h("div", { class: "grid2" }, field("¿Cómo llegó?", source), field("Etapa", stage)), field("Notas", notes)),
      h("div", { class: "row end gap" }, btn("Cancelar", () => history.back(), "ghost"), h("button", { class: "btn primary", type: "submit" }, c ? "Guardar" : next === "credito" ? "Continuar a la INE" : "Agregar"))));
  name.focus();
}

// ───────── Ficha ─────────

export function renderCustomer(root, id) {
  const c = customer(id);
  if (!c) { root.append(header("Cliente", { back: "/clientes" }), empty("Este cliente ya no existe.")); return; }
  const note = textarea({ rows: 2, placeholder: "Escribe una nota (qué platicaron, qué sigue)…" });
  const acts = activityOf(c.id).slice(0, 40);
  const tplId = suggestTemplateId(c, acts.find((a) => ["whatsapp", "llamada", "correo"].includes(a.type))?.at);
  const creditMissing = c.credit ? missingFields(c.credit.values ?? {}).length : null;

  root.append(
    header(c.name || "Cliente", { back: "/clientes", actions: [btn("Editar", () => go(`/cliente/${c.id}/editar`), "small ghost")] }),
    h("div", { class: "page" },
      h("div", { class: "row wrap gap-s" },
        stageSelect(c.stage, (st) => { updateCustomer(c.id, { stage: st }); toast("Etapa actualizada"); rerender(); }),
        c.vehicle ? chip(c.vehicle) : null),
      h("div", { class: "row wrap gap-s" },
        btn("WhatsApp", () => go(`/whatsapp?c=${c.id}`), "wa"),
        btn("Mensaje sugerido", () => sendWhatsApp(c, fillTemplate(template(tplId).text, c)), "ghost"),
        btn("Llamar", () => call(c), "ghost"),
        c.email ? btn("Correo", () => { location.href = `mailto:${c.email}`; }, "ghost") : null),
      section("Próximo seguimiento",
        h("p", { class: c.nextFollowUp && new Date(c.nextFollowUp) < new Date() ? "warn" : "muted" }, c.nextFollowUp ? `Programado ${fmtWhen(c.nextFollowUp)}` : "Sin seguimiento programado."),
        followUpPicker(c)),
      h("div", { class: "grid2" },
        h("button", { class: "tile left", onclick: () => go(`/cliente/${c.id}/credito`) },
          h("span", {}, "Solicitud de crédito"),
          h("strong", {}, c.credit ? (c.credit.status === "enviada" ? "Enviada" : creditMissing ? `Faltan ${creditMissing} datos` : "Lista para PDF") : "Iniciar con INE")),
        h("button", { class: "tile left", onclick: () => go(`/cliente/${c.id}/placas`) },
          h("span", {}, "Trámite de placas"),
          h("strong", {}, c.plates ? plateLabel(c.plates.status) : "Iniciar"))),
      section("Notas y bitácora",
        c.notes ? h("p", { class: "pre" }, c.notes) : null,
        note,
        h("div", { class: "row end" }, btn("Guardar nota", () => {
          const t = note.value.trim();
          if (!t) return;
          log(c.id, "nota", t);
          save();
          toast("Nota guardada");
          rerender();
        }, "small")),
        acts.length ? h("ul", { class: "timeline" }, acts.map((a) => h("li", {}, h("span", { class: "muted small" }, `${fmtWhen(a.at)} · ${LABEL[a.type] ?? a.type}`), h("div", { class: "pre" }, a.text)))) : null),
      h("div", { class: "row end" }, btn("Eliminar cliente", async () => {
        if (!(await confirmBox("Eliminar cliente", `Se borrarán ${c.name}, su bitácora, sus recordatorios y sus documentos de este dispositivo.`, "Eliminar"))) return;
        await deleteCustomer(c.id);
        toast("Cliente eliminado");
        go("/clientes");
      }, "danger small"))));
}

const LABEL = { nota: "Nota", whatsapp: "WhatsApp", llamada: "Llamada", correo: "Correo", etapa: "Etapa", alta: "Alta", seguimiento: "Seguimiento", credito: "Crédito", placas: "Placas" };
