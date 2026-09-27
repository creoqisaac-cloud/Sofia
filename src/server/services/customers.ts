import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { CRM_STAGE_LABELS, TEMPERATURE_LABELS, type CrmStage, type Temperature } from "@/domain/enums";
import { computeMissingFacts, FACT_DEFS, formatFactValue, isFactKey, type CustomerProfile, type FactKey } from "@/domain/facts";
import { TAG_CATALOG } from "@/domain/tags";
import type { AppContext } from "../app";
import { writeCrmState } from "../agent/effects";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { loadCatalog, toCatalogVehicles } from "../commercial/catalog";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

export async function createCustomer(app: AppContext, input: { displayName: string; phone?: string | null }) {
  const displayName = input.displayName.trim();
  if (!displayName) throw new ServiceError("El nombre del prospecto es obligatorio.");
  const phone = input.phone?.replace(/[^\d+]/g, "") || null;
  if (phone) {
    const [dup] = await app.db
      .select({ id: s.customers.id })
      .from(s.customers)
      .where(and(eq(s.customers.workspaceId, app.workspaceId), eq(s.customers.phone, phone)));
    if (dup) throw new ServiceError("Ya existe un prospecto con ese teléfono.", 409);
  }
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [customer] = await tx
      .insert(s.customers)
      .values({ workspaceId: app.workspaceId, ownerUserId: app.advisorUserId, displayName, phone, source: "simulator" })
      .returning();
    const [conversation] = await tx
      .insert(s.conversations)
      .values({ workspaceId: app.workspaceId, customerId: customer!.id, channel: "simulator" })
      .returning();
    await tx.insert(s.customerProfiles).values({ workspaceId: app.workspaceId, customerId: customer!.id, data: {} });
    await writeCrmState(tx, {
      workspaceId: app.workspaceId,
      customerId: customer!.id,
      from: null,
      to: { stage: "new", temperature: "cold" },
      reason: "Prospecto creado.",
      changedBy: "mario",
    });
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: customer!.id,
      actorType: "mario",
      eventType: "customer_created",
      entityType: "customer",
      entityId: customer!.id,
      data: { channel: "simulator", hasPhone: Boolean(phone) },
    });
    return { customer: customer!, conversation: conversation! };
  });
}

export async function listCustomers(app: AppContext) {
  const rows = await app.db
    .select({
      id: s.customers.id,
      displayName: s.customers.displayName,
      createdAt: s.customers.createdAt,
      conversationId: s.conversations.id,
      controlMode: s.conversations.controlMode,
      lastMessageAt: s.conversations.lastMessageAt,
      stage: s.crmStates.stage,
      temperature: s.crmStates.temperature,
    })
    .from(s.customers)
    .innerJoin(s.conversations, eq(s.conversations.customerId, s.customers.id))
    .leftJoin(s.crmStates, and(eq(s.crmStates.customerId, s.customers.id), eq(s.crmStates.isCurrent, true)))
    .where(and(eq(s.customers.workspaceId, app.workspaceId), isNull(s.customers.archivedAt)))
    .orderBy(desc(sql`coalesce(${s.conversations.lastMessageAt}, ${s.customers.createdAt})`));

  const alerts = await app.db
    .select({ customerId: s.marioAlerts.customerId, n: count() })
    .from(s.marioAlerts)
    .where(and(eq(s.marioAlerts.workspaceId, app.workspaceId), eq(s.marioAlerts.status, "open")))
    .groupBy(s.marioAlerts.customerId);
  const alertMap = new Map(alerts.map((a) => [a.customerId, a.n]));
  return rows.map((r) => ({ ...r, openAlerts: alertMap.get(r.id) ?? 0 }));
}

export async function getCustomerState(app: AppContext, customerId: string) {
  const db = app.db;
  const [customer] = await db
    .select()
    .from(s.customers)
    .where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!customer) throw new ServiceError("Prospecto no encontrado.", 404);
  const [conversation] = await db.select().from(s.conversations).where(eq(s.conversations.customerId, customerId)).orderBy(desc(s.conversations.createdAt)).limit(1);

  const [messages, profileRow, crmHistory, tags, summaries, facts, lastRun, quotes, alerts, approvals, appointments, followups, documents, catalog, runs] = await Promise.all([
    db
      .select({ id: s.messages.id, sender: s.messages.sender, body: s.messages.body, createdAt: s.messages.createdAt, metadata: s.messages.metadata })
      .from(s.messages)
      .where(eq(s.messages.conversationId, conversation!.id))
      .orderBy(s.messages.seq),
    db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId)),
    db.select().from(s.crmStates).where(eq(s.crmStates.customerId, customerId)).orderBy(desc(s.crmStates.seq)).limit(30),
    db.select().from(s.customerTags).where(and(eq(s.customerTags.customerId, customerId), isNull(s.customerTags.removedAt))),
    db.select().from(s.customerSummaries).where(eq(s.customerSummaries.customerId, customerId)).orderBy(desc(s.customerSummaries.version)).limit(1),
    db.select().from(s.customerFacts).where(eq(s.customerFacts.customerId, customerId)).orderBy(desc(s.customerFacts.createdAt)).limit(60),
    db.select().from(s.agentRuns).where(eq(s.agentRuns.customerId, customerId)).orderBy(desc(s.agentRuns.createdAt)).limit(1),
    db.select().from(s.quotes).where(eq(s.quotes.customerId, customerId)).orderBy(desc(s.quotes.createdAt)).limit(5),
    db.select().from(s.marioAlerts).where(eq(s.marioAlerts.customerId, customerId)).orderBy(desc(s.marioAlerts.createdAt)).limit(10),
    db.select().from(s.approvalRequests).where(eq(s.approvalRequests.customerId, customerId)).orderBy(desc(s.approvalRequests.createdAt)).limit(10),
    db.select().from(s.appointments).where(eq(s.appointments.customerId, customerId)).orderBy(desc(s.appointments.createdAt)).limit(10),
    db.select().from(s.followups).where(and(eq(s.followups.customerId, customerId), eq(s.followups.status, "pending"))).orderBy(desc(s.followups.createdAt)).limit(10),
    // Solo metadatos: nunca referencias de almacenamiento hacia el cliente web.
    db
      .select({ id: s.documents.id, docType: s.documents.docType, status: s.documents.status, requestedAt: s.documents.requestedAt, receivedAt: s.documents.receivedAt })
      .from(s.documents)
      .where(eq(s.documents.customerId, customerId)),
    loadCatalog(db, app.workspaceId),
    db
      .select({ replyMessageId: s.agentRuns.replyMessageId, knowledgeUsed: s.agentRuns.knowledgeUsed, status: s.agentRuns.status, guardReport: s.agentRuns.guardReport })
      .from(s.agentRuns)
      .where(eq(s.agentRuns.customerId, customerId))
      .orderBy(desc(s.agentRuns.createdAt))
      .limit(200),
  ]);

  const profile = (profileRow[0]?.data ?? {}) as CustomerProfile;
  const current = crmHistory.find((c) => c.isCurrent) ?? crmHistory[0];
  const interest = toCatalogVehicles(catalog).find((v) => v.model === profile.vehicle_interest);
  const nameKnown = typeof profile.name === "string" || !/^prospecto\b/i.test(customer.displayName);
  const run = lastRun[0];
  const runOutput = (run?.output ?? null) as Record<string, unknown> | null;
  const vehicleName = (vehicleId: string | null, versionId: string | null) =>
    [catalog.vehicles.find((v) => v.id === vehicleId)?.model, catalog.versions.find((v) => v.id === versionId)?.name].filter(Boolean).join(" ");

  return {
    customer: { id: customer.id, displayName: customer.displayName, phone: customer.phone, createdAt: customer.createdAt },
    conversation: { id: conversation!.id, controlMode: conversation!.controlMode, channel: conversation!.channel },
    messages,
    /** Por cada respuesta de Sofía: fuentes usadas y guardrails aplicados. */
    turns: Object.fromEntries(
      runs
        .filter((r) => r.replyMessageId)
        .map((r) => [
          r.replyMessageId!,
          {
            status: r.status,
            knowledgeUsed: r.knowledgeUsed as Array<{ refId: string; title: string; status: string; isDemo: boolean; sourceName: string | null }>,
            guard: ((r.guardReport as { violations?: Array<{ code: string }> }).violations ?? []).map((v) => v.code),
          },
        ]),
    ),
    profile: {
      version: profileRow[0]?.version ?? 0,
      knownFacts: (Object.entries(profile) as Array<[string, unknown]>)
        .filter(([k]) => isFactKey(k))
        .map(([k, v]) => ({ key: k, label: FACT_DEFS[k as FactKey].label, value: formatFactValue(k as FactKey, v as never) })),
      missingFacts: computeMissingFacts(profile, { nameKnown, hybridAvailableForInterest: Boolean(interest?.hasHybrid) }).map((m) => ({ key: m.key, label: m.label })),
      factHistory: facts.map((f) => ({ id: f.id, key: f.factKey, label: isFactKey(f.factKey) ? FACT_DEFS[f.factKey].label : f.factKey, value: f.valueText, status: f.status, source: f.source, evidence: f.evidence, createdAt: f.createdAt })),
    },
    crm: {
      stage: (current?.stage ?? "new") as CrmStage,
      stageLabel: CRM_STAGE_LABELS[(current?.stage ?? "new") as CrmStage],
      temperature: (current?.temperature ?? "cold") as Temperature,
      temperatureLabel: TEMPERATURE_LABELS[(current?.temperature ?? "cold") as Temperature],
      since: current?.createdAt ?? customer.createdAt,
      reason: current?.reason ?? "",
      history: crmHistory.map((h) => ({ id: h.id, stage: h.stage, temperature: h.temperature, previousStage: h.previousStage, previousTemperature: h.previousTemperature, reason: h.reason, changedBy: h.changedBy, createdAt: h.createdAt })),
    },
    tags: tags.map((t) => ({ tag: t.tag, label: TAG_CATALOG[t.tag as keyof typeof TAG_CATALOG] ?? t.tag, source: t.source, reason: t.reason })),
    summary: summaries[0]
      ? { text: summaries[0].summary, commitments: summaries[0].commitments, pendingItems: summaries[0].pendingItems, nextAction: summaries[0].nextAction, version: summaries[0].version }
      : null,
    lastRun: run
      ? {
          id: run.id,
          provider: run.provider,
          model: run.model,
          status: run.status,
          createdAt: run.createdAt,
          latencyMs: run.latencyMs,
          contextStats: run.contextStats,
          knowledgeUsed: run.knowledgeUsed,
          toolCalls: run.toolCalls,
          guard: run.guardReport,
          effects: run.appliedEffects,
          error: run.error,
          nextAction: runOutput?.next_action ?? null,
          requiresMario: Boolean(runOutput?.requires_mario),
          escalationReason: runOutput?.escalation_reason ?? null,
          requiresApproval: Boolean(runOutput?.requires_approval),
          requestedTools: runOutput?.requested_tools ?? [],
        }
      : null,
    quotes: quotes.map((q) => ({
      id: q.id,
      vehicle: vehicleName(q.vehicleId, q.versionId),
      calculationType: q.calculationType,
      status: q.status,
      vehiclePrice: q.vehiclePrice,
      bonus: q.bonus,
      downPayment: q.downPayment,
      termMonths: q.termMonths,
      monthlyPayment: q.monthlyPayment,
      annualRate: q.annualRate,
      openingCommission: q.openingCommission,
      insurance: q.insurance,
      conditions: q.conditions,
      validUntil: q.validUntil,
      isDemo: q.isDemo,
      trace: q.calculationTrace,
      createdAt: q.createdAt,
    })),
    alerts,
    approvals,
    appointments,
    followups,
    documents,
  };
}

export type CustomerState = Awaited<ReturnType<typeof getCustomerState>>;

/** Cambio manual de etapa/temperatura por Mario (siempre permitido, siempre registrado). */
export async function setCrmManually(app: AppContext, customerId: string, input: { stage: CrmStage; temperature: Temperature; reason: string }) {
  if (!input.reason.trim()) throw new ServiceError("Indica el motivo del cambio.");
  await app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [current] = await tx.select().from(s.crmStates).where(and(eq(s.crmStates.customerId, customerId), eq(s.crmStates.isCurrent, true)));
    await writeCrmState(tx, {
      workspaceId: app.workspaceId,
      customerId,
      from: current ? { stage: current.stage, temperature: current.temperature } : null,
      to: { stage: input.stage, temperature: input.temperature },
      reason: input.reason.trim(),
      changedBy: "mario",
    });
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId,
      actorType: "mario",
      eventType: "crm_manual_change",
      entityType: "crm_state",
      data: { stage: input.stage, temperature: input.temperature },
    });
  });
}
