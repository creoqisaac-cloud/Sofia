import { eq } from "drizzle-orm";
import { MobileHeader } from "@/components/app/AppShell";
import { NewReturnForm, ReturnStatusButtons } from "@/components/sofia/ReturnForms";
import { getAppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { listReturnCases, RETURN_STATUS_LABELS, RETURNS_PENDING_DEFINITION } from "@/server/services/returns";

/** Devoluciones: estructura mínima. Mario todavía no describió el proceso (tipos, reglas, montos). */
export default async function ReturnsPage() {
  const app = await getAppContext();
  const [cases, customers] = await Promise.all([listReturnCases(app), app.db.select({ id: s.customers.id, name: s.customers.displayName }).from(s.customers).where(eq(s.customers.workspaceId, app.workspaceId))]);
  return (
    <>
      <MobileHeader title="Devoluciones" back="/more" />
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-8">
        <p className="rounded-2xl bg-panel p-4 text-[16px] text-alert">{RETURNS_PENDING_DEFINITION}</p>
        <p className="text-[14px] text-dim">Mientras tanto puedes registrar el caso (cliente, motivo, monto, notas) para no perderlo. Sofía no aplica reglas ni calcula montos.</p>
        <NewReturnForm customers={customers.map((c) => ({ id: c.id, name: c.name.replace(/\s*\(DEMO\)\s*/, "") }))} />
        <ul className="divide-y divide-line">
          {cases.map(({ ret, customerName }) => (
            <li key={ret.id} className="py-3">
              <div className="text-[16px] text-ivory">{customerName}</div>
              <div className="text-[14px] text-dim">
                {RETURN_STATUS_LABELS[ret.status] ?? ret.status}
                {ret.reason ? ` · ${ret.reason}` : ""}
                {ret.amount ? ` · $${ret.amount.toLocaleString("es-MX")}` : ""}
              </div>
              <ReturnStatusButtons id={ret.id} status={ret.status} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
