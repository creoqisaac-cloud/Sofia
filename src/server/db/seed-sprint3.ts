/**
 * Datos DEMO de Sprint 3 (idempotente; `workspaces.settings.demoSeedVersion` ≥ 3).
 *
 * ⚠️ TODO es ficticio. En particular, el programa "Financiera DEMO" y sus "corridas validadas"
 * NO son datos de Mario: las corridas DEMO se generaron con el mismo motor, así que su
 * calibración demuestra el MECANISMO (comparar componente por componente), no la exactitud
 * real. Para cotizar exacto hacen falta las fuentes listadas en QUOTE_ENGINE_MISSING_INPUTS.md.
 */
import { and, eq, like } from "drizzle-orm";
import { computeQuoteV2, type FinanceProgramSpec } from "@/domain/quote-v2";
import type { AppContext } from "../app";
import { DAY_MS } from "../lib/clock";
import { createFollowup, markContacted } from "../services/agenda";
import { setPlatesRecipient } from "../services/email";
import { addPlateRequirement, ensurePlateCase, setRequirementReceived } from "../services/plates";
import { calibrateFinanceProgram, toProgramSpec } from "../services/quote-v2";
import { updateSale } from "../services/sales";
import * as s from "./schema";

const SEED_VERSION = 3;
const DEMO_NOTE = "DATO DEMO — ficticio, no representa condiciones reales de Honda ni de ninguna financiera.";

export async function seedDemoSprint3(app: AppContext): Promise<boolean> {
  const [ws] = await app.db.select().from(s.workspaces).where(eq(s.workspaces.id, app.workspaceId));
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  if (Number(settings.demoSeedVersion ?? 1) >= SEED_VERSION) return false;
  const now = app.clock.now();
  const wsId = app.workspaceId;
  const days = (n: number) => new Date(now.getTime() + n * DAY_MS);

  // ── Cotizador V2 (DEMO) ──
  const [programSrc, examplesSrc, insuranceSrc] = await app.db
    .insert(s.knowledgeSources)
    .values([
      { workspaceId: wsId, name: "DEMO — Programa Financiera DEMO (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-3) },
      { workspaceId: wsId, name: "DEMO — Corridas de ejemplo (NO REALES)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-3) },
      { workspaceId: wsId, name: "DEMO — Tabla de seguros ficticia (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-3) },
    ])
    .returning();
  const meta = { status: "confirmed" as const, sourceType: "demo_fixture" as const, isDemo: true, notes: DEMO_NOTE, validFrom: days(-15), validTo: days(45) };

  const [plan] = await app.db
    .insert(s.financePrograms)
    .values({
      workspaceId: wsId,
      lender: "Financiera DEMO",
      name: "Plan tradicional DEMO",
      bonusApplication: "price_reduction",
      ivaOnInterest: true,
      ivaRate: 0.16,
      openingCommissionRate: 0.02,
      openingCommissionFinanced: false,
      openingCommissionIva: true,
      insuranceMode: "cash",
      minDownPaymentRate: 0.2,
      modelScope: ["City", "HR-V"],
      sourceId: programSrc!.id,
      ...meta,
    })
    .returning();
  await app.db.insert(s.financeTerms).values([
    { programId: plan!.id, termMonths: 12, annualRate: 0.1099 },
    { programId: plan!.id, termMonths: 24, annualRate: 0.1199 },
    { programId: plan!.id, termMonths: 36, annualRate: 0.1299 },
    { programId: plan!.id, termMonths: 48, annualRate: 0.1349 },
    { programId: plan!.id, termMonths: 60, annualRate: 0.1399 },
  ]);
  // Programa CR-V SIN parámetros completos: muestra "Falta información…" en vez de inventar.
  const [crvPlan] = await app.db
    .insert(s.financePrograms)
    .values({ workspaceId: wsId, lender: "Financiera DEMO", name: "Plan CR-V DEMO (incompleto)", bonusApplication: "price_reduction", ivaOnInterest: null, ivaRate: 0.16, openingCommissionRate: 0.02, openingCommissionFinanced: false, openingCommissionIva: true, insuranceMode: null, modelScope: ["CR-V"], sourceId: programSrc!.id, ...meta })
    .returning();
  await app.db.insert(s.financeTerms).values([
    { programId: crvPlan!.id, termMonths: 36, annualRate: 0.1299 },
    { programId: crvPlan!.id, termMonths: 48, annualRate: null },
  ]);
  await app.db.insert(s.quoteComponentsConfig).values([
    { workspaceId: wsId, kind: "insurance", label: "Seguro anual DEMO HR-V", amount: 28_500, modelScope: ["HR-V"], sourceId: insuranceSrc!.id, ...meta },
    { workspaceId: wsId, kind: "insurance", label: "Seguro anual DEMO City", amount: 21_900, modelScope: ["City"], sourceId: insuranceSrc!.id, ...meta },
  ]);
  // Lista de precios V2 = mismos precios DEMO de Sprint 1 (con su propia fuente/vigencia).
  const [book] = await app.db.insert(s.priceBooks).values({ workspaceId: wsId, name: "Lista DEMO V2", sourceId: programSrc!.id, ...meta }).returning();
  const versions = await app.db.select({ v: s.vehicleVersions, model: s.vehicles.model }).from(s.vehicleVersions).innerJoin(s.vehicles, eq(s.vehicles.id, s.vehicleVersions.vehicleId)).where(eq(s.vehicleVersions.workspaceId, wsId));
  const offers = await app.db.select().from(s.commercialOffers).where(and(eq(s.commercialOffers.workspaceId, wsId), eq(s.commercialOffers.offerType, "list_price"), eq(s.commercialOffers.status, "confirmed")));
  const priceRows = versions
    .map(({ v }) => ({ v, offer: offers.find((o) => o.versionId === v.id && o.validTo && o.validTo > now) }))
    .filter((x) => x.offer?.amount)
    .map((x) => ({ workspaceId: wsId, priceBookId: book!.id, versionId: x.v.id, listPrice: x.offer!.amount! }));
  if (priceRows.length) await app.db.insert(s.vehiclePrices).values(priceRows);

  // Corridas "validadas" DEMO (generadas con el mismo motor — ver nota de cabecera).
  const spec: FinanceProgramSpec = toProgramSpec(plan!, await app.db.select().from(s.financeTerms).where(eq(s.financeTerms.programId, plan!.id)), "DEMO");
  const price = (model: string, version: string) => priceRows.find((r) => versions.find((x) => x.v.id === r.versionId && x.model === model && x.v.name === version))?.listPrice ?? 0;
  const examples = [
    { label: "HR-V Touring · 150,000 · 48 m (DEMO)", model: "HR-V", version: "Touring", down: 150_000, term: 48, bonus: 0, insurance: 28_500 },
    { label: "City Sport · 80,000 · 48 m (DEMO)", model: "City", version: "Sport", down: 80_000, term: 48, bonus: 40_000, insurance: 21_900 },
    { label: "City Prime · 120,000 · 36 m (DEMO)", model: "City", version: "Prime", down: 120_000, term: 36, bonus: 40_000, insurance: 21_900 },
  ];
  for (const ex of examples) {
    const vehiclePrice = price(ex.model, ex.version);
    const src = (amount: number) => ({ amount, sourceLabel: "DEMO", status: "confirmed" as const, validFrom: null, validTo: null, isDemo: true });
    const r = computeQuoteV2({ modelLabel: ex.label, downPayment: ex.down, termMonths: ex.term, price: src(vehiclePrice), bonus: ex.bonus ? src(ex.bonus) : null, program: spec, insurance: src(ex.insurance), extras: [], now });
    const pick = (k: string) => r.components.find((c) => c.key === k)?.amount ?? 0;
    await app.db.insert(s.validatedQuoteExamples).values({
      workspaceId: wsId,
      programId: plan!.id,
      versionId: versions.find((x) => x.model === ex.model && x.v.name === ex.version)?.v.id ?? null,
      label: ex.label,
      downPayment: ex.down,
      termMonths: ex.term,
      vehiclePrice,
      bonus: ex.bonus,
      insurance: ex.insurance,
      expected: { opening_commission: pick("opening_commission"), amount_financed: pick("amount_financed"), monthly_payment: pick("monthly_payment") },
      sourceLabel: examplesSrc!.name,
      quotedAt: days(-3),
      isDemo: true,
    });
  }
  await app.db.insert(s.validatedQuoteExamples).values({
    workspaceId: wsId,
    programId: crvPlan!.id,
    label: "CR-V Turbo Plus · 200,000 · 36 m (DEMO)",
    downPayment: 200_000,
    termMonths: 36,
    vehiclePrice: 620_000,
    bonus: 40_000,
    insurance: null,
    expected: { monthly_payment: 13_999 },
    sourceLabel: examplesSrc!.name,
    isDemo: true,
  });
  await calibrateFinanceProgram(app, plan!.id);
  await calibrateFinanceProgram(app, crvPlan!.id);

  // ── Operación (DEMO) ──
  const byName = async (prefix: string) => (await app.db.select().from(s.customers).where(and(eq(s.customers.workspaceId, wsId), like(s.customers.displayName, `${prefix}%`))))[0];
  const juan = await byName("Juan Pérez");
  const ana = await byName("Ana López");
  const carlos = await byName("Carlos Gómez");

  for (const label of ["Factura de la unidad", "INE del cliente", "Comprobante de domicilio", "Comprobante de pago de derechos"]) {
    const r = await addPlateRequirement(app, { label, sourceLabel: "DEMO — ejemplo, Mario debe confirmar la lista real" });
    await app.db.update(s.plateRequirements).set({ isDemo: true }).where(eq(s.plateRequirements.id, r.id));
  }
  await setPlatesRecipient(app, "placas.demo@example.com");

  if (juan) {
    const [sale] = await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.customerId, juan.id));
    if (sale) await updateSale(app, sale.id, { customerNumber: "DEMO-C-0001", vin: "DEMO0VIN000000001" }, "DEMO: datos iniciales.");
    const pc = await ensurePlateCase(app, juan.id, sale?.id ?? null);
    for (const r of pc.requirements.slice(0, 2)) await setRequirementReceived(app, pc.id, r.id, true);
    await app.db.update(s.plateCases).set({ dueDate: days(3), nextStep: "Juntar comprobante de domicilio y pago de derechos" }).where(eq(s.plateCases.id, pc.id));
  }
  if (ana) await createFollowup(app, { customerId: ana.id, dueAt: new Date(now.getTime() + 2 * 3_600_000), reason: "Pedirle el comprobante de domicilio", action: "Llamar", promisedByMario: false });
  if (carlos) {
    await markContacted(app, carlos.id, { waitingCustomer: true });
    await app.db.update(s.customers).set({ lastContactAt: new Date(now.getTime() - 2 * DAY_MS - 3_600_000) }).where(eq(s.customers.id, carlos.id));
  }

  await app.db.update(s.workspaces).set({ settings: { ...settings, demoSeedVersion: SEED_VERSION, platesEmailTo: "placas.demo@example.com" } }).where(eq(s.workspaces.id, wsId));
  return true;
}
