/**
 * Router de comandos: intención estructurada → herramienta determinista → respuesta.
 *
 * - Leer (cotizar, estados, búsqueda, hoy) se ejecuta directo.
 * - Modificar o enviar (cita, seguimiento, documento, venta, placas, correo) NUNCA se ejecuta
 *   aquí: se devuelve una acción pendiente y Mario confirma (`executeConfirmed`).
 * - Voz y texto usan este mismo router. El interpretador es intercambiable (hoy: reglas).
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { COMMAND_INTENTS, foldText, MUTATING_INTENTS, parseCommand, type CatalogModel, type ParsedCommand } from "@/domain/command";
import { CREDIT_APPLICATION_STATUS_LABELS, DOCUMENT_STATUSES, DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, SALE_STATUS_LABELS, type DocumentType } from "@/domain/enums";
import { formatMXN } from "@/domain/money";
import { salePendingItems } from "@/domain/sales";
import type { AppContext } from "../app";
import { loadCatalog } from "../commercial/catalog";
import * as s from "../db/schema";
import { APPOINTMENT_KINDS, createFollowup, scheduleAppointment } from "../services/agenda";
import { listCustomerApplications } from "../services/credit";
import { getDocumentChecklist, setDocumentStatus } from "../services/documents";
import { draftPlatesEmail, getEmail, getEmailProvider, sendEmail, EMAIL_NOT_CONFIGURED } from "../services/email";
import { ServiceError } from "../services/errors";
import { ensurePlateCase, listPlateCases, NO_PLATE_REQUIREMENTS, PLATE_STATUS_LABELS, PLATE_STATUSES, plateMissing, updatePlateCase, type PlateStatus } from "../services/plates";
import { runQuote, saveQuoteRun, type QuoteRunView } from "../services/quote-v2";
import { updateSale } from "../services/sales";
import { getTodayItems, searchEverything } from "../services/today";

// ───────── contrato de respuesta ─────────

export type CommandBlock =
  | { type: "text"; text: string }
  | { type: "quote"; quote: QuoteRunView }
  | { type: "list"; title?: string; items: Array<{ title: string; detail?: string; href?: string; tone?: "warn" | "ok" | "muted" }> }
  | { type: "email"; email: { id: string; to: string | null; subject: string; body: string; attachments: string[]; providerConfigured: boolean } }
  | { type: "missing"; title: string; items: string[] };

export const PendingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("schedule_appointment"), customerId: z.string().uuid(), at: z.string().datetime(), kind: z.string().max(30), label: z.string().max(200) }),
  z.object({ type: z.literal("create_followup"), customerId: z.string().uuid(), dueAt: z.string().datetime(), reason: z.string().min(1).max(300), label: z.string().max(200) }),
  z.object({ type: z.literal("register_document"), customerId: z.string().uuid(), docType: z.enum(DOCUMENT_TYPES), label: z.string().max(200) }),
  z.object({ type: z.literal("update_sale"), saleId: z.string().uuid(), field: z.enum(["orderNumber", "invoiceNumber", "vin", "customerNumber"]), value: z.string().min(1).max(40), label: z.string().max(200) }),
  z.object({ type: z.literal("update_plate"), caseId: z.string().uuid(), status: z.enum(PLATE_STATUSES), label: z.string().max(200) }),
  z.object({ type: z.literal("send_email"), emailId: z.string().uuid(), label: z.string().max(200) }),
  z.object({ type: z.literal("save_quote"), runId: z.string().uuid(), customerId: z.string().uuid().nullable(), label: z.string().max(200) }),
]);
export type PendingAction = z.infer<typeof PendingActionSchema>;

export interface CommandResponse {
  intent: (typeof COMMAND_INTENTS)[number];
  /** Frase corta para leer en voz alta. */
  say: string;
  blocks: CommandBlock[];
  confirm?: { question: string; action: PendingAction };
  options?: Array<{ label: string; command: string }>;
  navigate?: string;
  customerId?: string | null;
  links?: Array<{ label: string; href: string }>;
}

export interface CommandContext {
  lastCustomerId?: string | null;
}

// ───────── utilidades ─────────

export async function catalogModels(app: AppContext): Promise<CatalogModel[]> {
  const cat = await loadCatalog(app.db, app.workspaceId);
  return cat.vehicles.map((v) => ({ model: v.model, aliases: v.aliases ?? [], versions: cat.versions.filter((x) => x.vehicleId === v.id).map((x) => x.name) }));
}

const short = (name: string) => name.replace(/\s*\(DEMO\)\s*/i, "").trim();

type Resolved = { customer: typeof s.customers.$inferSelect } | { options: Array<typeof s.customers.$inferSelect> } | { none: true };

export async function resolveCustomer(app: AppContext, query: string | undefined, ctx: CommandContext): Promise<Resolved> {
  if (!query) {
    if (ctx.lastCustomerId) {
      const [c] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, ctx.lastCustomerId), eq(s.customers.workspaceId, app.workspaceId)));
      if (c) return { customer: c };
    }
    return { none: true };
  }
  const q = foldText(query);
  const words = q.split(" ").filter((w) => w.length > 1);
  const all = (await app.db.select().from(s.customers).where(eq(s.customers.workspaceId, app.workspaceId))).filter((c) => !c.archivedAt);
  const digits = query.replace(/\D/g, "");
  const scored = all
    .map((c) => {
      const name = foldText(c.displayName);
      const tokens = name.split(/[\s()]+/);
      let score = 0;
      if (digits.length >= 7 && (c.phone ?? "").includes(digits)) score = 10;
      else if (name === q) score = 9;
      else if (words.length && words.every((w) => tokens.some((t) => t.startsWith(w)))) score = 8;
      else if (words.length && words.every((w) => name.includes(w))) score = 5;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { none: true };
  const top = scored.filter((x) => x.score === scored[0]!.score);
  if (top.length === 1) return { customer: top[0]!.c };
  return { options: top.slice(0, 5).map((x) => x.c) };
}

function needCustomer(intentLabel: string, r: Resolved, commandFor: (name: string) => string, query?: string): CommandResponse | null {
  if ("customer" in r) return null;
  if ("options" in r) {
    return {
      intent: "find_customer",
      say: `Encontré ${r.options.length} clientes. ¿Cuál?`,
      blocks: [{ type: "list", title: "¿Cuál cliente?", items: r.options.map((c) => ({ title: short(c.displayName), href: `/customers/${c.id}` })) }],
      options: r.options.map((c) => ({ label: short(c.displayName), command: commandFor(short(c.displayName)) })),
    };
  }
  return { intent: "find_customer", say: query ? `No encontré a "${query}".` : `¿De qué cliente? (${intentLabel})`, blocks: [{ type: "text", text: query ? `No encontré a "${query}" entre tus clientes.` : `Dime el nombre del cliente para ${intentLabel}.` }] };
}

async function customerSummary(app: AppContext, customerId: string) {
  const now = app.clock.now();
  const [apps, checklist, sales, plates, followups] = await Promise.all([
    listCustomerApplications(app, customerId),
    getDocumentChecklist(app, customerId),
    app.db.select().from(s.saleRecords).where(eq(s.saleRecords.customerId, customerId)).orderBy(desc(s.saleRecords.createdAt)),
    listPlateCases(app, { customerId, openOnly: true }),
    app.db.select().from(s.followups).where(and(eq(s.followups.customerId, customerId), eq(s.followups.status, "pending"))),
  ]);
  const items: Array<{ title: string; detail?: string; href?: string; tone?: "warn" | "ok" | "muted" }> = [];
  for (const a of apps.filter((x) => !["cancelled", "rejected"].includes(x.status))) {
    const t = a.totals;
    const bits = t ? [t.missing ? `${t.missing} dato(s) por capturar` : "", t.conflicts ? `${t.conflicts} conflicto(s)` : "", t.needsConfirmation ? `${t.needsConfirmation} por confirmar` : ""].filter(Boolean) : [];
    items.push({ title: `Solicitud ${a.institutionName}: ${CREDIT_APPLICATION_STATUS_LABELS[a.status]}`, detail: bits.join(" · ") || undefined, href: `/customers/${customerId}/credit/${a.id}`, tone: a.status === "approved" ? "ok" : bits.length ? "warn" : undefined });
  }
  const missingDocs = checklist.filter((d) => d.requiredBy.length > 0 && ["missing", "requested", "rejected"].includes(d.status));
  if (missingDocs.length) items.push({ title: `Faltan documentos`, detail: missingDocs.map((d) => d.label).join(", "), href: `/customers/${customerId}?tab=documentos`, tone: "warn" });
  const sale = sales[0];
  if (sale) {
    const pend = salePendingItems(sale, now);
    items.push({ title: `Venta: ${SALE_STATUS_LABELS[sale.status]}`, detail: pend.join(" · ") || undefined, href: `/sales/${sale.id}`, tone: pend.length ? "warn" : "ok" });
  }
  for (const p of plates) {
    const miss = plateMissing(p.plate);
    items.push({ title: `Placas: ${PLATE_STATUS_LABELS[p.plate.status as PlateStatus]}`, detail: miss.length ? `Falta: ${miss.join(", ")}` : p.plate.nextStep ?? undefined, href: `/plates/${p.plate.id}`, tone: miss.length ? "warn" : undefined });
  }
  for (const f of followups) items.push({ title: f.promisedByMario ? `Le prometiste: ${f.reason}` : `Seguimiento: ${f.reason}`, detail: f.dueAt ? f.dueAt.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : undefined, tone: "muted" });
  return { items, missingDocs, apps, sale };
}

// ───────── ejecución ─────────

export async function runCommand(app: AppContext, text: string, ctx: CommandContext = {}): Promise<CommandResponse> {
  const parsed = parseCommand(text, await catalogModels(app), app.clock.now());
  return executeParsed(app, parsed, ctx);
}

export async function executeParsed(app: AppContext, cmd: ParsedCommand, ctx: CommandContext): Promise<CommandResponse> {
  const p = cmd.params;
  switch (cmd.intent) {
    case "today": {
      const items = await getTodayItems(app);
      return {
        intent: "today",
        say: items.length ? `Tienes ${items.length} pendiente${items.length === 1 ? "" : "s"}. Lo primero: ${items[0]!.title}, ${items[0]!.detail}.` : "No tienes pendientes por ahora.",
        blocks: [{ type: "list", title: "Hoy", items: items.slice(0, 8).map((i) => ({ title: i.title, detail: `${i.detail} → ${i.actionLabel}`, href: i.href })) }],
      };
    }

    case "quote": {
      if (!p.model) return { intent: "quote", say: "¿Qué modelo cotizo?", blocks: [{ type: "text", text: "Dime modelo, versión, enganche y plazo. Ej.: “HR-V Touring, 150 mil de enganche, 48 meses”." }] };
      const missing = [!p.downPayment && "enganche", !p.termMonths && "plazo"].filter(Boolean) as string[];
      if (missing.length) {
        return { intent: "quote", say: `Me falta el ${missing.join(" y el ")}.`, blocks: [{ type: "missing", title: `Para cotizar ${p.model}${p.version ? ` ${p.version}` : ""} me falta`, items: missing }] };
      }
      let customerId: string | null = null;
      if (p.customerQuery) {
        const r = await resolveCustomer(app, p.customerQuery, ctx);
        if ("customer" in r) customerId = r.customer.id;
      }
      try {
        const q = await runQuote(app, { model: p.model, version: p.version ?? null, downPayment: p.downPayment!, termMonths: p.termMonths!, customerId });
        const r = q.result;
        const say =
          r.exactness === "incomplete"
            ? `${q.vehicleLabel}: ${r.missing[0] ?? "falta información"}${q.validatedExample ? ` Sí tengo una corrida validada guardada de ${formatMXN(q.validatedExample.monthlyPayment)} mensuales.` : ""}`
            : `${q.vehicleLabel}, ${formatMXN(q.downPayment)} de enganche a ${q.termMonths} meses. ${r.exactness === "exact" ? "La corrida validada" : "El cálculo sin validar"} queda en ${formatMXN(r.monthlyPayment!)} mensuales${r.isDemo ? " (datos DEMO)" : ""}. ¿La guardo para algún cliente?`;
        return { intent: "quote", say, blocks: [{ type: "quote", quote: q }], customerId };
      } catch (e) {
        if (e instanceof ServiceError) return { intent: "quote", say: e.message, blocks: [{ type: "missing", title: "No puedo cotizar exacto", items: [e.message] }] };
        throw e;
      }
    }

    case "find_customer": {
      const q = p.query ?? p.customerQuery ?? "";
      if (p.target === "open") {
        const r = await resolveCustomer(app, p.customerQuery, ctx);
        const need = needCustomer("abrir su ficha", r, (n) => `abre el cliente ${n}`, p.customerQuery);
        if (need) return need;
        const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
        return { intent: "find_customer", say: `Abriendo ${short(c.displayName)}.`, blocks: [], navigate: `/customers/${c.id}`, customerId: c.id };
      }
      const hits = await searchEverything(app, q);
      if (!hits.length) return { intent: "find_customer", say: `No encontré "${q}".`, blocks: [{ type: "text", text: `Sin resultados para "${q}". Busco por nombre, teléfono, # de cliente, pedido, factura, VIN o vehículo.` }] };
      const only = hits.length === 1 || (hits[0]!.kind === "customer" && hits.filter((h) => h.kind === "customer").length === 1 && foldText(hits[0]!.title).includes(foldText(q)));
      return {
        intent: "find_customer",
        say: hits.length === 1 ? `Encontré a ${short(hits[0]!.title)}.` : `Encontré ${hits.length} resultados.`,
        blocks: [{ type: "list", title: "Resultados", items: hits.map((h) => ({ title: short(h.title), detail: h.detail, href: h.href })) }],
        customerId: only && hits[0]!.kind === "customer" ? hits[0]!.id : null,
      };
    }

    case "customer_status":
    case "credit_status":
    case "documents_status":
    case "sale_status": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("ver su estado", r, (n) => `¿qué le falta a ${n}?`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const name = short(c.displayName);
      const sum = await customerSummary(app, c.id);
      if (cmd.intent === "sale_status") {
        if (!sum.sale) return { intent: "sale_status", say: `${name} no tiene venta registrada.`, blocks: [{ type: "text", text: `${name} no tiene venta registrada.` }], customerId: c.id };
        if (p.target === "open") return { intent: "sale_status", say: `Abriendo la venta de ${name}.`, blocks: [], navigate: `/sales/${sum.sale.id}`, customerId: c.id };
      }
      let items = sum.items;
      if (cmd.intent === "documents_status") items = items.filter((i) => i.title.startsWith("Faltan documentos"));
      if (cmd.intent === "credit_status") items = items.filter((i) => i.title.startsWith("Solicitud"));
      if (cmd.intent === "sale_status") items = items.filter((i) => i.title.startsWith("Venta"));
      const pending = items.filter((i) => i.tone === "warn");
      const say =
        cmd.intent === "documents_status"
          ? sum.missingDocs.length
            ? `A ${name} le falta: ${sum.missingDocs.map((d) => d.label.toLowerCase()).join(", ")}.`
            : `${name} no tiene documentos pendientes.`
          : pending.length
            ? `${name}: ${pending.map((i) => `${i.title}${i.detail ? ` (${i.detail})` : ""}`).join("; ")}.`
            : items.length
              ? `${name}: ${items[0]!.title}.`
              : `${name} no tiene pendientes registrados.`;
      return { intent: cmd.intent, say, blocks: [{ type: "list", title: name, items: items.length ? items : [{ title: "Sin pendientes registrados", tone: "ok" }] }], customerId: c.id, links: [{ label: `Abrir ${name}`, href: `/customers/${c.id}` }] };
    }

    case "register_document": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("registrar el documento", r, (n) => `registra que ${n} ya me mandó su ${DOCUMENT_TYPE_LABELS[p.docType as DocumentType]?.toLowerCase() ?? "documento"}`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const docLabel = DOCUMENT_TYPE_LABELS[p.docType as DocumentType] ?? "documento";
      const label = `Marcar "${docLabel}" de ${short(c.displayName)} como recibido`;
      return { intent: "register_document", say: `¿Confirmas que ${short(c.displayName)} ya entregó ${docLabel.toLowerCase()}?`, blocks: [], confirm: { question: `${label}?`, action: { type: "register_document", customerId: c.id, docType: p.docType as DocumentType, label } }, customerId: c.id };
    }

    case "schedule_appointment": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("agendar la cita", r, (n) => `agenda a ${n} ${cmd.raw.replace(/^.*?(mañana|manana|hoy|el |a las)/i, "$1")}`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      if (!p.when || !p.when.hasTime) return { intent: "schedule_appointment", say: `¿Qué día y a qué hora agendo a ${short(c.displayName)}?`, blocks: [{ type: "missing", title: "Para agendar me falta", items: [!p.when ? "día" : "", "hora"].filter(Boolean) }], customerId: c.id };
      const kind = p.reason ?? "visit";
      const label = `${APPOINTMENT_KINDS[kind] ?? "Cita"} con ${short(c.displayName)} · ${p.when.label}`;
      return { intent: "schedule_appointment", say: `¿Agendo a ${short(c.displayName)} el ${p.when.label}?`, blocks: [], confirm: { question: `¿Agendar ${label}?`, action: { type: "schedule_appointment", customerId: c.id, at: p.when.iso, kind, label } }, customerId: c.id };
    }

    case "create_followup": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("crear el seguimiento", r, (n) => `recuérdame llamar a ${n} mañana`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const when = p.when!;
      const reason = p.reason?.trim() || "Llamar";
      const label = `Seguimiento a ${short(c.displayName)} · ${when.label} · ${reason}`;
      return { intent: "create_followup", say: `¿Creo el seguimiento para ${short(c.displayName)} el ${when.label}?`, blocks: [], confirm: { question: `¿Crear ${label}?`, action: { type: "create_followup", customerId: c.id, dueAt: when.iso, reason, label } }, customerId: c.id };
    }

    case "update_sale": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("actualizar la venta", r, (n) => `el ${p.saleField === "invoiceNumber" ? "factura" : "pedido"} de ${n} es ${p.saleValue}`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const [sale] = await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.customerId, c.id)).orderBy(desc(s.saleRecords.createdAt)).limit(1);
      if (!sale) return { intent: "update_sale", say: `${short(c.displayName)} no tiene venta registrada.`, blocks: [{ type: "text", text: "Primero crea la venta desde su cotización o su ficha." }], customerId: c.id };
      const fieldLabel = { orderNumber: "Pedido", invoiceNumber: "Factura", vin: "VIN", customerNumber: "# de cliente" }[p.saleField!];
      const current = sale[p.saleField!];
      const label = `${fieldLabel} de ${short(c.displayName)}: ${current ? `${current} → ` : ""}${p.saleValue}`;
      return { intent: "update_sale", say: `¿Registro ${fieldLabel.toLowerCase()} ${p.saleValue} para ${short(c.displayName)}?`, blocks: [], confirm: { question: `¿Guardar ${label}? Queda en el historial de la venta.`, action: { type: "update_sale", saleId: sale.id, field: p.saleField!, value: p.saleValue!, label } }, customerId: c.id };
    }

    case "plate_status": {
      if (!p.customerQuery) {
        const open = await listPlateCases(app, { openOnly: true });
        return {
          intent: "plate_status",
          say: open.length ? `Tienes ${open.length} trámite${open.length === 1 ? "" : "s"} de placas abierto${open.length === 1 ? "" : "s"}.` : "No tienes trámites de placas abiertos.",
          blocks: [{ type: "list", title: "Placas pendientes", items: open.map((o) => ({ title: short(o.customerName), detail: `${PLATE_STATUS_LABELS[o.plate.status as PlateStatus]}${plateMissing(o.plate).length ? ` · falta ${plateMissing(o.plate).join(", ")}` : ""}`, href: `/plates/${o.plate.id}` })) }],
        };
      }
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("ver sus placas", r, (n) => `¿qué le falta para placas a ${n}?`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const pc = await ensurePlateCase(app, c.id);
      const miss = plateMissing(pc);
      const name = short(c.displayName);
      const say = pc.requirements.length === 0 ? `No tengo requisitos de placas capturados. ${NO_PLATE_REQUIREMENTS}` : miss.length ? `A ${name} le falta para placas: ${miss.join(", ")}.` : `${name} ya tiene todo para placas.`;
      return {
        intent: "plate_status",
        say,
        blocks: [
          pc.requirements.length === 0
            ? { type: "missing", title: "Requisitos de placas", items: [NO_PLATE_REQUIREMENTS] }
            : { type: "list", title: `Placas · ${name} · ${PLATE_STATUS_LABELS[pc.status as PlateStatus]}`, items: pc.requirements.map((q) => ({ title: q.label, detail: `${q.received ? "Recibido" : "Pendiente"} · fuente: ${q.source}`, tone: q.received ? "ok" : "warn" })) },
        ],
        customerId: c.id,
        links: [{ label: "Abrir trámite", href: `/plates/${pc.id}` }],
      };
    }

    case "update_plate": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("actualizar el trámite", r, (n) => `marca el trámite de ${n} como enviado`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const pc = await ensurePlateCase(app, c.id);
      const status = p.plateStatus as PlateStatus;
      const label = `Placas de ${short(c.displayName)}: ${PLATE_STATUS_LABELS[pc.status as PlateStatus]} → ${PLATE_STATUS_LABELS[status]}`;
      return { intent: "update_plate", say: `¿Marco el trámite de ${short(c.displayName)} como ${PLATE_STATUS_LABELS[status].toLowerCase()}?`, blocks: [], confirm: { question: `¿${label}?`, action: { type: "update_plate", caseId: pc.id, status, label } }, customerId: c.id };
    }

    case "draft_email": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("preparar el correo", r, (n) => `hazme el correo de placas de ${n}`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      if (p.target !== "plates") return { intent: "draft_email", say: "Por ahora preparo correos de placas.", blocks: [{ type: "text", text: "Hoy Sofía prepara el correo de placas. Dime: “hazme el correo de placas de …”." }], customerId: c.id };
      const d = await draftPlatesEmail(app, c.id);
      return {
        intent: "draft_email",
        say: `Listo el borrador del correo de placas de ${short(c.displayName)}.${d.toAddress ? "" : " Falta el destinatario."} No lo envío hasta que confirmes.`,
        blocks: [{ type: "email", email: { id: d.id, to: d.toAddress, subject: d.subject, body: d.body, attachments: d.attachments.map((a) => a.label), providerConfigured: getEmailProvider().configured } }],
        customerId: c.id,
      };
    }

    case "send_email": {
      const r = await resolveCustomer(app, p.customerQuery, ctx);
      const need = needCustomer("enviar el correo", r, (n) => `envía el correo de placas de ${n}`, p.customerQuery);
      if (need) return need;
      const c = (r as { customer: typeof s.customers.$inferSelect }).customer;
      const [draft] = await app.db.select().from(s.emailMessages).where(and(eq(s.emailMessages.customerId, c.id), eq(s.emailMessages.status, "draft"))).orderBy(desc(s.emailMessages.createdAt)).limit(1);
      if (!draft) return { intent: "send_email", say: `No hay borrador para ${short(c.displayName)}. ¿Lo preparo?`, blocks: [], options: [{ label: "Preparar correo de placas", command: `hazme el correo de placas de ${short(c.displayName)}` }], customerId: c.id };
      if (!getEmailProvider().configured) return { intent: "send_email", say: EMAIL_NOT_CONFIGURED, blocks: [{ type: "email", email: { id: draft.id, to: draft.toAddress, subject: draft.subject, body: draft.body, attachments: draft.attachments.map((a) => a.label), providerConfigured: false } }], customerId: c.id };
      const label = `Enviar "${draft.subject}" a ${draft.toAddress ?? "(sin destinatario)"}`;
      return { intent: "send_email", say: "¿Confirmas el envío?", blocks: [], confirm: { question: `¿${label}?`, action: { type: "send_email", emailId: draft.id, label } }, customerId: c.id };
    }

    case "navigate":
      return { intent: "navigate", say: "Abriendo.", blocks: [], navigate: p.target ?? "/" };

    default:
      return {
        intent: "unknown",
        say: "No entendí. Prueba: “cotiza una HR-V Touring con 150 mil a 48 meses”, “¿qué le falta a Juan?” o “agenda a Ana mañana a las 5”.",
        blocks: [],
        options: [
          { label: "¿Qué tengo hoy?", command: "¿Qué tengo hoy?" },
          { label: "Cotizar", command: "cotiza " },
          { label: "Placas pendientes", command: "¿Cuáles placas tengo pendientes?" },
        ],
      };
  }
}

/** Ejecuta una acción que Mario confirmó. Re-valida todo del lado del servidor. */
export async function executeConfirmed(app: AppContext, raw: unknown): Promise<{ ok: true; message: string; href?: string }> {
  const action = PendingActionSchema.parse(raw);
  switch (action.type) {
    case "schedule_appointment": {
      const a = await scheduleAppointment(app, { customerId: action.customerId, at: new Date(action.at), kind: action.kind });
      return { ok: true, message: `Cita agendada: ${action.label}`, href: `/agenda#${a.id}` };
    }
    case "create_followup":
      await createFollowup(app, { customerId: action.customerId, dueAt: new Date(action.dueAt), reason: action.reason, action: "Llamar" });
      return { ok: true, message: `Seguimiento creado: ${action.label}`, href: `/customers/${action.customerId}` };
    case "register_document":
      if (!(DOCUMENT_STATUSES as readonly string[]).includes("received")) throw new ServiceError("Estado inválido.");
      await setDocumentStatus(app, action.customerId, action.docType, "received");
      return { ok: true, message: `Registrado: ${action.label}`, href: `/customers/${action.customerId}?tab=documentos` };
    case "update_sale":
      await updateSale(app, action.saleId, { [action.field]: action.value }, "Capturado por comando de Sofía (confirmado por Mario)");
      return { ok: true, message: `Venta actualizada: ${action.label}`, href: `/sales/${action.saleId}` };
    case "update_plate":
      await updatePlateCase(app, action.caseId, { status: action.status });
      return { ok: true, message: action.label, href: `/plates/${action.caseId}` };
    case "send_email": {
      const e = await getEmail(app, action.emailId);
      await sendEmail(app, e.id, { confirmed: true });
      return { ok: true, message: "Correo enviado." };
    }
    case "save_quote": {
      await saveQuoteRun(app, action.runId, action.customerId);
      return { ok: true, message: action.customerId ? "Corrida guardada en el cliente." : "Corrida guardada.", href: action.customerId ? `/customers/${action.customerId}?tab=cotizaciones` : undefined };
    }
  }
}

export { MUTATING_INTENTS };
