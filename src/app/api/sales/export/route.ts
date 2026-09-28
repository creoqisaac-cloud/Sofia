import { EXCEL_COLUMNS, SALE_FIELDS } from "@/domain/sales";
import { getAppContext } from "@/server/app";
import { listSales } from "@/server/services/sales";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exporta las ventas con las MISMAS columnas del Excel de Mario (CSV UTF-8 que abre Excel). */
export async function GET() {
  const sales = await listSales(await getAppContext(), "all");
  const byColumn = new Map(SALE_FIELDS.filter((f) => f.column).map((f) => [f.column!, f.key]));
  const rows = [EXCEL_COLUMNS.join(","), ...sales.map((sl) => EXCEL_COLUMNS.map((c) => cell((sl as Record<string, unknown>)[byColumn.get(c)!])).join(","))];
  return new Response("﻿" + rows.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="control_de_ventas.csv"', "Cache-Control": "private, no-store" },
  });
}
