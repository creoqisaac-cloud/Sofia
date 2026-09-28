/**
 * Control de ventas de Mario: definición de columnas (todas se conservan) y
 * flujo de estados. Separado de la cotización. Sin cálculo de comisiones.
 */
import type { SaleStatus } from "./enums";

export type SaleFieldType = "text" | "money" | "date" | "int" | "longtext";

export interface SaleFieldDef {
  key: SaleFieldKey;
  /** Encabezado EXACTO de la columna en el Excel real de Mario (control_de_ventas_Mario.xlsx). null = dato interno. */
  column: string | null;
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
  "vin",
] as const;
export type SaleFieldKey = (typeof SALE_FIELD_KEYS)[number];

/** Las 17 columnas del Excel de Mario (+ monto de adicionales y VIN, internos). */
export const SALE_FIELDS: SaleFieldDef[] = [
  { key: "customerName", column: "CLIENTE", label: "Cliente", type: "text", section: "cliente", critical: false },
  { key: "customerNumber", column: "# DE CLIENTE", label: "Número de cliente", type: "text", section: "cliente", critical: false },
  { key: "vin", column: null, label: "VIN", type: "text", section: "vehiculo", critical: true },
  { key: "unitDescription", column: "UNIDAD", label: "Unidad", type: "text", section: "vehiculo", critical: true },
  { key: "downPayment", column: "ENGANCHE", label: "Enganche", type: "money", section: "montos", critical: true },
  { key: "invoiceValue", column: "VALOR FACTURA", label: "Valor factura", type: "money", section: "montos", critical: true },
  { key: "openingCommission", column: "COMISIÓN X APERTURA", label: "Comisión por apertura", type: "money", section: "montos", critical: true },
  { key: "bonus", column: "BONO", label: "Bono", type: "money", section: "bono", critical: true },
  { key: "bonusUsage", column: "COMO SE USARÁ EL BONO", label: "Uso del bono", type: "longtext", section: "bono", critical: true },
  { key: "insuranceAmount", column: "MONTO DEL SEGURO", label: "Seguro", type: "money", section: "seguro", critical: true },
  { key: "warrantyAmount", column: "MONTO DE GARANTIA", label: "Garantía (monto)", type: "money", section: "garantia", critical: true },
  { key: "warrantyYears", column: "AÑOS DE GARANTIA", label: "Garantía (años)", type: "int", section: "garantia", critical: true },
  { key: "extras", column: "ADICIONALES", label: "Adicionales", type: "longtext", section: "adicionales", critical: true },
  { key: "extrasAmount", column: null, label: "Monto de adicionales", type: "money", section: "adicionales", critical: true },
  { key: "orderNumber", column: "# DE PEDIDO", label: "Número de pedido", type: "text", section: "facturacion", critical: true },
  { key: "invoiceNumber", column: "# FACTURA", label: "Número de factura", type: "text", section: "facturacion", critical: true },
  { key: "invoiceDate", column: "FECHA DE FACTURA", label: "Fecha de factura", type: "date", section: "facturacion", critical: true },
  { key: "deliveryDate", column: "FECHA DE ENTREGA", label: "Fecha de entrega", type: "date", section: "entrega", critical: true },
  { key: "agreements", column: "ACUERDOS", label: "Acuerdos", type: "longtext", section: "acuerdos", critical: true },
];

/** Orden de columnas del Excel de Mario (para exportar igual que su control). */
export const EXCEL_COLUMNS = ["CLIENTE", "# DE CLIENTE", "# DE PEDIDO", "# FACTURA", "UNIDAD", "BONO", "ENGANCHE", "VALOR FACTURA", "FECHA DE FACTURA", "FECHA DE ENTREGA", "ADICIONALES", "MONTO DE GARANTIA", "AÑOS DE GARANTIA", "COMISIÓN X APERTURA", "MONTO DEL SEGURO", "COMO SE USARÁ EL BONO", "ACUERDOS"] as const;

export function excelFieldFor(header: string): SaleFieldDef | undefined {
  const h = header.trim().toUpperCase();
  return SALE_FIELDS.find((f) => f.column === h);
}

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
