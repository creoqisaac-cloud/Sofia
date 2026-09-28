import Link from "next/link";
import { MobileHeader } from "@/components/app/AppShell";
import { DraftPlatesEmailButton, PlateCaseForm, RequirementToggle } from "@/components/sofia/PlateForms";
import { getAppContext } from "@/server/app";
import { listEmails } from "@/server/services/email";
import { getPlateCase, NO_PLATE_REQUIREMENTS, PLATE_STATUS_LABELS, plateMissing, type PlateStatus } from "@/server/services/plates";

export default async function PlateCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getAppContext();
  const { plate: p, customerName } = await getPlateCase(app, id);
  const emails = (await listEmails(app, { customerId: p.customerId })).filter((e) => e.plateCaseId === p.id);
  const missing = plateMissing(p);
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return (
    <>
      <MobileHeader title="Placas" back="/plates" subtitle={customerName} />
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-8">
        <section className="rounded-3xl bg-panel p-5">
          <div className="text-[13px] text-dim">{PLATE_STATUS_LABELS[p.status as PlateStatus]}</div>
          <p className="mt-1 text-[18px] text-ivory">{p.requirements.length === 0 ? NO_PLATE_REQUIREMENTS : missing.length ? `Falta: ${missing.join(", ")}` : "Documentos completos"}</p>
          <p className="mt-2 text-[14px] text-dim">
            {p.vehicleLabel ?? "Unidad por confirmar"} · VIN {p.vin ?? "pendiente"}
            {p.dueDate ? ` · límite ${p.dueDate.toLocaleDateString("es-MX")}` : ""}
          </p>
          {p.nextStep && <p className="mt-2 text-[15px] text-sand">→ {p.nextStep}</p>}
          <div className="mt-4">
            <DraftPlatesEmailButton customerId={p.customerId} />
          </div>
        </section>
        {p.requirements.length > 0 && (
          <section>
            <h2 className="sofia-title text-[12px] font-semibold text-dim">DOCUMENTOS</h2>
            <div className="divide-y divide-line">
              {p.requirements.map((r) => (
                <RequirementToggle key={r.id} caseId={p.id} req={r} />
              ))}
            </div>
          </section>
        )}
        <PlateCaseForm c={{ id: p.id, status: p.status, nextStep: p.nextStep, notes: p.notes, vin: p.vin, dueDate: iso(p.dueDate) }} statuses={Object.entries(PLATE_STATUS_LABELS)} />
        {emails.length > 0 && (
          <section>
            <h2 className="sofia-title text-[12px] font-semibold text-dim">CORREOS</h2>
            <ul className="divide-y divide-line">
              {emails.map((e) => (
                <li key={e.id}>
                  <Link href={`/emails/${e.id}`} className="block py-3">
                    <div className="text-[15px] text-ivory">{e.subject}</div>
                    <div className="text-[13px] text-dim">{{ draft: "Borrador", sent: "Enviado", cancelled: "Cancelado", failed: "Falló", opened_in_mail: "Abierto en Mail" }[e.status] ?? e.status}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link href={`/customers/${p.customerId}`} className="text-[15px] text-sand">
          Ver cliente →
        </Link>
      </div>
    </>
  );
}
