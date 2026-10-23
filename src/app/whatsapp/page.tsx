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
  const cloudCredentials = Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_PHONE_NUMBER_ID
    && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN);
  const autoReply = cloudCredentials && process.env.SOFIA_WHATSAPP_AUTOREPLY === "true" && app.provider.name !== "demo";
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
        <Link href="/piloto" className="mb-3 flex min-h-12 items-center justify-center rounded-2xl bg-sand px-3 text-[15px] font-semibold text-ink">Registrar prospecto y cita desde WhatsApp</Link>
        <WhatsAppAssistant initialName={customer?.name ?? ""} initialPhone={customer?.phone ?? ""} />
        <section className="rounded-2xl border border-white/10 bg-panel p-4 text-[13px] leading-relaxed text-dim">
          <strong className="block text-ivory">Conector oficial WhatsApp Cloud API</strong>
          <p className="mt-2">{cloudCredentials ? "Credenciales de Meta cargadas en el servidor. Falta comprobar la suscripción y entrega del webhook en Meta." : "No configurado todavía: esta pantalla sigue permitiendo preparar borradores de forma manual."}</p>
          <p className="mt-2">Respuesta automática: <strong className="text-ivory">{autoReply ? "Habilitada (requiere pruebas de entrega)" : "Desactivada / supervisada por Mario"}</strong>.</p>
          <p className="mt-2">Las citas sugeridas por Sofía siguen pendientes de verificación del horario. No se consideran confirmadas hasta reservar disponibilidad real.</p>
          <a className="mt-3 inline-block underline" href="/customers">Ver prospectos y conversaciones</a>
        </section>
      </Page>
    </>
  );
}
