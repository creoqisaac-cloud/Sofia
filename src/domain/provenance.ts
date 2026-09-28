/**
 * Provenance y conflictos de datos del perfil.
 *
 * Cada valor sabe de dónde salió (fuente, tipo, estado, quién lo confirmó y
 * cuándo). Reglas:
 *  - Captura de Mario → `confirmed`; lo anterior queda `superseded` (nunca se borra).
 *  - Conversación → sustituye un valor observado (Sprint 1), pero si choca con
 *    un valor CONFIRMADO no lo pisa: ambos quedan `conflicting`.
 *  - Documento / solicitud previa / importación → si choca con el valor vigente,
 *    ambos quedan `conflicting` y Mario decide. Ninguna fuente tiene prioridad
 *    universal (p. ej. BBVA no gana siempre sobre Banorte).
 *  - Un campo en conflicto NO tiene valor vigente: no se autocompleta en nada.
 */
import type { FactSourceType, FactStatus } from "./enums";
import { normalize } from "./text";

export interface FactRowLike {
  id: string;
  value: unknown;
  status: FactStatus | string;
  source: string;
  sourceLabel: string | null;
  createdAt: Date;
  confirmedAt?: Date | null;
}

export type IncomingDecision =
  | { action: "reinforce"; factId: string }
  | { action: "insert"; status: "observed" | "confirmed"; supersede: string[] }
  | { action: "conflict"; markConflicting: string[] };

export function sameFactValue(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return normalize(a) === normalize(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

const LIVE: string[] = ["observed", "confirmed", "conflicting"];

export function decideIncoming(rows: FactRowLike[], incoming: { value: unknown; sourceType: FactSourceType }): IncomingDecision {
  const live = rows.filter((r) => LIVE.includes(r.status));
  if (incoming.sourceType === "mario_capture") {
    // Mario confirma: si ya existía ese mismo valor, se confirma esa fila; lo demás pasa a superseded.
    return { action: "insert", status: "confirmed", supersede: live.map((r) => r.id) };
  }
  const conflicting = live.filter((r) => r.status === "conflicting");
  if (conflicting.length > 0) {
    const same = conflicting.find((r) => sameFactValue(r.value, incoming.value));
    if (same) return { action: "reinforce", factId: same.id };
    return { action: "conflict", markConflicting: [] }; // un candidato más
  }
  const current = live.filter((r) => r.status === "observed" || r.status === "confirmed");
  const match = current.find((r) => sameFactValue(r.value, incoming.value));
  if (match) return { action: "reinforce", factId: match.id };
  if (current.length === 0) return { action: "insert", status: "observed", supersede: [] };
  const confirmed = current.filter((r) => r.status === "confirmed");
  if (incoming.sourceType === "customer_message" && confirmed.length === 0) {
    // Comportamiento de Sprint 1: lo último que dijo el cliente sustituye a lo observado.
    return { action: "insert", status: "observed", supersede: current.map((r) => r.id) };
  }
  return { action: "conflict", markConflicting: current.map((r) => r.id) };
}

export type FieldStatus = "confirmed" | "observed" | "conflicting" | "missing";

export interface FieldState<T = unknown> {
  status: FieldStatus;
  value: T | null;
  factId: string | null;
  sourceLabel: string | null;
  confirmedAt: Date | null;
  candidates: Array<{ factId: string; value: T; sourceLabel: string | null; source: string; createdAt: Date }>;
  history: Array<{ factId: string; value: T; status: string; sourceLabel: string | null; createdAt: Date }>;
}

/** Estado de un campo a partir de todas sus filas (orden cronológico indistinto). */
export function fieldState<T = unknown>(rows: FactRowLike[]): FieldState<T> {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const history = sorted.map((r) => ({ factId: r.id, value: r.value as T, status: String(r.status), sourceLabel: r.sourceLabel, createdAt: r.createdAt }));
  const conflicting = sorted.filter((r) => r.status === "conflicting");
  if (conflicting.length > 0) {
    return {
      status: "conflicting",
      value: null,
      factId: null,
      sourceLabel: null,
      confirmedAt: null,
      candidates: conflicting.map((r) => ({ factId: r.id, value: r.value as T, sourceLabel: r.sourceLabel, source: r.source, createdAt: r.createdAt })),
      history,
    };
  }
  const current = sorted.find((r) => r.status === "confirmed") ?? sorted.find((r) => r.status === "observed");
  if (!current) return { status: "missing", value: null, factId: null, sourceLabel: null, confirmedAt: null, candidates: [], history };
  return {
    status: current.status === "confirmed" ? "confirmed" : "observed",
    value: current.value as T,
    factId: current.id,
    sourceLabel: current.sourceLabel,
    confirmedAt: current.confirmedAt ?? null,
    candidates: [],
    history,
  };
}
