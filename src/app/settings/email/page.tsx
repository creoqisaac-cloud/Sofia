import { MobileHeader } from "@/components/app/AppShell";
import { EmailAccountForm } from "@/components/sofia/EmailAccountForm";
import { getAppContext } from "@/server/app";
import { EMAIL_PRESETS, getEmailAccountStatus } from "@/server/services/email-account";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const app = await getAppContext();
  const account = await getEmailAccountStatus(app);
  return (
    <>
      <MobileHeader title="Correo de Sofía" back="/more" subtitle="La cuenta desde la que Sofía envía" />
      <div className="mx-auto max-w-3xl px-5 pb-10">
        <EmailAccountForm initial={account} presets={EMAIL_PRESETS} />
      </div>
    </>
  );
}
