import Link from "next/link";
import { eq } from "drizzle-orm";
import { MobileHeader } from "@/components/app/AppShell";
import { IconChevron } from "@/components/sofia/icons";
import { CREDIT_APPLICATION_STATUS_LABELS } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { listAllApplications } from "@/server/services/tablet";

const ORDER = ["conflict", "missing_information", "draft", "ready_for_review", "ready_for_signature", "submitted", "approved", "rejected", "cancelled"];
const short = (n: string) => n.replace(/\s*\(DEMO\)\s*/, "");

/** Solicitudes: todas las solicitudes de crédito, lo pendiente primero. Nueva solicitud = elegir cliente. */
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const { nueva } = await searchParams;
  const app = await getAppContext();
  const [apps, customers] = await Promise.all([listAllApplications(app), app.db.select({ id: s.customers.id, name: s.customers.displayName }).from(s.customers).where(eq(s.customers.workspaceId, app.workspaceId))]);
  apps.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  return (
    <>
      <MobileHeader title="Solicitudes" subtitle="Documentos → revisar datos → BBVA o Banorte → PDF" action={!nueva ? <Link href="/applications?nueva=1" className="text-[15px] text-sand">+ Nueva</Link> : undefined} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-10">
        {nueva && (
          <section className="rounded-3xl bg-panel p-5">
            <div className="text-[15px] text-ivory">¿De qué cliente?</div>
            <p className="text-[13px] text-dim">Primero sube y revisa sus documentos; luego eliges BBVA o Banorte.</p>
            <ul className="mt-2 divide-y divide-line">
              {customers.map((c) => (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}/documents`} className="flex min-h-12 items-center justify-between py-2 text-[16px] text-ivory">
                    {short(c.name)} <IconChevron className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/customers/new" className="mt-2 block text-[15px] text-sand">+ Cliente nuevo</Link>
          </section>
        )}
        <ul className="divide-y divide-line">
          {apps.length === 0 && <li className="py-6 text-center text-[15px] text-faint">Aún no hay solicitudes.</li>}
          {apps.map((a) => (
            <li key={a.id}>
              <Link href={`/customers/${a.customerId}/credit/${a.id}`} className="flex items-center gap-3 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] text-ivory">
                    {short(a.customer)} {a.customerNumber && <span className="text-[14px] text-faint"># {a.customerNumber}</span>}
                  </span>
                  <span className={`block text-[15px] ${a.status === "conflict" || a.status === "missing_information" ? "text-alert" : a.status === "approved" ? "text-good" : "text-dim"}`}>
                    {a.institution} · {CREDIT_APPLICATION_STATUS_LABELS[a.status]}
                  </span>
                </span>
                <IconChevron className="text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
