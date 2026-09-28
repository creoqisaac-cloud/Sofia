/**
 * Control de ventas de Mario: definición de columnas (todas se conservan) y
 * flujo de estados. Separado de la cotización. Sin cálculo de comisiones.
 */
import type { SaleStatus } from "./enums";

export type SaleFieldType = "text" | "money" | "date" | "int" | "longtext";

export interface SaleFieldDef {
  key: SaleFieldKey;
  /** Nombre de la columna en el control original de Mario. */
  column: string;
  label: string;
  type: SaleFieldType;
  section: SaleSection;
  /** Cambios auditados como críticos (nunca se sobrescriben en silencio). */
  critical: boolean;
}

export const SALE_SECTIONS = ["cliente", "vehiculo", "montos", "bono", "seguro", "garantia", "adicionales", "facturacion", "entrega", "acuerdos"] as const;
export type SaleSection = (typeof SALE_SECTIONS)[number];
export const SALE_SECTION_LABELS: Record<SaleSection, string> = {
  cliente: "Cliente",
  vehiculo: "Vehículo",
  montos: "Montos",
  bono: "Bono",
  seguro: "Seguro",
  garantia: "Garantía",
  adicionales: "Adicionales",
  facturacion: "Facturación",
  entrega: "Entrega",
  acuerdos: "Acuerdos",
};

export const SALE_FIELD_KEYS = [
  "customerName",
  "customerNumber",
  "orderNumber",
  "invoiceNumber",
  "unitDescription",
  "bonus",
  "downPayment",
  "invoiceValue",
  "invoiceDate",
  "deliveryDate",
  "extras",
  "extrasAmount",
  "warrantyAmount",
  "warrantyYears",
  "openingCommission",
  "insuranceAmount",
  "bonusUsage",
  "agreements",
] as const;
export type SaleFieldKey = (typeof SALE_FIELD_KEYS)[number];

/** Las 17 columnas del control de Mario (+ monto de adicionales para reportes futuros). */
export const SALE_FIELDS: SaleFieldDef[] = [
  { key: "customerName", column: "customer", label: "Cliente", type: "text", section: "cliente", critical: false },
  { key: "customerNumber", column: "customer_number", label: "Número de cliente", type: "text", section: "cliente", critical: false },
  { key: "unitDescription", column: "vehicle/unit", label: "Unidad", type: "text", section: "vehiculo", critical: true },
  { key: "downPayment", column: "down_payment", label: "Enganche", type: "money", section: "montos", critical: true },
  { key: "invoiceValue", column: "invoice_value", label: "Valor factura", type: "money", section: "montos", critical: true },
  { key: "openingCommission", column: "opening_commission", label: "Comisión por apertura", type: "money", section: "montos", critical: true },
  { key: "bonus", column: "bonus", label: "Bono", type: "money", section: "bono", critical: true },
  { key: "bonusUsage", column: "bonus_usage", label: "Uso del bono", type: "longtext", section: "bono", critical: true },
  { key: "insuranceAmount", column: "insurance_amount", label: "Seguro", type: "money", section: "seguro", critical: true },
  { key: "warrantyAmount", column: "warranty_amount", label: "Garantía (monto)", type: "money", section: "garantia", critical: true },
  { key: "warrantyYears", column: "warranty_years", label: "Garantía (años)", type: "int", section: "garantia", critical: true },
  { key: "extras", column: "extras", label: "Adicionales", type: "longtext", section: "adicionales", critical: true },
  { key: "extrasAmount", column: "extras (monto)", label: "Monto de adicionales", type: "money", section: "adicionales", critical: true },
  { key: "orderNumber", column: "order_number", label: "Número de pedido", type: "text", section: "facturacion", critical: true },
  { key: "invoiceNumber", column: "invoice_number", label: "Número de factura", type: "text", section: "facturacion", critical: true },
  { key: "invoiceDate", column: "invoice_date", label: "Fecha de factura", type: "date", section: "facturacion", critical: true },
  { key: "deliveryDate", column: "delivery_date", label: "Fecha de entrega", type: "date", section: "entrega", critical: true },
  { key: "agreements", column: "agreements", label: "Acuerdos", type: "longtext", section: "acuerdos", critical: true },
];

export const SALE_STATUS_ORDER: SaleStatus[] = ["prospect", "negotiation", "credit_process", "approved", "order_created", "invoiced", "delivery_pending", "delivered"];

/** Salir de "entregada" o "cancelada" exige motivo (no se pierde el estado por error). */
export function validateSaleStatusChange(from: SaleStatus, to: SaleStatus, reason: string | null): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true };
  if ((from === "delivered" || from === "cancelled") && !reason?.trim()) {
    return { ok: false, reason: "Para cambiar una venta entregada o cancelada indica el motivo." };
  }
  if (to === "cancelled" && !reason?.trim()) return { ok: false, reason: "Indica el motivo de la cancelación." };
  return { ok: true };
}

export interface SaleLike {
  status: SaleStatus;
  orderNumber: string | null;
  invoiceNumber: string | null;
  invoiceValue: number | null;
  invoiceDate: Date | null;
  deliveryDate: Date | null;
  unitDescription: string | null;
}

/** Pendientes operativos derivados (no se guardan: se calculan). */
export function salePendingItems(sale: SaleLike, now: Date): string[] {
  const out: string[] = [];
  const idx = SALE_STATUS_ORDER.indexOf(sale.status);
  if (sale.status === "cancelled" || sale.status === "delivered") return out;
  if (!sale.unitDescription) out.push("Falta definir la unidad");
  if (idx >= SALE_STATUS_ORDER.indexOf("approved") && !sale.orderNumber) out.push("Venta sin pedido");
  if (idx >= SALE_STATUS_ORDER.indexOf("order_created") && !sale.invoiceNumber) out.push("Venta sin factura");
  if (idx >= SALE_STATUS_ORDER.indexOf("invoiced") && !sale.invoiceValue) out.push("Falta valor de factura");
  if (idx >= SALE_STATUS_ORDER.indexOf("invoiced") && !sale.deliveryDate) out.push("Falta fecha de entrega");
  if (sale.deliveryDate && idx >= SALE_STATUS_ORDER.indexOf("invoiced")) {
    const days = Math.ceil((sale.deliveryDate.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) out.push("Entrega vencida");
    else if (days <= 3) out.push(days === 0 ? "Entrega hoy" : `Entrega en ${days} día(s)`);
  }
  return out;
}
