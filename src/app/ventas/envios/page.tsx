import { MobileHeader, Page } from "@/components/app/AppShell";
import { OutboxApp } from "@/components/desk/OutboxApp";
import { DeskTabs } from "@/components/desk/ui";
import { dayPlaybook } from "@/domain/sales-style";
import { getAppContext } from "@/server/app";
import { listOutbox } from "@/server/desk/outbox";
import { loadStyle } from "@/server/desk/style";

export const dynamic = "force-dynamic";

export default async function EnviosPage({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const { i } = await searchParams;
  const app = await getAppContext();
  const [items, style] = await Promise.all([listOutbox(app), loadStyle(app.db, app.workspaceId)]);
  const play = dayPlaybook(app.clock.now(), style);
  return (
    <>
      <MobileHeader title="Envíos" subtitle="Mensajes listos para mandar por WhatsApp" />
      <Page>
        <DeskTabs counts={{ "/ventas/envios": items.length }} />
        <OutboxApp initial={JSON.parse(JSON.stringify(items))} dayLabel={play.label} dayFocus={play.focus} initialDirective={i ?? ""} />
      </Page>
    </>
  );
}
