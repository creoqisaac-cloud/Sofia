/**
 * Perfil universal con provenance. Todas las escrituras pasan por `customer_facts`
 * (bitácora) y `customer_profiles.data` es solo la proyección de valores vigentes
 * (observed/confirmed). Los campos en conflicto NO forman parte de la proyección.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { FactSourceType } from "@/domain/enums";
import { FACT_DEFS, formatFactValue, isFactKey, normalizeFactValue, type FactKey, type FactValue } from "@/domain/facts";
import { decideIncoming, fieldState, sameFactValue, type FieldState } from "@/domain/provenance";
import { PROFILE_FIELD_DEFS, PROFILE_SECTIONS, PROFILE_SECTION_LABELS, type ProfileSection } from "@/domain/profile-fields";
import type { AppContext } from "../app";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "./errors";

type FactRow = typeof s.customerFacts.$inferSelect;

/** Recalcula `customer_profiles.data` desde la bitácora. */
export async function rebuildProfile(tx: Db, workspaceId: string, customerId: string): Promise<Record<string, unknown>> {
  const rows = await tx.select().from(s.customerFacts).where(eq(s.customerFacts.customerId, customerId)).orderBy(asc(s.customerFacts.createdAt));
  const byKey = new Map<string, FactRow[]>();
  for (const r of rows) byKey.set(r.factKey, [...(byKey.get(r.factKey) ?? []), r]);
  const data: Record<string, unknown> = {};
  for (const [key, list] of byKey) {
    const st = fieldState(list);
    if (st.status === "confirmed" || st.status === "observed") data[key] = st.value;
  }
  const [existing] = await tx.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId));
  if (existing) {
    await tx.update(s.customerProfiles).set({ data, version: existing.version + 1, updatedAt: new Date() }).where(eq(s.customerProfiles.id, existing.id));
  } else {
    await tx.insert(s.customerProfiles).values({ workspaceId, customerId, data });
  }
  return data;
}

export interface RecordFactsInput {
  customerId: string;
  entries: Array<{ key: string; value: string | number | null; confidence?: "high" | "medium" | "low" }>;
  sourceType: FactSourceType;
  sourceLabel: string;
  sourceRefId?: string | null;
}

export interface RecordFactsResult {
  saved: string[];
  unchanged: string[];
  conflicts: string[];
  cleared: string[];
  rejected: Array<{ key: string; reason: string }>;
}

async function assertCustomer(db: Db, workspaceId: string, customerId: string) {
  const [c] = await db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, workspaceId)));
  if (!c) throw new ServiceError("Cliente no encontrado.", 404);
}

/** Registra datos con su fuente aplicando las reglas de provenance/conflicto. */
export async function recordFacts(app: AppContext, input: RecordFactsInput, txIn?: Db): Promise<RecordFactsResult> {
  const run = async (tx: Db): Promise<RecordFactsResult> => {
    await assertCustomer(tx, app.workspaceId, input.customerId);
    const result: RecordFactsResult = { saved: [], unchanged: [], conflicts: [], cleared: [], rejected: [] };
    const now = new Date();
    for (const entry of input.entries) {
      if (!isFactKey(entry.key)) {
        result.rejected.push({ key: entry.key, reason: "campo desconocido" });
        continue;
      }
      const key = entry.key as FactKey;
      const rows = await tx
        .select()
        .from(s.customerFacts)
        .where(and(eq(s.customerFacts.customerId, input.customerId), eq(s.customerFacts.factKey, key)));
      const raw = entry.value === null || entry.value === undefined ? "" : String(entry.value).trim();
      if (raw === "") {
        // Vaciar un campo solo lo puede hacer Mario; el historial se conserva.
        const live = rows.filter((r) => ["observed", "confirmed", "conflicting"].includes(r.status));
        if (input.sourceType === "mario_capture" && live.length) {
          await tx.update(s.customerFacts).set({ status: "superseded", updatedAt: now }).where(inArray(s.customerFacts.id, live.map((r) => r.id)));
          result.cleared.push(key);
        }
        continue;
      }
      const norm = normalizeFactValue(key, raw, typeof entry.value === "number" ? entry.value : null);
      if (!norm.ok) {
        result.rejected.push({ key, reason: norm.reason });
        continue;
      }
      // Mario re-guarda un valor que ya está confirmado → sin cambios (no se duplica historial).
      if (input.sourceType === "mario_capture" && rows.some((r) => r.status === "confirmed" && sameFactValue(r.value, norm.value)) && !rows.some((r) => r.status === "conflicting")) {
        result.unchanged.push(key);
        continue;
      }
      const decision = decideIncoming(rows, { value: norm.value, sourceType: input.sourceType });
      if (decision.action === "reinforce") {
        result.unchanged.push(key);
        continue;
      }
      const isMario = input.sourceType === "mario_capture";
      // Mario confirma un valor que ya existía (p. ej. "Usar BBVA") → se confirma esa fila en vez de duplicarla.
      const sameExisting = isMario ? rows.find((r) => ["observed", "conflicting"].includes(r.status) && sameFactValue(r.value, norm.value)) : undefined;
      let newId: string;
      if (sameExisting) {
        await tx
          .update(s.customerFacts)
          .set({ status: "confirmed", confirmedBy: app.advisorUserId, confirmedAt: now, updatedAt: now })
          .where(eq(s.customerFacts.id, sameExisting.id));
        newId = sameExisting.id;
      } else {
        const [row] = await tx
          .insert(s.customerFacts)
          .values({
            workspaceId: app.workspaceId,
            customerId: input.customerId,
            factKey: key,
            value: norm.value,
            valueText: norm.valueText,
            confidence: isMario ? "high" : (entry.confidence ?? "medium"),
            source: input.sourceType,
            sourceRefId: input.sourceRefId ?? null,
            sourceLabel: input.sourceLabel,
            status: decision.action === "conflict" ? "conflicting" : decision.status,
            confirmedBy: isMario ? app.advisorUserId : null,
            confirmedAt: isMario ? now : null,
          })
          .returning({ id: s.customerFacts.id });
        newId = row!.id;
      }
      if (decision.action === "insert" && decision.supersede.length) {
        const ids = decision.supersede.filter((id) => id !== newId);
        if (ids.length) await tx.update(s.customerFacts).set({ status: "superseded", supersededBy: newId, updatedAt: now }).where(inArray(s.customerFacts.id, ids));
      }
      if (decision.action === "conflict") {
        if (decision.markConflicting.length) {
          await tx.update(s.customerFacts).set({ status: "conflicting", updatedAt: now }).where(inArray(s.customerFacts.id, decision.markConflicting));
        }
        result.conflicts.push(key);
      } else {
        result.saved.push(key);
      }
    }
    await rebuildProfile(tx, app.workspaceId, input.customerId);
    // Auditoría: solo claves y fuente, nunca valores (PII).
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: input.customerId,
      actorType: input.sourceType === "mario_capture" ? "mario" : "system",
      actorId: input.sourceType === "mario_capture" ? app.advisorUserId : null,
      eventType: "profile_facts_recorded",
      entityType: "customer",
      entityId: input.customerId,
      data: { source: input.sourceType, sourceLabel: input.sourceLabel, saved: result.saved, conflicts: result.conflicts, cleared: result.cleared, rejected: result.rejected.map((r) => r.key) },
    });
    return result;
  };
  if (txIn) return run(txIn);
  const result = await app.db.transaction((tx) => run(tx as unknown as Db));
  await refreshApplications(app, input.customerId);
  return result;
}

/** Tras cambiar el perfil, las solicitudes abiertas recalculan su estado (import diferido: evita ciclo). */
async function refreshApplications(app: AppContext, customerId: string) {
  const { refreshCustomerApplications } = await import("./credit");
  await refreshCustomerApplications(app, customerId);
}

/**
 * Resolver un conflicto: Mario elige una fuente ("Usar BBVA") o captura otro valor.
 * Nada se borra: el elegido queda `confirmed`, los demás `superseded`.
 */
export async function resolveConflict(
  app: AppContext,
  input: { customerId: string; key: string; chosenFactId?: string; manualValue?: string },
) {
  if (!isFactKey(input.key)) throw new ServiceError("Campo desconocido.");
  if (!input.chosenFactId && !input.manualValue?.trim()) throw new ServiceError("Elige una opción o captura un valor.");
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await assertCustomer(tx, app.workspaceId, input.customerId);
    const rows = await tx
      .select()
      .from(s.customerFacts)
      .where(and(eq(s.customerFacts.customerId, input.customerId), eq(s.customerFacts.factKey, input.key)));
    const live = rows.filter((r) => ["observed", "confirmed", "conflicting"].includes(r.status));
    const now = new Date();
    let chosen: FactRow;
    if (input.chosenFactId) {
      const found = live.find((r) => r.id === input.chosenFactId);
      if (!found) throw new ServiceError("La opción elegida ya no está vigente.", 409);
      await tx
        .update(s.customerFacts)
        .set({ status: "confirmed", confirmedBy: app.advisorUserId, confirmedAt: now, updatedAt: now })
        .where(eq(s.customerFacts.id, found.id));
      chosen = found;
    } else {
      const norm = normalizeFactValue(input.key as FactKey, input.manualValue!.trim(), null);
      if (!norm.ok) throw new ServiceError(norm.reason);
      const [row] = await tx
        .insert(s.customerFacts)
        .values({
          workspaceId: app.workspaceId,
          customerId: input.customerId,
          factKey: input.key,
          value: norm.value,
          valueText: norm.valueText,
          confidence: "high",
          source: "mario_capture",
          sourceLabel: "Captura de Mario (resolución de conflicto)",
          status: "confirmed",
          confirmedBy: app.advisorUserId,
          confirmedAt: now,
        })
        .returning();
      chosen = row!;
    }
    const losers = live.filter((r) => r.id !== chosen.id);
    if (losers.length) {
      await tx.update(s.customerFacts).set({ status: "superseded", supersededBy: chosen.id, updatedAt: now }).where(inArray(s.customerFacts.id, losers.map((r) => r.id)));
    }
    await rebuildProfile(tx, app.workspaceId, input.customerId);
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: input.customerId,
      actorType: "mario",
      actorId: app.advisorUserId,
      eventType: "fact_conflict_resolved",
      entityType: "customer_fact",
      entityId: chosen.id,
      data: {
        key: input.key,
        chosenSource: chosen.sourceLabel,
        manual: !input.chosenFactId,
        discardedSources: losers.map((l) => l.sourceLabel),
        resolvedAt: now.toISOString(),
      },
    });
    return { chosenFactId: chosen.id, supersededFactIds: losers.map((l) => l.id) };
  }).then(async (r) => {
    await refreshApplications(app, input.customerId);
    return r;
  });
}

/** Confirmar varios datos observados de una vez (p. ej. todos los leídos de una solicitud previa). */
export async function confirmFacts(app: AppContext, customerId: string, factIds: string[]) {
  if (!factIds.length) return 0;
  const n = await app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const rows = await tx
      .select()
      .from(s.customerFacts)
      .where(and(inArray(s.customerFacts.id, factIds), eq(s.customerFacts.customerId, customerId), eq(s.customerFacts.workspaceId, app.workspaceId), eq(s.customerFacts.status, "observed")));
    if (!rows.length) return 0;
    const now = new Date();
    await tx.update(s.customerFacts).set({ status: "confirmed", confirmedBy: app.advisorUserId, confirmedAt: now, updatedAt: now }).where(inArray(s.customerFacts.id, rows.map((r) => r.id)));
    await rebuildProfile(tx, app.workspaceId, customerId);
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId,
      actorType: "mario",
      actorId: app.advisorUserId,
      eventType: "fact_confirmed",
      entityType: "customer",
      entityId: customerId,
      data: { keys: rows.map((r) => r.factKey), sources: Array.from(new Set(rows.map((r) => r.sourceLabel ?? r.source))) },
    });
    return rows.length;
  });
  await refreshApplications(app, customerId);
  return n;
}

/** Confirmar un dato observado (p. ej. dicho en conversación). */
export async function confirmFact(app: AppContext, customerId: string, factId: string) {
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [row] = await tx
      .select()
      .from(s.customerFacts)
      .where(and(eq(s.customerFacts.id, factId), eq(s.customerFacts.customerId, customerId), eq(s.customerFacts.workspaceId, app.workspaceId)));
    if (!row) throw new ServiceError("Dato no encontrado.", 404);
    if (row.status !== "observed") throw new ServiceError("Solo se confirman datos observados.", 409);
    const now = new Date();
    await tx.update(s.customerFacts).set({ status: "confirmed", confirmedBy: app.advisorUserId, confirmedAt: now, updatedAt: now }).where(eq(s.customerFacts.id, factId));
    await rebuildProfile(tx, app.workspaceId, customerId);
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId,
      actorType: "mario",
      actorId: app.advisorUserId,
      eventType: "fact_confirmed",
      entityType: "customer_fact",
      entityId: factId,
      data: { key: row.factKey, source: row.sourceLabel ?? row.source },
    });
  });
  await refreshApplications(app, customerId);
}

export interface ProfileFieldView {
  key: string;
  label: string;
  section: ProfileSection;
  kind: string;
  sensitive: boolean;
  inputMode?: string;
  enumOptions?: Array<{ value: string; label: string }>;
  state: FieldState<FactValue> & { display: string | null };
}

/** Estado completo del perfil universal, por sección (para UI y crédito). */
export async function getProfileState(db: Db, customerId: string): Promise<{ fields: Record<string, ProfileFieldView>; sections: Array<{ section: ProfileSection; label: string; keys: string[] }> }> {
  const rows = await db.select().from(s.customerFacts).where(eq(s.customerFacts.customerId, customerId));
  const byKey = new Map<string, FactRow[]>();
  for (const r of rows) byKey.set(r.factKey, [...(byKey.get(r.factKey) ?? []), r]);
  const fields: Record<string, ProfileFieldView> = {};
  const keys = Array.from(new Set([...Object.keys(PROFILE_FIELD_DEFS), ...byKey.keys()])).filter(isFactKey);
  for (const key of keys) {
    const def = FACT_DEFS[key];
    const st = fieldState<FactValue>(byKey.get(key) ?? []);
    const pdef = PROFILE_FIELD_DEFS[key];
    fields[key] = {
      key,
      label: def.label,
      section: pdef?.section ?? "personal",
      kind: def.kind,
      sensitive: Boolean(def.sensitive),
      inputMode: pdef?.inputMode,
      enumOptions: def.enumValues?.map((v) => ({ value: v, label: def.enumLabels?.[v] ?? v })),
      state: { ...st, display: st.value !== null && st.value !== undefined ? formatFactValue(key, st.value) : null },
    };
  }
  const sections = PROFILE_SECTIONS.map((section) => ({
    section,
    label: PROFILE_SECTION_LABELS[section],
    keys: Object.values(PROFILE_FIELD_DEFS)
      .filter((d) => d.section === section)
      .map((d) => d.key as string),
  }));
  return { fields, sections };
}

/**
 * Mario IGNORA un dato leído (p. ej. de un documento): deja de estar vigente pero queda en el
 * historial. Si era parte de un conflicto con un solo candidato restante, ese se queda observado.
 */
export async function ignoreFact(app: AppContext, customerId: string, factId: string) {
  await app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [row] = await tx.select().from(s.customerFacts).where(and(eq(s.customerFacts.id, factId), eq(s.customerFacts.customerId, customerId), eq(s.customerFacts.workspaceId, app.workspaceId)));
    if (!row) throw new ServiceError("Dato no encontrado.", 404);
    if (row.status === "confirmed") throw new ServiceError("Un dato confirmado se corrige capturando otro valor.", 409);
    const now = new Date();
    await tx.update(s.customerFacts).set({ status: "superseded", updatedAt: now }).where(eq(s.customerFacts.id, factId));
    const others = await tx.select().from(s.customerFacts).where(and(eq(s.customerFacts.customerId, customerId), eq(s.customerFacts.factKey, row.factKey), eq(s.customerFacts.status, "conflicting")));
    if (others.length === 1) await tx.update(s.customerFacts).set({ status: "observed", updatedAt: now }).where(eq(s.customerFacts.id, others[0]!.id));
    await tx.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "fact_ignored", entityType: "customer_fact", entityId: factId, customerId, data: { key: row.factKey, source: row.sourceLabel } });
    await rebuildProfile(tx, app.workspaceId, customerId);
  });
  const { refreshCustomerApplications } = await import("./credit");
  await refreshCustomerApplications(app, customerId);
}
