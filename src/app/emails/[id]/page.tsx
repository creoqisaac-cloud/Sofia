import { MobileHeader } from "@/components/app/AppShell";
import { EmailDraft } from "@/components/sofia/EmailDraft";
import { getAppContext } from "@/server/app";
import { emailConfigured, getEmail } from "@/server/services/email";

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getAppContext();
  const e = await getEmail(app, id);
  return (
    <>
      <MobileHeader title="Correo" back={e.plateCaseId ? `/plates/${e.plateCaseId}` : e.customerId ? `/customers/${e.customerId}` : "/"} />
      <div className="mx-auto max-w-xl px-4 pb-8">
        <EmailDraft email={{ id: e.id, to: e.toAddress, subject: e.subject, body: e.body, attachments: e.attachments, status: e.status, providerConfigured: await emailConfigured(app) }} />
      </div>
    </>
  );
}
