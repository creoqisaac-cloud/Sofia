import Link from "next/link";
import { MobileHeader } from "@/components/app/AppShell";
import { RequirementsEditor } from "@/components/sofia/PlateForms";
import { getAppContext } from "@/server/app";
import { getPlatesRecipient } from "@/server/services/email";
import { listPlateCases, listPlateRequirements, NO_PLATE_REQUIREMENTS, PLATE_OPEN_STATUSES, PLATE_STATUS_LABELS, plateMissing, type PlateStatus } from "@/server/services/plates";

export default async function PlatesPage() {
  const app = await getAppContext();
  const [cases, reqs, recipient] = await Promise.all([listPlateCases(app), listPlateRequirements(app), getPlatesRecipient(app)]);
  const open = cases.filter((c) => PLATE_OPEN_STATUSES.includes(c.plate.status as PlateStatus));
  return (
    <>
      <MobileHeader title="Placas" back="/more" subtitle="Asistente del trámite (sin portales automáticos)" />
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 pb-8">
        <section>
          <h2 className="sofia-title text-[12px] font-semibold text-dim">PENDIENTES</h2>
          {open.length === 0 && <p className="py-4 text-[15px] text-faint">Sin trámites abiertos. Ábrelos desde la ficha del cliente.</p>}
          <ul className="divide-y divide-line">
            {open.map(({ plate: p, customerName }) => (
              <li key={p.id}>
                <Link href={`/plates/${p.id}`} className="block py-3">
                  <div className="text-[17px] text-ivory">{customerName.replace(/\s*\(DEMO\)\s*/, "")}</div>
                  <div className="text-[14px] text-dim">
                    {PLATE_STATUS_LABELS[p.status as PlateStatus]}
                    {plateMissing(p).length ? ` · falta ${plateMissing(p).join(", ").toLowerCase()}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="sofia-title text-[12px] font-semibold text-dim">REQUISITOS (CON FUENTE)</h2>
          {reqs.length === 0 && <p className="py-3 text-[15px] text-alert">{NO_PLATE_REQUIREMENTS}</p>}
          <div className="mt-2">
            <RequirementsEditor reqs={reqs.map((r) => ({ id: r.id, label: r.label, sourceLabel: r.sourceLabel, isDemo: r.isDemo }))} recipient={recipient} />
          </div>
        </section>
      </div>
    </>
  );
}
