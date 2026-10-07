import { MobileHeader } from "@/components/app/AppShell";
import Link from "next/link";
import { ConfirmAllButton } from "@/components/app/forms";
import { DocCaptureForm, DocStatusButtons, FactReviewRow, PdfActions } from "@/components/sofia/tablet";
import { safeReturn } from "@/domain/return-to";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/domain/enums";
import { PROFILE_FIELD_DEFS } from "@/domain/profile-fields";
import { getAppContext } from "@/server/app";
import { getInboxDocument, INBOX_STATUS_LABELS, type InboxStatus } from "@/server/services/inbox";

// Datos más comunes en INE, comprobantes, constancias y recibos (captura manual).
const CAPTURE_KEYS = ["first_name", "middle_name", "paternal_last_name", "maternal_last_name", "birth_date", "curp", "rfc", "street", "exterior_number", "interior_number", "neighborhood", "municipality", "city", "state", "postal_code", "company_name", "monthly_fixed_income", "employment_years", "email", "mobile_phone", "home_phone", "nss"];

export default async function DocumentReviewPage({ params, searchParams }: { params: Promise<{ id: string; docId: string }>; searchParams: Promise<{ volver?: string }> }) {
  const { id, docId } = await params;
  const returnTo = safeReturn(id, (await searchParams).volver);
  const app = await getAppContext();
  const { doc, facts } = await getInboxDocument(app, docId);
  const label = DOCUMENT_TYPE_LABELS[doc.docType as DocumentType] ?? "Documento";
  const url = `/api/documents/${doc.id}/file`;
  const isImage = doc.mimeType?.startsWith("image/");
  const keys = CAPTURE_KEYS.filter((k) => PROFILE_FIELD_DEFS[k]).map((k) => [k, PROFILE_FIELD_DEFS[k]!.label] as [string, string]);
  const open = facts.filter((f) => f.status === "observed" || f.status === "conflicting");
  return (
    <>
      <MobileHeader title={label} back={`/customers/${id}/documents`} subtitle={INBOX_STATUS_LABELS[(doc.extractionStatus ?? "uploaded") as InboxStatus]} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-10">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="max-h-[60vh] w-full rounded-2xl bg-panel object-contain" />
        ) : (
          <div className="rounded-3xl bg-panel p-5 text-[15px] text-dim">PDF · {Math.round((doc.sizeBytes ?? 0) / 1024)} KB</div>
        )}
        <PdfActions url={url} name={`${label}.${isImage ? "jpg" : "pdf"}`} title={label} />
        {doc.extractionNote && <p className="text-[15px] text-dim">{doc.extractionNote}</p>}

        <section>
          <h2 className="sofia-title text-[12px] font-semibold text-dim">DATOS ENCONTRADOS</h2>
          {facts.length === 0 ? (
            <p className="py-3 text-[15px] text-faint">No se leyó ningún dato automáticamente. Captúralos abajo si los necesitas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {facts.map((f) => (
                <FactReviewRow key={f.id} customerId={id} documentId={doc.id} f={f} />
              ))}
            </ul>
          )}
          {open.length > 0 && <p className="mt-2 text-[13px] text-faint">Estos datos están OBSERVADOS: no se usan en la solicitud hasta que los confirmes.</p>}
          {open.filter((f) => f.status === "observed").length > 1 && (
            <div className="mt-3">
              <ConfirmAllButton customerId={id} factIds={open.filter((f) => f.status === "observed").map((f) => f.id)} label={`Ya revisé ${label === "INE" ? "la INE" : "el documento"}: confirmar todos (${open.filter((f) => f.status === "observed").length})`} />
              <p className="mt-1 text-[12px] text-faint">Compara cada dato con el documento antes. Los que no coinciden con otro dato no se confirman aquí.</p>
            </div>
          )}
        </section>
        {returnTo && (
          <Link href={returnTo} className="flex min-h-14 items-center justify-center rounded-2xl bg-sand text-[16px] font-semibold text-ink">
            Volver a la solicitud →
          </Link>
        )}

        <DocCaptureForm customerId={id} documentId={doc.id} keys={keys} />
        <DocStatusButtons customerId={id} documentId={doc.id} />
      </div>
    </>
  );
}
