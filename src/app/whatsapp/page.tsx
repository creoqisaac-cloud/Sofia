import { and, eq } from "drizzle-orm";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { WhatsAppAssistant } from "@/components/sofia/WhatsAppAssistant";
import { getAppContext } from "@/server/app";
import * as s from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const app = await getAppContext();
  const valid = cliente && /^[a-f0-9-]{36}$/i.test(cliente);
  const [customer] = valid
    ? await app.db.select({ name: s.customers.displayName, phone: s.customers.phone })
        .from(s.customers)
        .where(and(eq(s.customers.id, cliente), eq(s.customers.workspaceId, app.workspaceId)))
        .limit(1)
    : [];
  return (
    <>
      <MobileHeader title="WhatsApp" back={valid ? `/customers/${cliente}` : "/more"} subtitle="Borradores para conversar con clientes" />
      <Page>
        <WhatsAppAssistant initialName={customer?.name ?? ""} initialPhone={customer?.phone ?? ""} />
        <p className="text-[13px] leading-relaxed text-dim">
          Esta primera versión no lee conversaciones ni envía mensajes por sí sola. Para una bandeja bidireccional
          y respuestas automáticas hará falta conectar la plataforma oficial de WhatsApp Business con permisos y consentimiento.
        </p>
      </Page>
    </>
  );
}
