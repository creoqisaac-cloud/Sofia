import { MobileHeader, Page } from "@/components/app/AppShell";
import { StyleForm } from "@/components/desk/StyleForm";
import { DeskTabs } from "@/components/desk/ui";
import { getAppContext } from "@/server/app";
import { loadStyle } from "@/server/desk/style";

export const dynamic = "force-dynamic";

export default async function EstiloPage() {
  const app = await getAppContext();
  const style = await loadStyle(app.db, app.workspaceId);
  return (
    <>
      <MobileHeader title="Estilo de venta" subtitle="Cómo escribe Sofía y cómo se adapta a cada día" />
      <Page>
        <DeskTabs />
        <StyleForm initial={style} />
      </Page>
    </>
  );
}
