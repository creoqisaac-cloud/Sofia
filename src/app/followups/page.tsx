import Link from "next/link";
import { MobileHeader } from "@/components/app/AppShell";
import { FollowupButtons } from "@/components/sofia/tablet";
import { getAppContext } from "@/server/app";
import { listPendingFollowups } from "@/server/services/agenda";
import { getTabletSummary } from "@/server/services/tablet";
import { getTodayItems } from "@/server/services/today";

const short = (n: string) => n.replace(/\s*\(DEMO\)\s*/, "");

/** Seguimiento: una tarjeta por cliente con lo esencial y acciones grandes. */
export default async function FollowupsPage() {
  const app = await getAppContext();
  const [pending, today] = await Promise.all([listPendingFollowups(app), getTodayItems(app)]);
  const ids: string[] = [];
  for (const p of pending) if (!ids.includes(p.followup.customerId)) ids.push(p.followup.customerId);
  for (const t of today) if (["no_response", "quote_waiting"].includes(t.kind) && !ids.includes(t.customerId)) ids.push(t.customerId);
  const cards = await Promise.all(ids.map((id) => getTabletSummary(app, id)));
  return (
    <>
      <MobileHeader title="Seguimiento" subtitle={`${cards.length} cliente(s) por atender`} />
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pb-10">
        {cards.length === 0 && <p className="py-6 text-center text-[15px] text-faint">Sin seguimientos pendientes.</p>}
        {cards.map((t) => (
          <section key={t.customer.id} className="rounded-3xl bg-panel p-5">
            <Link href={`/customers/${t.customer.id}`} className="block">
              <div className="text-[22px] font-semibold text-ivory">
                {short(t.customer.displayName)} {t.customerNumber && <span className="text-[15px] font-normal text-faint"># {t.customerNumber}</span>}
              </div>
            </Link>
            <dl className="mt-2 space-y-1 text-[15px]">
              <div><dt className="inline text-faint">Último contacto: </dt><dd className="inline text-ivory">{t.lastContact ?? "—"}</dd></div>
              <div><dt className="inline text-faint">Siguiente acción: </dt><dd className={`inline ${t.nextAction?.overdue ? "text-alert" : "text-ivory"}`}>{t.nextAction ? t.nextAction.action ?? "Seguimiento" : "Contactar"}</dd></div>
              <div><dt className="inline text-faint">Fecha: </dt><dd className="inline text-ivory">{t.nextAction?.when ?? "hoy"}{t.nextAction?.overdue ? " (vencida)" : ""}</dd></div>
              <div><dt className="inline text-faint">Motivo: </dt><dd className="inline text-ivory">{t.nextAction?.text ?? t.waitingFor ?? "Sin respuesta"}</dd></div>
              {t.quote && <div><dt className="inline text-faint">Cotización: </dt><dd className="inline text-dim">{t.quote}</dd></div>}
            </dl>
            <div className="mt-4">
              <FollowupButtons customerId={t.customer.id} followupId={t.nextAction?.id ?? null} phone={t.phone} />
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
