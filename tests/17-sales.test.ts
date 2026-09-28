/**
 * Control de ventas: entidad propia, relacionada con cotización y crédito,
 * conserva todas las columnas de Mario, audita cambios y no calcula comisiones.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SALE_FIELDS } from "@/domain/sales";
import * as s from "@/server/db/schema";
import { createApplication, setApplicationStatus } from "@/server/services/credit";
import { attachValidatedQuote } from "@/server/services/quotes";
import { createSale, getSaleDetail, listSales, updateSale } from "@/server/services/sales";
import { makeApp, newProspect, type TestApp } from "./helpers";

// Encabezados EXACTOS del Excel real de Mario (control_de_ventas_Mario.xlsx, Hoja1, fila 1).
const MARIO_COLUMNS = [
  "CLIENTE", "# DE CLIENTE", "# DE PEDIDO", "# FACTURA", "UNIDAD", "BONO", "ENGANCHE", "VALOR FACTURA", "FECHA DE FACTURA",
  "FECHA DE ENTREGA", "ADICIONALES", "MONTO DE GARANTIA", "AÑOS DE GARANTIA", "COMISIÓN X APERTURA", "MONTO DEL SEGURO", "COMO SE USARÁ EL BONO", "ACUERDOS",
];

describe("control de ventas", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("conserva todas las columnas del control original de Mario", () => {
    const columns = SALE_FIELDS.map((f) => f.column);
    for (const c of MARIO_COLUMNS) expect(columns).toContain(c);
    const tableColumns = Object.keys(s.saleRecords);
    for (const f of SALE_FIELDS) expect(tableColumns).toContain(f.key);
    for (const tech of ["id", "workspaceId", "customerId", "quoteId", "creditApplicationId", "status", "createdAt", "updatedAt", "createdBy", "source", "notes"]) expect(tableColumns).toContain(tech);
  });

  it("venta ≠ cotización; un cliente con varias cotizaciones vende una específica y hereda sus datos", async () => {
    const p = await newProspect(app, "Varias cotizaciones");
    const templates = await app.db.select().from(s.quoteTemplates);
    const q1 = await attachValidatedQuote(app, p.customer.id, templates[0]!.id);
    const q2 = await attachValidatedQuote(app, p.customer.id, templates[0]!.id);
    const sale = await createSale(app, { customerId: p.customer.id, quoteId: q1.id });
    expect(sale.quoteId).toBe(q1.id);
    expect(sale.quoteId).not.toBe(q2.id); // no se asume la última
    expect(sale.bonus).toBe(q1.bonus);
    expect(sale.downPayment).toBe(q1.downPayment);
    expect(sale.unitDescription).toMatch(/City Sport/);
    expect(sale.invoiceValue).toBeNull(); // el valor factura no se inventa
    const [quoteRow] = await app.db.select().from(s.quotes).where(eq(s.quotes.id, q1.id));
    expect(quoteRow!.status).toBe("presented"); // la cotización sigue siendo cotización
  });

  it("se relaciona con la solicitud de crédito y toma su estado", async () => {
    const p = await newProspect(app, "Con crédito");
    const application = await createApplication(app, { customerId: p.customer.id, institutionCode: "BBVA" });
    await app.db.update(s.creditApplications).set({ status: "submitted" }).where(eq(s.creditApplications.id, application.id));
    await setApplicationStatus(app, application.id, "approved", "aprobada");
    const sale = await createSale(app, { customerId: p.customer.id, creditApplicationId: application.id });
    expect(sale.status).toBe("approved");
    const detail = await getSaleDetail(app, sale.id);
    expect(detail.credit?.institution.code).toBe("BBVA");
    expect(detail.pending).toContain("Venta sin pedido");
  });

  it("los cambios críticos generan historial y la venta entregada se conserva", async () => {
    const p = await newProspect(app, "Auditoría");
    const sale = await createSale(app, { customerId: p.customer.id });
    await updateSale(app, sale.id, { bonus: 40_000, invoiceValue: 300_000, openingCommission: 4_000, insuranceAmount: 11_000, extras: "Tapetes", warrantyAmount: 9_000, warrantyYears: 3, bonusUsage: "A precio", agreements: "Tanque lleno", invoiceNumber: "F-1", orderNumber: "P-1", deliveryDate: "2026-10-01", status: "invoiced" }, "captura");
    await updateSale(app, sale.id, { invoiceValue: 310_000 }, "ajuste de factura");
    const changes = await app.db.select().from(s.saleRecordChanges).where(eq(s.saleRecordChanges.saleId, sale.id));
    const fields = changes.map((c) => c.field);
    for (const f of ["bonus", "invoiceValue", "openingCommission", "insuranceAmount", "extras", "warrantyAmount", "warrantyYears", "bonusUsage", "agreements", "invoiceNumber", "status", "deliveryDate"]) expect(fields).toContain(f);
    const adj = changes.filter((c) => c.field === "invoiceValue").map((c) => [c.oldValue, c.newValue]);
    expect(adj).toEqual(expect.arrayContaining([[null, 300_000], [300_000, 310_000]]));

    await updateSale(app, sale.id, { status: "delivered" }, "entregada");
    await expect(updateSale(app, sale.id, { status: "invoiced" })).rejects.toThrow(/motivo/);
    const [row] = await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.id, sale.id));
    expect(row!.status).toBe("delivered");
    expect((await listSales(app, "delivered")).map((x) => x.id)).toContain(sale.id);
    // Continuidad con CRM: venta facturada/entregada → cliente vendido.
    const [crm] = await app.db.select().from(s.crmStates).where(and(eq(s.crmStates.customerId, p.customer.id), eq(s.crmStates.isCurrent, true)));
    expect(crm!.stage).toBe("sold");
  });

  it("una venta existe sin comisión y no hay cálculo de comisión inventado", async () => {
    const p = await newProspect(app, "Sin comisión");
    await createSale(app, { customerId: p.customer.id });
    expect(await app.db.select().from(s.commissionCalculations)).toHaveLength(0);
    expect(await app.db.select().from(s.commissionRules)).toHaveLength(0);
  });
});
