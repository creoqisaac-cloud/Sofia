import { MobileHeader, Page } from "@/components/app/AppShell";
import { ModelsApp } from "@/components/desk/ModelsApp";
import { DeskTabs } from "@/components/desk/ui";
import { getAppContext } from "@/server/app";
import { getModelsOverview } from "@/server/desk/models";

export const dynamic = "force-dynamic";

export default async function ModelosPage() {
  const data = await getModelsOverview(await getAppContext());
  return (
    <>
      <MobileHeader title="Modelos" subtitle="Fotos, videos, flyers, novedades y unidades" />
      <Page>
        <DeskTabs />
        <ModelsApp initial={JSON.parse(JSON.stringify(data))} />
      </Page>
    </>
  );
}
