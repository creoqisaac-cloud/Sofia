import { MobileHeader, Page } from "@/components/app/AppShell";
import { MarioVoiceTrainer } from "@/components/mario/MarioVoiceTrainer";
import { loadMarioVoiceProfile } from "@/server/agent/mario-voice";
import { getAppContext } from "@/server/app";

export const dynamic = "force-dynamic";
export default async function MarioVoiceSettings() {
  const app = await getAppContext();
  const profile = await loadMarioVoiceProfile(app.db, app.workspaceId);
  return (
    <>
      <MobileHeader title="Personalidad de Mario" back="/whatsapp" subtitle="Calibrar la escritura de Sofía" />
      <Page>
        <MarioVoiceTrainer initial={profile} />
        <p className="text-[13px] text-dim">
          Sofía toma los patrones del estilo de Mario, no copia conversaciones. También observa los mensajes que él
          redacta dentro del CRM para ajustar la personalidad cuando hay suficiente historial autenticado.
          Si el cliente pregunta quién le atiende, se informa de la automatización con honestidad.
        </p>
      </Page>
    </>
  );
}
