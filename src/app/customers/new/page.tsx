import { MobileHeader, Page } from "@/components/app/AppShell";
import { CreateCustomerForm } from "@/components/app/forms";
import { SectionCard } from "@/components/app/ui";

export default function NewCustomerPage() {
  return (
    <>
      <MobileHeader title="Nuevo cliente" back="/customers" />
      <Page>
        <SectionCard subtitle="Solo lo mínimo. El resto se completa después, por secciones.">
          <CreateCustomerForm />
        </SectionCard>
      </Page>
    </>
  );
}
