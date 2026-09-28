/**
 * Provenance y conflictos. Incluye el caso de referencia reproducido con datos
 * SINTÉTICOS (sin PII real): Fuente A (BBVA) vs Fuente B (Banorte), Mario confirma A.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideIncoming, fieldState } from "@/domain/provenance";
import * as s from "@/server/db/schema";
import { confirmFact, getProfileState, recordFacts, resolveConflict } from "@/server/services/profile";
import { makeApp, newProspect, type TestApp } from "./helpers";

const T0 = new Date("2026-09-01T00:00:00Z");
const row = (id: string, value: unknown, status: string, sourceLabel: string, minutes = 0) => ({ id, value, status, source: "credit_application", sourceLabel, createdAt: new Date(T0.getTime() + minutes * 60_000) });

describe("reglas de provenance (dominio)", () => {
  it("un documento que contradice el valor vigente genera conflicto (ninguna fuente gana sola)", () => {
    const d = decideIncoming([row("a", "X", "observed", "BBVA")], { value: "Y", sourceType: "credit_application" });
    expect(d).toEqual({ action: "conflict", markConflicting: ["a"] });
  });
  it("la conversación no pisa un dato confirmado", () => {
    const d = decideIncoming([row("a", "X", "confirmed", "Mario")], { value: "Y", sourceType: "customer_message" });
    expect(d.action).toBe("conflict");
  });
  it("la conversación sí sustituye un dato solo observado (Sprint 1)", () => {
    const d = decideIncoming([row("a", "X", "observed", "Conversación")], { value: "Y", sourceType: "customer_message" });
    expect(d).toEqual({ action: "insert", status: "observed", supersede: ["a"] });
  });
  it("un campo en conflicto no tiene valor vigente", () => {
    const st = fieldState([row("a", "X", "conflicting", "BBVA"), row("b", "Y", "conflicting", "Banorte", 1)]);
    expect(st.status).toBe("conflicting");
    expect(st.value).toBeNull();
    expect(st.candidates.map((c) => c.sourceLabel).sort()).toEqual(["BBVA", "Banorte"]);
  });
});

describe("caso de referencia (sintético): BBVA vs Banorte, Mario confirma BBVA", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("dato 1 queda confirmado, dato 2 superseded, ambos auditables y con fuente/usuario/fecha", async () => {
    const p = await newProspect(app, "Cliente Sintético");
    const A = "Solicitud BBVA previa (sintética)";
    const B = "Solicitud Banorte previa (sintética)";
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "curp", value: "TEST800101HDFXXX01" }, { key: "company_name", value: "Empresa Uno" }], sourceType: "credit_application", sourceLabel: A });
    const r = await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "curp", value: "TEST800101HDFXXX02" }, { key: "company_name", value: "Empresa Uno" }], sourceType: "credit_application", sourceLabel: B });
    expect(r.conflicts).toEqual(["curp"]);
    expect(r.unchanged).toEqual(["company_name"]); // valores iguales no generan conflicto

    let profile = await getProfileState(app.db, p.customer.id);
    const field = profile.fields.curp!;
    expect(field.state.status).toBe("conflicting");
    const bbva = field.state.candidates.find((c) => c.sourceLabel === A)!;

    await resolveConflict(app, { customerId: p.customer.id, key: "curp", chosenFactId: bbva.factId });

    profile = await getProfileState(app.db, p.customer.id);
    expect(profile.fields.curp!.state.status).toBe("confirmed");
    expect(profile.fields.curp!.state.value).toBe("TEST800101HDFXXX01");

    const rows = await app.db.select().from(s.customerFacts).where(and(eq(s.customerFacts.customerId, p.customer.id), eq(s.customerFacts.factKey, "curp")));
    expect(rows).toHaveLength(2); // nada se borra
    const confirmed = rows.find((x) => x.sourceLabel === A)!;
    const loser = rows.find((x) => x.sourceLabel === B)!;
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedBy).toBe(app.advisorUserId);
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    expect(loser.status).toBe("superseded");
    expect(loser.valueText).toBe("TEST800101HDFXXX02");

    const [audit] = await app.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.customerId, p.customer.id), eq(s.auditEvents.eventType, "fact_conflict_resolved")));
    expect(audit!.actorId).toBe(app.advisorUserId);
    expect(audit!.data).toMatchObject({ key: "curp", chosenSource: A, discardedSources: [B] });
    // La auditoría no guarda valores (PII).
    expect(JSON.stringify(audit!.data)).not.toContain("TEST800101");
  });

  it("la resolución aplica solo a ese cliente: para otros, el mismo patrón vuelve a preguntar", async () => {
    const p = await newProspect(app, "Otro Cliente Sintético");
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "work_phone", value: "5551110000" }], sourceType: "credit_application", sourceLabel: "Solicitud BBVA previa (sintética)" });
    const r = await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "work_phone", value: "5552220000" }], sourceType: "credit_application", sourceLabel: "Solicitud Banorte previa (sintética)" });
    expect(r.conflicts).toEqual(["work_phone"]); // BBVA no tiene prioridad universal
  });

  it("'Capturar otro' confirma un tercer valor y deja ambos candidatos como históricos", async () => {
    const p = await newProspect(app, "Tercer Valor");
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "email", value: "a@example.com" }], sourceType: "credit_application", sourceLabel: "Fuente A" });
    await recordFacts(app, { customerId: p.customer.id, entries: [{ key: "email", value: "b@example.com" }], sourceType: "document", sourceLabel: "Fuente B" });
    await resolveConflict(app, { customerId: p.customer.id, key: "email", manualValue: "c@example.com" });
    const st = (await getProfileState(app.db, p.customer.id)).fields.email!.state;
    expect(st.value).toBe("c@example.com");
    expect(st.history.filter((h) => h.status === "superseded")).toHaveLength(2);
  });

  it("un dato observado se puede confirmar y la conversación ya no lo pisa", async () => {
    const p = await newProspect(app, "Confirmar");
    await p.say("Hola, me interesa el City, tengo 80 mil de enganche");
    let profile = await getProfileState(app.db, p.customer.id);
    const dp = profile.fields.down_payment!;
    expect(dp.state.status).toBe("observed");
    await confirmFact(app, p.customer.id, dp.state.factId!);
    await p.say("Mejor 90 mil de enganche");
    profile = await getProfileState(app.db, p.customer.id);
    expect(profile.fields.down_payment!.state.status).toBe("conflicting");
  });
});
