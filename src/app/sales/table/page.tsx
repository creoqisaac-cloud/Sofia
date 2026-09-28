import Link from "next/link";
import { MobileHeader } from "@/components/app/AppShell";
import { fmtDate, fmtMoney } from "@/components/app/ui";
import { SALE_STATUS_LABELS } from "@/domain/enums";
import { SALE_FIELDS } from "@/domain/sales";
import { getAppContext } from "@/server/app";
import { listSales } from "@/server/services/sales";

/** Vista de escritorio parecida al control en Excel de Mario (todas las columnas). */
export default async function SalesTablePage() {
  const sales = await listSales(await getAppContext(), "all");
  return (
    <>
      <MobileHeader back="/sales" title="Control de ventas" subtitle="Todas las columnas del control original · vista de escritorio" />
      <div className="overflow-x-auto p-4">
        <table className="min-w-max border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-zinc-900 text-xs uppercase text-zinc-400">
            <tr>
              <th className="border-b border-zinc-800 px-3 py-2">Estado</th>
              {SALE_FIELDS.map((f) => (
                <th key={f.key} className="border-b border-zinc-800 px-3 py-2" title={`Columna original: ${f.column}`}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-zinc-900 hover:bg-zinc-900/60">
                <td className="px-3 py-2">
                  <Link href={`/sales/${s.id}`} className="text-emerald-400">
                    {SALE_STATUS_LABELS[s.status]}
                  </Link>
                </td>
                {SALE_FIELDS.map((f) => {
                  const v = s[f.key];
                  return (
                    <td key={f.key} className="max-w-64 truncate px-3 py-2 text-zinc-200">
                      {f.type === "money" ? fmtMoney(v as number | null) : f.type === "date" ? fmtDate(v as Date | null) : ((v as string | number | null) ?? "—")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-zinc-500">Importación/exportación a Excel: preparada para un sprint posterior.</p>
      </div>
    </>
  );
}
