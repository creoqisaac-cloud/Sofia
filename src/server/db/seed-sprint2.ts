/**
 * Datos DEMO de Sprint 2 (idempotente; se marca en workspaces.settings.demoSeedVersion).
 *
 * ⚠️ TODO es ficticio: nombres con "(DEMO)", RFC/CURP con prefijo DEMO, teléfonos 555…,
 * correos @example.com, domicilios "Calle Demo". Las plantillas PDF son SINTÉTICAS
 * (no son los formatos reales de BBVA/Banorte) y las reglas documentales son de ejemplo.
 */
import { eq } from "drizzle-orm";
import type { AppContext } from "../app";
import { computeQuote } from "../commercial/quoting";
import { loadCatalog } from "../commercial/catalog";
import * as s from "./schema";
import { DAY_MS } from "../lib/clock";
import { createCustomer, setCrmManually } from "../services/customers";
import { recordFacts } from "../services/profile";
import { createApplication, ensureDemoTemplates, ensureInstitution, setApplicationStatus } from "../services/credit";
import { setDocumentStatus } from "../services/documents";
import { attachValidatedQuote } from "../services/quotes";
import { createSale, updateSale } from "../services/sales";

const SEED_VERSION = 2;

type Entries = Record<string, string | number>;

function person(n: number, first: string, paternal: string, extra: Entries = {}): Entries {
  const d = String(n).padStart(2, "0");
  return {
    first_name: first,
    paternal_last_name: paternal,
    maternal_last_name: "Demo",
    birth_date: `1990-01-${d}`,
    nationality: "Mexicana",
    gender: "male",
    marital_status: "married",
    dependents: 2,
    rfc: `DEMO9001${d}AB1`,
    curp: `DEMO9001${d}HDFXXX0${n % 10}`,
    education_level: "bachelor",
    profession: "Ingeniero",
    mobile_phone: `55500000${d}`,
    email: `${first.toLowerCase()}.demo@example.com`,
    street: "Calle Demo",
    exterior_number: String(100 + n),
    neighborhood: "Colonia Demo",
    municipality: "Municipio Demo",
    city: "Ciudad Demo",
    state: "Estado Demo",
    postal_code: "01000",
    housing_status: "owned",
    residence_years: 5,
    residence_months: 0,
    company_name: "Empresa Demo SA",
    company_activity: "Servicios",
    company_type: "private",
    employment_status: "employed",
    occupation_type: "Empleado",
    job_title: "Gerente",
    monthly_fixed_income: 45_000,
    monthly_variable_income: 5_000,
    employment_years: 6,
    employment_months: 0,
    work_phone: "5550001000",
    work_street: "Avenida Demo",
    work_exterior_number: "500",
    work_neighborhood: "Colonia Laboral Demo",
    work_municipality: "Municipio Demo",
    work_city: "Ciudad Demo",
    work_state: "Estado Demo",
    work_postal_code: "02000",
    reference_1_name: "Referencia Uno Demo",
    reference_1_phone: "5550002001",
    reference_1_relationship: "Hermano",
    reference_2_name: "Referencia Dos Demo",
    reference_2_phone: "5550002002",
    reference_2_relationship: "Amigo",
    ...extra,
  };
}

const toEntries = (e: Entries) => Object.entries(e).map(([key, value]) => ({ key, value }));

export async function seedDemoSprint2(app: AppContext): Promise<boolean> {
  const [ws] = await app.db.select().from(s.workspaces).where(eq(s.workspaces.id, app.workspaceId));
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  if (Number(settings.demoSeedVersion ?? 1) >= SEED_VERSION) return false;
  const now = app.clock.now();

  // Financieras + plantillas sintéticas.
  await ensureDemoTemplates(app);
  const banorte = await ensureInstitution(app.db, app.workspaceId, "BANORTE", "Banorte");
  const DEMO_RULES = "DEMO — reglas documentales de ejemplo (verificar contra la solicitud Banorte real)";
  await app.db.insert(s.documentRequirements).values([
    { workspaceId: app.workspaceId, institutionId: banorte.id, customerType: "all", documentType: "ine", description: "Identificación oficial vigente", source: DEMO_RULES, version: "demo-1", isDemo: true },
    { workspaceId: app.workspaceId, institutionId: banorte.id, customerType: "all", documentType: "proof_of_address", description: "Comprobante de domicilio reciente", source: DEMO_RULES, version: "demo-1", isDemo: true },
    { workspaceId: app.workspaceId, institutionId: banorte.id, customerType: "employed", documentType: "proof_of_income", description: "Comprobantes de ingresos recientes (asalariado)", source: DEMO_RULES, version: "demo-1", isDemo: true },
    { workspaceId: app.workspaceId, institutionId: banorte.id, customerType: "self_employed", documentType: "bank_statement", description: "Estados de cuenta recientes (independiente)", source: DEMO_RULES, version: "demo-1", isDemo: true },
    { workspaceId: app.workspaceId, institutionId: banorte.id, customerType: "self_employed", documentType: "tax_id", description: "Constancia de situación fiscal (independiente)", source: DEMO_RULES, version: "demo-1", isDemo: true },
  ]);

  const mark = async (customerId: string) => app.db.update(s.customers).set({ isDemo: true }).where(eq(s.customers.id, customerId));
  const capture = (customerId: string, entries: Entries, sourceLabel = "Captura de Mario (DEMO)") =>
    recordFacts(app, { customerId, entries: toEntries(entries), sourceType: "mario_capture", sourceLabel });

  // 1) Juan: crédito BBVA aprobado, venta aprobada sin pedido → prioridad alta.
  const juan = await createCustomer(app, { displayName: "Juan Pérez (DEMO)" });
  await mark(juan.customer.id);
  await capture(juan.customer.id, { ...person(1, "Juan", "Pérez"), vehicle_interest: "City", version: "Sport", payment_method: "financing", down_payment: 80_000 });
  await setCrmManually(app, juan.customer.id, { stage: "closing", temperature: "very_hot", reason: "DEMO: crédito aprobado, listo para cierre." });
  const juanQuote = await attachValidatedQuote(app, juan.customer.id, (await loadCatalog(app.db, app.workspaceId)).templates[0]!.id);
  const juanApp = await createApplication(app, { customerId: juan.customer.id, institutionCode: "BBVA", quoteId: juanQuote.id });
  await setApplicationStatus(app, juanApp.id, "ready_for_signature", "DEMO: revisada por Mario.");
  await setApplicationStatus(app, juanApp.id, "submitted", "DEMO: enviada a BBVA.");
  await setApplicationStatus(app, juanApp.id, "approved", "DEMO: aprobada.");
  await createSale(app, { customerId: juan.customer.id, quoteId: juanQuote.id, creditApplicationId: juanApp.id });
  await app.db.insert(s.marioAlerts).values({
    workspaceId: app.workspaceId,
    customerId: juan.customer.id,
    trigger: "credit_approved",
    payload: {
      customer: "Juan Pérez (DEMO)",
      vehicle: "City",
      version: "Sport",
      downPayment: 80_000,
      monthlyTarget: null,
      purchaseTiming: "Este mes",
      crmStage: "closing",
      temperature: "very_hot",
      quoteStatus: "Cotización previamente validada",
      creditStatus: "Aprobado (DEMO)",
      mainObjection: null,
      reasonForEscalation: "DEMO: crédito BBVA aprobado.",
      recommendedNextStep: "Crear pedido y agendar firma.",
      shortSummary: "Cliente DEMO con crédito aprobado.",
    },
  });

  // 2) Ana: Banorte con faltantes y documentos pendientes.
  const ana = await createCustomer(app, { displayName: "Ana López (DEMO)" });
  await mark(ana.customer.id);
  const anaData = person(2, "Ana", "López", { gender: "female", vehicle_interest: "CR-V", version: "Turbo Plus", payment_method: "financing" });
  for (const k of ["work_phone", "work_street", "work_exterior_number", "work_neighborhood", "work_postal_code", "reference_2_name", "reference_2_phone", "reference_2_relationship"]) delete anaData[k];
  await capture(ana.customer.id, anaData);
  await setCrmManually(app, ana.customer.id, { stage: "documentation", temperature: "hot", reason: "DEMO: integrando expediente." });
  await createApplication(app, { customerId: ana.customer.id, institutionCode: "BANORTE" });
  await setDocumentStatus(app, ana.customer.id, "ine", "received");
  await setDocumentStatus(app, ana.customer.id, "proof_of_address", "missing");

  // 3) Carlos: cotización enviada hace ~50 h.
  const carlos = await createCustomer(app, { displayName: "Carlos Gómez (DEMO)" });
  await mark(carlos.customer.id);
  await capture(carlos.customer.id, { first_name: "Carlos", paternal_last_name: "Gómez", vehicle_interest: "HR-V", version: "Touring", payment_method: "financing", down_payment: 120_000 });
  await setCrmManually(app, carlos.customer.id, { stage: "quotation", temperature: "interested", reason: "DEMO: cotización enviada." });
  const cat = await loadCatalog(app.db, app.workspaceId);
  const est = computeQuote(cat, { model: "HR-V", version: "Touring", downPayment: 120_000, termMonths: 48, paymentMethod: "financing" }, now);
  if (est.ok) {
    await app.db.insert(s.quotes).values({
      workspaceId: app.workspaceId,
      customerId: carlos.customer.id,
      vehicleId: est.vehicleId,
      versionId: est.versionId,
      calculationType: "estimate",
      status: "presented",
      vehiclePrice: est.quote.vehiclePrice,
      downPayment: est.quote.downPayment,
      termMonths: est.quote.termMonths,
      monthlyPayment: est.quote.monthlyPayment,
      annualRate: est.quote.annualRate,
      bonus: est.quote.bonus,
      openingCommission: est.quote.openingCommission,
      insurance: est.quote.insurance,
      conditions: est.quote.conditions,
      validUntil: est.quote.validUntil,
      financingRuleId: est.quote.financingRuleId,
      calculationTrace: est.quote.trace,
      createdBy: "mario",
      isDemo: true,
      createdAt: new Date(now.getTime() - 50 * 3_600_000),
    });
  }

  // 4) Conflicto BBVA vs Banorte (patrón sintético equivalente al caso real; sin PII real).
  const conflict = await createCustomer(app, { displayName: "Cliente Conflicto (DEMO)" });
  await mark(conflict.customer.id);
  const base = person(4, "Mateo", "Conflicto");
  await recordFacts(app, { customerId: conflict.customer.id, entries: toEntries(base), sourceType: "credit_application", sourceLabel: "Solicitud BBVA previa (DEMO)" });
  await recordFacts(app, {
    customerId: conflict.customer.id,
    entries: toEntries({ curp: "DEMO900104HDFXXX09", company_name: "Empresa Demo S.A. de C.V.", work_phone: "5550009999", employment_years: 4 }),
    sourceType: "credit_application",
    sourceLabel: "Solicitud Banorte previa (DEMO)",
  });
  await capture(conflict.customer.id, { vehicle_interest: "City", version: "Prime", payment_method: "financing" });
  await setCrmManually(app, conflict.customer.id, { stage: "financing", temperature: "hot", reason: "DEMO: preparar solicitud; hay datos contradictorios." });

  // 5) Laura: venta facturada con entrega próxima y cita hoy.
  const laura = await createCustomer(app, { displayName: "Laura Entrega (DEMO)" });
  await mark(laura.customer.id);
  await capture(laura.customer.id, { first_name: "Laura", paternal_last_name: "Entrega", vehicle_interest: "CR-V", version: "Turbo Plus", payment_method: "cash" });
  await setCrmManually(app, laura.customer.id, { stage: "closing", temperature: "very_hot", reason: "DEMO: pagó de contado." });
  const sale = await createSale(app, { customerId: laura.customer.id });
  await updateSale(
    app,
    sale.id,
    {
      unitDescription: "CR-V Turbo Plus 2026 (DEMO)",
      customerNumber: "DEMO-C-0005",
      orderNumber: "DEMO-P-0005",
      invoiceNumber: "DEMO-F-0005",
      invoiceValue: 590_000,
      bonus: 30_000,
      invoiceDate: new Date(now.getTime() - 2 * DAY_MS).toISOString().slice(0, 10),
      deliveryDate: new Date(now.getTime() + 2 * DAY_MS).toISOString().slice(0, 10),
      extras: "Tapetes y película (DEMO)",
      extrasAmount: 6_500,
      warrantyAmount: 12_000,
      warrantyYears: 2,
      insuranceAmount: 18_000,
      bonusUsage: "Aplicado a precio (DEMO)",
      agreements: "Entrega con tanque lleno (DEMO)",
      status: "invoiced",
    },
    "DEMO: datos iniciales.",
  );
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const at = new Date(Math.min(startOfDay.getTime() + 18 * 3_600_000, now.getTime() + 30 * 60_000));
  await app.db.insert(s.appointments).values({ workspaceId: app.workspaceId, customerId: laura.customer.id, kind: "delivery", scheduledAt: at < now ? new Date(now.getTime() + 30 * 60_000) : at, status: "confirmed", notes: "DEMO: revisión previa a entrega", createdBy: "mario" });

  await app.db
    .update(s.workspaces)
    .set({ settings: { ...settings, demoSeedVersion: SEED_VERSION } })
    .where(eq(s.workspaces.id, app.workspaceId));
  return true;
}
