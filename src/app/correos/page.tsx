import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { getAppContext } from "@/server/app";
import { getEmailAccountStatus } from "@/server/services/email-account";
import { listEmails } from "@/server/services/email";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = {
  draft: "Borrador · por revisar",
  opened_in_mail: "Abierto en Mail · por confirmar envío",
  sent: "Enviado",
  failed: "Error al enviar",
  cancelled: "Cancelado",
};

export default async function CorreosPage() {
  const app = await getAppContext();
  const [account, emails] = await Promise.all([getEmailAccountStatus(app), listEmails(app)]);
  const pending = emails.filter((e) => e.status === "draft" || e.status === "opened_in_mail");
  return (
    <>
      <MobileHeader title="Asistente de correos" back="/more" subtitle="Borradores y solicitudes de placas" />
      <Page>
        <section className="rounded-3xl bg-panel p-5">
          <p className="text-[13px] text-dim">Correo asignado</p>
          <h2 className="mt-1 text-[18px] font-semibold text-ivory">{account.configured ? account.address : "Sin correo conectado"}</h2>
          <p className="mt-2 text-[14px] text-dim">{account.configured
            ? "Sofía puede enviar los correos que revises y confirmes. No se envían automáticamente."
            : "Asigna una cuenta SMTP para enviar desde Sofía, o prepara borradores para abrirlos en Mail."}</p>
          <Link href="/settings/email" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-sand px-4 text-[15px] font-semibold text-ink">
            {account.configured ? "Gestionar cuenta" : "Asignar cuenta de correo"}
          </Link>
        </section>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/plates" className="flex min-h-20 items-center justify-center rounded-2xl bg-raise px-4 text-center text-[15px] text-ivory">
            Preparar correo de placas
          </Link>
          <Link href="/customers" className="flex min-h-20 items-center justify-center rounded-2xl bg-raise px-4 text-center text-[15px] text-ivory">
            Ver expedientes
          </Link>
        </div>
        <section className="rounded-3xl bg-panel p-5">
          <h2 className="text-[17px] font-semibold text-ivory">Por revisar ({pending.length})</h2>
          {pending.length === 0 && <p className="mt-3 text-[14px] text-faint">No hay borradores pendientes.</p>}
          <ul className="mt-3 divide-y divide-line">
            {pending.map((e) => (
              <li key={e.id}>
                <Link href={`/emails/${e.id}`} className="block py-3">
                  <span className="block truncate text-[16px] text-ivory">{e.subject}</span>
                  <span className="block text-[13px] text-faint">{e.toAddress ?? "Destinatario pendiente"} · {STATUS[e.status] ?? e.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {emails.some((e) => e.status === "sent" || e.status === "failed") && (
          <section className="rounded-3xl bg-panel p-5">
            <h2 className="text-[17px] font-semibold text-ivory">Historial reciente</h2>
            <ul className="mt-2 divide-y divide-line">
              {emails.filter((e) => e.status === "sent" || e.status === "failed").slice(0, 10).map((e) => (
                <li key={e.id}><Link href={`/emails/${e.id}`} className="block py-3 text-[15px] text-dim">{e.subject} · {STATUS[e.status] ?? e.status}</Link></li>
              ))}
            </ul>
          </section>
        )}
      </Page>
    </>
  );
}
