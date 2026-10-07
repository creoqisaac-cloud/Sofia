import Link from "next/link";
import { MobileHeader } from "@/components/app/AppShell";
import { IconChevron } from "@/components/sofia/icons";
import { DocumentUploader } from "@/components/sofia/tablet";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, type DocumentType } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { INBOX_STATUS_LABELS, listInbox, type InboxStatus } from "@/server/services/inbox";
import { eq } from "drizzle-orm";
import { safeReturn } from "@/domain/return-to";

const TONE: Record<string, string> = { observed: "text-alert", needs_review: "text-alert", confirmed: "text-good", rejected: "text-faint", processing: "text-dim", uploaded: "text-dim" };

/** Bandeja de documentos del cliente: subir, ver qué se leyó y revisarlo. */
export default async function CustomerDocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string; volver?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const returnTo = safeReturn(id, sp.volver);
  const initialType = sp.tipo && (DOCUMENT_TYPES as readonly string[]).includes(sp.tipo) ? sp.tipo : undefined;
  const app = await getAppContext();
  const [[customer], docs] = await Promise.all([app.db.select().from(s.customers).where(eq(s.customers.id, id)), listInbox(app, id)]);
  const types = DOCUMENT_TYPES.filter((t) => t !== "quote_pdf").map((t) => [t, DOCUMENT_TYPE_LABELS[t]] as [string, string]);
  const pending = docs.reduce((n, d) => n + d.pendingReview, 0);
  return (
    <>
      <MobileHeader title="Documentos" back={`/customers/${id}`} subtitle={customer?.displayName} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-10">
        {returnTo && <p className="rounded-2xl bg-panel p-4 text-[15px] text-dim">Toma la foto o escanea la INE (frente y reverso). Después revisa los datos y vuelve a la solicitud.</p>}
        <DocumentUploader customerId={id} docTypes={types} initialDocType={initialType} returnTo={returnTo} />
        {pending > 0 && (
          <p className="rounded-2xl bg-panel p-4 text-[15px] text-alert">
            Hay {pending} dato(s) leídos por revisar. Nada leído de un documento se usa en la solicitud hasta que lo confirmes.
          </p>
        )}
        <ul className="divide-y divide-line">
          {docs.length === 0 && <li className="py-6 text-center text-[15px] text-faint">Aún no hay documentos.</li>}
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/customers/${id}/documents/${d.id}`} className="flex items-center gap-4 py-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raise text-[12px] font-semibold text-dim">
                  {d.mimeType?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/documents/${d.id}/file`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    "PDF"
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] text-ivory">{DOCUMENT_TYPE_LABELS[d.docType as DocumentType] ?? d.docType}</span>
                  <span className="block truncate text-[13px] text-faint">
                    {d.fileName ?? "archivo"} · {d.createdAt.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                  </span>
                  <span className={`block text-[14px] ${TONE[d.extractionStatus ?? ""] ?? "text-dim"}`}>
                    {INBOX_STATUS_LABELS[(d.extractionStatus ?? "uploaded") as InboxStatus]}
                    {d.pendingReview ? ` · ${d.pendingReview} por revisar` : d.foundCount ? ` · ${d.foundCount} dato(s)` : ""}
                  </span>
                </span>
                <IconChevron className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
        <Link href={returnTo ?? `/customers/${id}/credit`} className="flex min-h-14 items-center justify-center rounded-2xl bg-raise text-[16px] text-ivory">
          {returnTo ? "Volver a la solicitud →" : "Continuar a la solicitud →"}
        </Link>
      </div>
    </>
  );
}
