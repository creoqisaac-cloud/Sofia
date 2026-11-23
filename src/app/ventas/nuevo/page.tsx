import { MobileHeader, Page } from "@/components/app/AppShell";
import { NewChat } from "@/components/desk/NewChat";

export default function NuevoChatPage() {
  return (
    <>
      <MobileHeader title="Chat nuevo" back="/ventas" subtitle="Pega lo que te escribió el cliente" />
      <Page>
        <NewChat />
      </Page>
    </>
  );
}
