import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { getAppContext } from "@/server/app";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  const app = await getAppContext();
  const metaReady = Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  const metaAuto = metaReady && process.env.SOFIA_WHATSAPP_AUTOREPLY === "true" && app.provider.name !== "demo";
  const bikyInbound = Boolean(process.env.SOFIA_BIKY_BOOKING_WEBHOOK_TOKEN);
  const marioNotify = Boolean((process.env.SOFIA_MARIO_NOTIFY_FLOW_URL && process.env.SOFIA_MARIO_NOTIFY_FLOW_TOKEN) ||
    (process.env.SOFIA_MARIO_WHATSAPP_TO && process.env.SOFIA_MARIO_TEMPLATE && process.env.WHATSAPP_ACCESS_TOKEN));
  return (
    <>
      <MobileHeader title="Sofía por WhatsApp" subtitle="Asistente comercial autónoma" />
      <Page>
        <section className="rounded-3xl bg-panel p-5">
          <h1 className="text-[24px] font-semibold text-ivory">Sofía atiende. Mario cierra.</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-dim">El objetivo es recibir los mensajes, conversar de forma natural, agendar solo con disponibilidad real y avisar a Mario por WhatsApp cuando ya esté confirmada la cita.</p>
          <div className="mt-5 space-y-3 text-[14px]">
            <div className="rounded-xl bg-raise p-3">
              <strong className="block text-ivory">Respuestas de WhatsApp Cloud API</strong>
              <span className="text-dim">{metaAuto ? "Autorizadas en configuración. Verificar conexión y entrega real." : metaReady ? "Credenciales presentes. Autorespuesta inactiva." : "Sin conexión directa configurada. Si BIKY administra la línea, usar su agente con habilidad Agendamiento."}</span>
            </div>
            <div className="rounded-xl bg-raise p-3">
              <strong className="block text-ivory">Citas confirmadas de BIKY</strong>
              <span className="text-dim">{bikyInbound ? "Receptor configurado. Requiere comprobar el evento oficial de cita confirmada." : "Pendiente de integrar el flujo de reservas confirmadas de BIKY."}</span>
            </div>
            <div className="rounded-xl bg-raise p-3">
              <strong className="block text-ivory">Aviso automático a Mario</strong>
              <span className="text-dim">{marioNotify ? "Transporte configurado. Requiere verificar entrega en WhatsApp." : "Pendiente de configurar Flow autorizado o plantilla de WhatsApp aprobada."}</span>
            </div>
          </div>
          <p className="mt-4 text-[12px] text-faint">Sofía no debe confirmar citas por texto hasta recibir la reserva del calendario real. El motor DEMO nunca se envía automáticamente a clientes.</p>
        </section>
        <Link href="/settings/mario-voice" className="flex min-h-14 items-center justify-center rounded-2xl bg-sand px-4 text-[15px] font-semibold text-ink">
          Entrenar la personalidad de Mario
        </Link>
        <div className="grid grid-cols-2 gap-3 text-center">
          <Link href="/agenda" className="flex min-h-14 items-center justify-center rounded-2xl bg-panel px-4 text-[15px] text-ivory">Ver agenda</Link>
          <Link href="/mario" className="flex min-h-14 items-center justify-center rounded-2xl bg-panel px-4 text-[15px] text-ivory">Alertas Mario</Link>
        </div>
      </Page>
    </>
  );
}
