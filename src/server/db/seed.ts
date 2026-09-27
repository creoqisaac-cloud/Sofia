/**
 * Datos DEMO para probar a Sofía.
 *
 * ⚠️ TODO LO DE ESTE ARCHIVO ES FICTICIO. Precios, bonos, tasas, seguros y
 * corridas son inventados, están marcados `is_demo = true`, sus fuentes se
 * llaman "DEMO — …" y NO representan información comercial real de Honda.
 *
 * Las vigencias son relativas a `now` para que el escenario siempre tenga
 * datos vigentes, vencidos y futuros.
 */
import { eq } from "drizzle-orm";
import type { InfoStatus } from "../../domain/enums";
import type { Db } from "./client";
import * as s from "./schema";
import { DAY_MS } from "../lib/clock";

export const DEMO_WORKSPACE_SLUG = "mario-abarca";

const DEMO_NOTE = "DATO DEMO FICTICIO — solo para pruebas. No usar con clientes reales.";

export async function seedDemo(db: Db, opts: { now: Date }): Promise<{ workspaceId: string; created: boolean }> {
  const existing = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, DEMO_WORKSPACE_SLUG));
  if (existing[0]) return { workspaceId: existing[0].id, created: false };

  const now = opts.now.getTime();
  const days = (n: number) => new Date(now + n * DAY_MS);

  const [ws] = await db
    .insert(s.workspaces)
    .values({ name: "Mario Abarca · Honda (DEMO)", slug: DEMO_WORKSPACE_SLUG, settings: { advisorName: "Mario Abarca", brand: "Honda" } })
    .returning();
  const workspaceId = ws!.id;

  await db.insert(s.users).values({ workspaceId, name: "Mario Abarca", role: "owner" });

  const demo = { isDemo: true, sourceType: "demo_fixture" as const, notes: DEMO_NOTE };

  const [priceSrc, promoSrc, rateSrc, quoteSrc, insSrc, catalogSrc] = await db
    .insert(s.knowledgeSources)
    .values([
      { workspaceId, name: "DEMO — Lista de precios ficticia (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-10) },
      { workspaceId, name: "DEMO — Boletín de promociones ficticio (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-10) },
      { workspaceId, name: "DEMO — Tasas de Financiera DEMO (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-20) },
      { workspaceId, name: "DEMO — Corrida validada ficticia (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-5) },
      { workspaceId, name: "DEMO — Aseguradora DEMO (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-20) },
      { workspaceId, name: "DEMO — Catálogo técnico ficticio (NO REAL)", sourceType: "demo_fixture", isDemo: true, notes: DEMO_NOTE, receivedAt: days(-30) },
    ])
    .returning();

  // ── Vehículos ──
  const [city, hrv, crv, civic] = await db
    .insert(s.vehicles)
    .values([
      { workspaceId, model: "City", modelYear: 2026, segment: "Sedán subcompacto", aliases: [], isDemo: true, notes: DEMO_NOTE },
      { workspaceId, model: "HR-V", modelYear: 2026, segment: "SUV subcompacta", aliases: ["HRV", "HR V"], isDemo: true, notes: DEMO_NOTE },
      { workspaceId, model: "CR-V", modelYear: 2026, segment: "SUV compacta", aliases: ["CRV", "CR V"], isDemo: true, notes: DEMO_NOTE },
      { workspaceId, model: "Civic", modelYear: 2026, segment: "Sedán compacto", aliases: [], isDemo: true, notes: DEMO_NOTE },
    ])
    .returning();

  const versionMeta = { ...demo, status: "confirmed" as const, sourceId: catalogSrc!.id, validFrom: days(-60), validTo: null };
  const versions = await db
    .insert(s.vehicleVersions)
    .values([
      { workspaceId, vehicleId: city!.id, name: "Uniq", powertrain: "gas", transmission: "CVT", seats: 5, features: ["cámara de reversa (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: city!.id, name: "Sport", powertrain: "gas", transmission: "CVT", seats: 5, features: ["cámara de reversa (DEMO)", "pantalla táctil con Apple CarPlay / Android Auto (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: city!.id, name: "Prime", powertrain: "gas", transmission: "CVT", seats: 5, features: ["cámara de reversa (DEMO)", "pantalla táctil con Apple CarPlay / Android Auto (DEMO)", "asientos de piel (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: hrv!.id, name: "Uniq", powertrain: "gas", transmission: "CVT", seats: 5, features: ["cámara de reversa (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: hrv!.id, name: "Touring", powertrain: "gas", transmission: "CVT", seats: 5, features: ["cámara de reversa (DEMO)", "quemacocos (DEMO)", "asistencias de manejo (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: crv!.id, name: "Turbo Plus", powertrain: "gas", transmission: "CVT", seats: 5, features: ["asistencias de manejo (DEMO)", "cajuela amplia (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: crv!.id, name: "Hybrid Touring", powertrain: "hybrid", transmission: "e-CVT", seats: 5, features: ["motor híbrido (DEMO)", "asistencias de manejo (DEMO)"], ...versionMeta },
      { workspaceId, vehicleId: civic!.id, name: "Sport", powertrain: "gas", transmission: "CVT", seats: 5, features: ["pantalla táctil (DEMO)"], ...versionMeta },
    ])
    .returning();
  const v = (vehicleId: string, name: string) => versions.find((x) => x.vehicleId === vehicleId && x.name === name)!;

  // ── Precios de lista (DEMO) ──
  const currentPrice = { ...demo, status: "confirmed" as InfoStatus, sourceId: priceSrc!.id, validFrom: days(-15), validTo: days(45) };
  const listPrice = (vehicleId: string, versionName: string, model: string, amount: number, override: Partial<typeof currentPrice> = {}) => ({
    workspaceId,
    vehicleId,
    versionId: v(vehicleId, versionName).id,
    offerType: "list_price" as const,
    title: `Precio de lista DEMO ${model} ${versionName}`,
    amount,
    modelScope: [model],
    versionScope: [versionName],
    ...currentPrice,
    ...override,
  });
  await db.insert(s.commercialOffers).values([
    listPrice(city!.id, "Uniq", "City", 290_000),
    listPrice(city!.id, "Sport", "City", 320_000),
    listPrice(city!.id, "Prime", "City", 350_000),
    listPrice(hrv!.id, "Uniq", "HR-V", 450_000),
    listPrice(hrv!.id, "Touring", "HR-V", 520_000),
    listPrice(crv!.id, "Turbo Plus", "CR-V", 620_000),
    // Precio solo ESTIMADO (no confirmado):
    listPrice(crv!.id, "Hybrid Touring", "CR-V", 780_000, { status: "estimate", notes: `${DEMO_NOTE} Precio aproximado, pendiente de lista oficial.` }),
    // Precio VENCIDO (lista anterior):
    listPrice(civic!.id, "Sport", "Civic", 480_000, { validFrom: days(-120), validTo: days(-30), notes: `${DEMO_NOTE} Lista anterior, ya vencida.` }),
  ]);

  // ── Bonos y promociones (DEMO) ──
  const [cityBonus, , crvBonus] = await db
    .insert(s.commercialOffers)
    .values([
      {
        workspaceId, vehicleId: city!.id, versionId: null, offerType: "bonus", title: "Bono DEMO City", amount: 40_000,
        conditions: "Aplica a todas las versiones City. No depende del enganche.", modelScope: ["City"],
        ...demo, status: "confirmed", sourceId: promoSrc!.id, validFrom: days(-15), validTo: days(45),
      },
      {
        workspaceId, vehicleId: hrv!.id, versionId: null, offerType: "bonus", title: "Bono DEMO HR-V (campaña anterior)", amount: 35_000,
        conditions: "Campaña terminada.", modelScope: ["HR-V"],
        ...demo, status: "confirmed", sourceId: promoSrc!.id, validFrom: days(-60), validTo: days(-5),
      },
      {
        workspaceId, vehicleId: crv!.id, versionId: null, offerType: "bonus", title: "Bono DEMO CR-V", amount: 30_000,
        conditions: "Aplica a CR-V. Bono adicional solo con Financiera DEMO (regla explícita).", modelScope: ["CR-V"],
        ...demo, status: "confirmed", sourceId: promoSrc!.id, validFrom: days(-15), validTo: days(45),
      },
      {
        workspaceId, vehicleId: hrv!.id, versionId: null, offerType: "promotion", title: "Primer servicio de mantenimiento sin costo (DEMO)", amount: null,
        conditions: "Promoción DEMO no monetaria.", modelScope: ["HR-V"],
        ...demo, status: "confirmed", sourceId: promoSrc!.id, validFrom: days(-15), validTo: days(45),
      },
    ])
    .returning();

  await db.insert(s.promotionRules).values([
    {
      workspaceId, offerId: crvBonus!.id, ruleType: "bonus_adjustment", name: "DEMO: +10,000 de bono CR-V financiando con Financiera DEMO",
      condition: { payment_method: "financing", lender: "Financiera DEMO" }, effect: { add_bonus_amount: 10_000 }, priority: 10,
      ...demo, status: "confirmed", sourceId: promoSrc!.id, validFrom: days(-15), validTo: days(45), modelScope: ["CR-V"],
    },
    {
      workspaceId, offerId: cityBonus!.id, ruleType: "bonus_adjustment", name: "DEMO: bono City 60,000 con enganche ≥ 50% (VENCIDA)",
      condition: { min_down_payment_pct: 0.5 }, effect: { set_bonus_amount: 60_000 }, priority: 10,
      ...demo, status: "confirmed", sourceId: promoSrc!.id, validFrom: days(-90), validTo: days(-31), modelScope: ["City"],
    },
    {
      workspaceId, offerId: cityBonus!.id, ruleType: "bonus_adjustment", name: "DEMO: rumor de bono City 50,000 fin de mes (NO confirmado)",
      condition: {}, effect: { set_bonus_amount: 50_000 }, priority: 20,
      ...demo, status: "estimate", sourceId: promoSrc!.id, validFrom: days(-5), validTo: days(25), modelScope: ["City"],
    },
  ]);

  // ── Financiamiento (DEMO) ──
  const [finDemo] = await db
    .insert(s.financingRules)
    .values([
      {
        workspaceId, lender: "Financiera DEMO", productName: "Crédito Auto DEMO", annualRate: 0.139, allowedTerms: [12, 24, 36, 48, 60],
        minDownPaymentPct: 0.1, openingCommissionPct: 0.02, requiresInsurance: true,
        ...demo, status: "confirmed", sourceId: rateSrc!.id, validFrom: days(-30), validTo: days(60),
      },
      {
        workspaceId, lender: "Banco Ficticio DEMO", productName: "Tasa promocional anterior", annualRate: 0.119, allowedTerms: [12, 24, 36],
        minDownPaymentPct: 0.2, openingCommissionPct: 0.015, requiresInsurance: true,
        ...demo, status: "confirmed", sourceId: rateSrc!.id, validFrom: days(-120), validTo: days(-10),
        notes: `${DEMO_NOTE} Tasa vencida.`,
      },
    ])
    .returning();

  await db.insert(s.insuranceRules).values({
    workspaceId, insurer: "Aseguradora DEMO", coverage: "Amplia", annualPremium: null, pctOfVehiclePrice: 0.035,
    ...demo, status: "estimate", sourceId: insSrc!.id, validFrom: days(-30), validTo: days(60),
    notes: `${DEMO_NOTE} Prima aproximada: 3.5% del valor del auto.`,
  });

  // ── Corrida validada (DEMO) ──
  await db.insert(s.quoteTemplates).values({
    workspaceId, name: "Corrida DEMO City Sport · enganche 80,000 · 48 meses", vehicleId: city!.id, versionId: v(city!.id, "Sport").id,
    financingRuleId: finDemo!.id, vehiclePrice: 320_000, downPayment: 80_000, termMonths: 48, monthlyPayment: 5_890,
    annualRate: 0.139, bonus: 40_000, openingCommission: 4_000, insurance: 11_200, plates: null, otherConcepts: [],
    conditions: "Corrida DEMO previamente validada con Financiera DEMO. Sujeta a aprobación de crédito.",
    modelScope: ["City"], versionScope: ["Sport"],
    ...demo, status: "validated_quote", sourceId: quoteSrc!.id, validFrom: days(-5), validTo: days(20),
  });

  // ── Conocimiento general (DEMO) ──
  await db.insert(s.knowledgeItems).values([
    {
      workspaceId, category: "policy", title: "Proceso de crédito (DEMO)",
      content: "La documentación de crédito se solicita un documento a la vez: primero INE; después comprobante de domicilio; luego comprobante de ingresos. La aprobación la da la financiera.",
      keywords: ["documentos", "papeles", "requisitos", "credito"], ...demo, status: "confirmed", sourceId: rateSrc!.id, validFrom: days(-60), validTo: null,
    },
    {
      workspaceId, category: "availability", title: "Inventario CR-V Hybrid (DEMO)",
      content: "No hay confirmación de inventario ni de colores disponibles. Debe verificarse con Mario antes de responder.",
      keywords: ["disponible", "existencia", "color", "entrega"], modelScope: ["CR-V"], ...demo, status: "unknown", sourceId: catalogSrc!.id, validFrom: null, validTo: null,
    },
    {
      workspaceId, category: "faq", title: "Horario de la agencia (DEMO)",
      content: "Agencia DEMO: lunes a sábado de 9:00 a 19:00, domingo de 10:00 a 15:00 (horario ficticio).",
      keywords: ["horario", "abren", "agencia", "visita"], ...demo, status: "confirmed", sourceId: catalogSrc!.id, validFrom: days(-60), validTo: null,
    },
    {
      workspaceId, category: "feature", title: "Rendimiento City (DEMO)",
      content: "Rendimiento combinado DEMO del City: 20 km/l (cifra ficticia de prueba).",
      keywords: ["rendimiento", "km por litro", "gasolina", "consumo"], modelScope: ["City"], ...demo, status: "confirmed", sourceId: catalogSrc!.id, validFrom: days(-60), validTo: null,
    },
  ]);

  return { workspaceId, created: true };
}
