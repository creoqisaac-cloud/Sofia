/**
 * Construcción del contexto de un turno (memoria de Sofía).
 *
 * Nunca se envía todo el historial. El contexto se arma con:
 *  1. perfil estructurado          5. pendientes
 *  2. estado CRM                   6. últimos mensajes relevantes (ventana fija)
 *  3. resumen acumulado            7. información comercial recuperada para esta consulta
 *  4. compromisos de Mario
 * Los mensajes originales completos quedan en BD para auditoría.
 */
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { CrmStage, DocumentType, Temperature } from "@/domain/enums";
import { detectEscalations, type EscalationSignal } from "@/domain/escalation";
import {
  computeMissingFacts,
  FACT_DEFS,
  formatFactValue,
  isFactKey,
  mergeProfile,
  normalizeFactValue,
  type CustomerProfile,
  type FactKey,
  type FactValue,
  type MissingFact,
} from "@/domain/facts";
import {
  detectAskedFact,
  detectIntents,
  extractFacts,
  mentionedModels,
  type CatalogVehicle,
  type ExtractedFact,
  type Intent,
} from "@/domain/intents";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { loadCatalog, toCatalogVehicles, type CatalogSnapshot } from "../commercial/catalog";
import { computeQuote, type QuoteComputation } from "../commercial/quoting";
import { retrieveCommercialContext, type CommercialContext } from "../commercial/retrieval";

export const MEMORY_WINDOW = 12;

export interface ContextMessage {
  id: string;
  sender: "customer" | "sofia" | "mario" | "system";
  body: string;
  createdAt: Date;
}

export interface SystemQuote {
  refId: string;
  computation: QuoteComputation;
}

export interface TurnContext {
  now: Date;
  workspaceId: string;
  customerId: string;
  conversationId: string;
  customer: { displayName: string; nameKnown: boolean };
  profile: CustomerProfile;
  /** Perfil + hechos detectados determinísticamente en el mensaje nuevo (provisional). */
  provisionalProfile: CustomerProfile;
  knownFacts: Array<{ key: FactKey; label: string; value: string }>;
  missingFacts: MissingFact[];
  crm: { stage: CrmStage; temperature: Temperature; since: Date; reason: string };
  tags: string[];
  summary: { text: string; commitments: s.Commitment[]; pendingItems: string[]; version: number } | null;
  recentMessages: ContextMessage[];
  totalMessages: number;
  newMessage: { id: string; body: string };
  documents: Array<{ docType: DocumentType; status: string }>;
  openAlerts: Array<{ trigger: string; createdAt: Date }>;
  approvals: Array<{ id: string; actionType: string; status: string; decisionNotes: string | null }>;
  latestQuote: { calculationType: string; monthlyPayment: number | null; model: string | null; version: string | null; createdAt: Date } | null;
  officialQuoteAvailable: boolean;
  marioIntervened: boolean;
  intents: Intent[];
  provisionalFacts: ExtractedFact[];
  deterministicEscalations: EscalationSignal[];
  lastAskedFact: FactKey | null;
  commercial: CommercialContext;
  systemQuote: SystemQuote | null;
  catalog: CatalogSnapshot;
  catalogVehicles: CatalogVehicle[];
}

export async function loadProfile(db: Db, customerId: string): Promise<CustomerProfile> {
  const [row] = await db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId));
  return (row?.data ?? {}) as CustomerProfile;
}

export async function loadCurrentCrm(db: Db, customerId: string) {
  const [row] = await db
    .select()
    .from(s.crmStates)
    .where(and(eq(s.crmStates.customerId, customerId), eq(s.crmStates.isCurrent, true)));
  return row ?? null;
}

export async function loadLatestSummary(db: Db, customerId: string) {
  const [row] = await db
    .select()
    .from(s.customerSummaries)
    .where(eq(s.customerSummaries.customerId, customerId))
    .orderBy(desc(s.customerSummaries.version))
    .limit(1);
  return row ?? null;
}

export async function loadRecentMessages(db: Db, conversationId: string, limit = MEMORY_WINDOW): Promise<ContextMessage[]> {
  const rows = await db
    .select({ id: s.messages.id, sender: s.messages.sender, body: s.messages.body, createdAt: s.messages.createdAt })
    .from(s.messages)
    .where(eq(s.messages.conversationId, conversationId))
    .orderBy(desc(s.messages.seq))
    .limit(limit);
  return rows.reverse();
}

function provisionalMerge(profile: CustomerProfile, facts: ExtractedFact[]): CustomerProfile {
  const incoming: Array<{ key: FactKey; value: FactValue }> = [];
  for (const f of facts) {
    if (!isFactKey(f.key)) continue;
    const norm = normalizeFactValue(f.key, f.value, f.numericValue);
    if (norm.ok) incoming.push({ key: f.key, value: norm.value });
  }
  return mergeProfile(profile, incoming).profile;
}

export async function buildTurnContext(
  db: Db,
  args: { workspaceId: string; conversationId: string; newMessageId: string; now: Date; windowSize?: number },
): Promise<TurnContext> {
  const [conversation] = await db.select().from(s.conversations).where(eq(s.conversations.id, args.conversationId));
  if (!conversation) throw new Error("Conversación no encontrada");
  const customerId = conversation.customerId;

  const [customer] = await db.select().from(s.customers).where(eq(s.customers.id, customerId));
  const [newMessage] = await db.select().from(s.messages).where(eq(s.messages.id, args.newMessageId));
  if (!customer || !newMessage) throw new Error("Cliente o mensaje no encontrado");

  const [profile, crmRow, summaryRow, recentMessages, catalog] = await Promise.all([
    loadProfile(db, customerId),
    loadCurrentCrm(db, customerId),
    loadLatestSummary(db, customerId),
    loadRecentMessages(db, args.conversationId, args.windowSize ?? MEMORY_WINDOW),
    loadCatalog(db, args.workspaceId),
  ]);

  const [totalRow] = await db.select({ n: count() }).from(s.messages).where(eq(s.messages.conversationId, args.conversationId));
  const tags = await db
    .select({ tag: s.customerTags.tag })
    .from(s.customerTags)
    .where(and(eq(s.customerTags.customerId, customerId), isNull(s.customerTags.removedAt)));
  const documents = await db
    .select({ docType: s.documents.docType, status: s.documents.status })
    .from(s.documents)
    .where(eq(s.documents.customerId, customerId));
  const openAlerts = await db
    .select({ trigger: s.marioAlerts.trigger, createdAt: s.marioAlerts.createdAt })
    .from(s.marioAlerts)
    .where(and(eq(s.marioAlerts.customerId, customerId), inArray(s.marioAlerts.status, ["open", "acknowledged"])));
  const approvals = await db
    .select({ id: s.approvalRequests.id, actionType: s.approvalRequests.actionType, status: s.approvalRequests.status, decisionNotes: s.approvalRequests.decisionNotes })
    .from(s.approvalRequests)
    .where(eq(s.approvalRequests.customerId, customerId))
    .orderBy(desc(s.approvalRequests.createdAt))
    .limit(10);
  const quotesRows = await db
    .select({
      calculationType: s.quotes.calculationType,
      monthlyPayment: s.quotes.monthlyPayment,
      versionId: s.quotes.versionId,
      vehicleId: s.quotes.vehicleId,
      createdAt: s.quotes.createdAt,
      validUntil: s.quotes.validUntil,
    })
    .from(s.quotes)
    .where(and(eq(s.quotes.customerId, customerId), inArray(s.quotes.status, ["presented", "draft"])))
    .orderBy(desc(s.quotes.createdAt))
    .limit(5);
  const marioMessages = await db
    .select({ n: count() })
    .from(s.messages)
    .where(and(eq(s.messages.conversationId, args.conversationId), eq(s.messages.sender, "mario")));

  const catalogVehicles = toCatalogVehicles(catalog);
  const stage = (crmRow?.stage ?? "new") as CrmStage;
  const temperature = (crmRow?.temperature ?? "cold") as Temperature;

  const lastSofia = [...recentMessages].reverse().find((m) => m.sender === "sofia" && m.id !== newMessage.id);
  const lastAskedFact = lastSofia ? detectAskedFact(lastSofia.body) : null;
  const intents = detectIntents(newMessage.body);
  const provisionalFacts = extractFacts(newMessage.body, catalogVehicles, { lastAskedFact, profile });
  const provisionalProfile = provisionalMerge(profile, provisionalFacts);

  const models = Array.from(
    new Set([
      ...mentionedModels(newMessage.body, catalogVehicles),
      ...(typeof provisionalProfile.vehicle_interest === "string" ? [provisionalProfile.vehicle_interest] : []),
    ]),
  );
  const versionByModel: Record<string, string | undefined> = {};
  if (typeof provisionalProfile.vehicle_interest === "string" && typeof provisionalProfile.version === "string") {
    versionByModel[provisionalProfile.vehicle_interest] = provisionalProfile.version;
  }
  const paymentMethod = typeof provisionalProfile.payment_method === "string" ? provisionalProfile.payment_method : undefined;

  const commercial = retrieveCommercialContext(catalog, {
    models,
    versionByModel,
    intents,
    paymentMethod,
    query: newMessage.body,
    now: args.now,
  });

  // Cotización calculada por el sistema cuando hay datos suficientes y el cliente la pide.
  let systemQuote: SystemQuote | null = null;
  const wantsNumbers = intents.has("ask_quote") || intents.has("ask_financing") || (intents.has("ask_price") && paymentMethod === "financing");
  if (
    wantsNumbers &&
    typeof provisionalProfile.vehicle_interest === "string" &&
    typeof provisionalProfile.version === "string" &&
    (typeof provisionalProfile.down_payment === "number" || paymentMethod === "cash")
  ) {
    systemQuote = {
      refId: randomUUID(),
      computation: computeQuote(
        catalog,
        {
          model: provisionalProfile.vehicle_interest,
          version: provisionalProfile.version,
          downPayment: typeof provisionalProfile.down_payment === "number" ? provisionalProfile.down_payment : 0,
          termMonths: typeof provisionalProfile.term_months === "number" ? provisionalProfile.term_months : null,
          paymentMethod: paymentMethod === "cash" ? "cash" : "financing",
        },
        args.now,
      ),
    };
  }

  const interest = catalogVehicles.find((v) => v.model === provisionalProfile.vehicle_interest);
  const nameKnown = typeof profile.name === "string" || !/^prospecto\b/i.test(customer.displayName);

  const latest = quotesRows[0];
  const latestVehicle = latest?.vehicleId ? catalog.vehicles.find((v) => v.id === latest.vehicleId) : undefined;
  const latestVersion = latest?.versionId ? catalog.versions.find((v) => v.id === latest.versionId) : undefined;

  return {
    now: args.now,
    workspaceId: args.workspaceId,
    customerId,
    conversationId: args.conversationId,
    customer: { displayName: customer.displayName, nameKnown },
    profile,
    provisionalProfile,
    knownFacts: (Object.entries(profile) as Array<[FactKey, FactValue]>)
      .filter(([k]) => isFactKey(k))
      .map(([k, v]) => ({ key: k, label: FACT_DEFS[k].label, value: formatFactValue(k, v) })),
    missingFacts: computeMissingFacts(provisionalProfile, { nameKnown, hybridAvailableForInterest: Boolean(interest?.hasHybrid) }),
    crm: { stage, temperature, since: crmRow?.createdAt ?? customer.createdAt, reason: crmRow?.reason ?? "" },
    tags: tags.map((t) => t.tag),
    summary: summaryRow
      ? { text: summaryRow.summary, commitments: summaryRow.commitments, pendingItems: summaryRow.pendingItems, version: summaryRow.version }
      : null,
    recentMessages,
    totalMessages: totalRow?.n ?? recentMessages.length,
    newMessage: { id: newMessage.id, body: newMessage.body },
    documents,
    openAlerts,
    approvals,
    latestQuote: latest
      ? {
          calculationType: latest.calculationType,
          monthlyPayment: latest.monthlyPayment,
          model: latestVehicle?.model ?? null,
          version: latestVersion?.name ?? null,
          createdAt: latest.createdAt,
        }
      : null,
    officialQuoteAvailable: quotesRows.some(
      (q) => q.calculationType === "official" && (!q.validUntil || q.validUntil.getTime() >= args.now.getTime()),
    ),
    marioIntervened: (marioMessages[0]?.n ?? 0) > 0 || approvals.some((a) => a.status === "approved" || a.status === "rejected"),
    intents: [...intents],
    provisionalFacts,
    // "Cerca del cierre" solo si Mario no tiene ya una alerta abierta de este cliente.
    deterministicEscalations: detectEscalations({ intents, stage, temperature }).filter(
      (e) => !(e.trigger === "approaching_closing" && openAlerts.length > 0),
    ),
    lastAskedFact,
    commercial,
    systemQuote,
    catalog,
    catalogVehicles,
  };
}
