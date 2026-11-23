import { and, eq } from "drizzle-orm";
import Link from "next/link";
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
        <Link href={valid ? `/ventas/chat/${cliente}` : "/ventas"} className="flex min-h-14 items-center justify-between rounded-3xl bg-sand px-5 text-[15px] font-semibold text-ink">
          <span>Chats de Sofía: pega lo que te escribió el cliente y ella contesta con fotos</span>
          <span aria-hidden>›</span>
        </Link>
        <WhatsAppAssistant initialName={customer?.name ?? ""} initialPhone={customer?.phone ?? ""} />
        <p className="text-[13px] leading-relaxed text-dim">
          Plantillas rápidas. Para conversar con clientes usa Chats; para mandar a varios clientes a la vez, Envíos.
        </p>
      </Page>
    </>
  );
}
