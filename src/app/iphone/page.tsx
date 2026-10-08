import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";

const tools = [
  { href: "/correos", icon: "✉️", title: "Asistente de correos", detail: "Asigna tu correo, revisa borradores y envía con confirmación." },
  { href: "/plates", icon: "🚘", title: "Correos de placas", detail: "Prepara solicitudes de placas con adjuntos desde el expediente." },
  { href: "/customers", icon: "🪪", title: "INE y solicitudes", detail: "Abre un cliente, toma foto de la INE y revisa los datos antes de llenar la solicitud." },
  { href: "/settings/reminders", icon: "⏰", title: "Recordatorios", detail: "Registra tareas y agrégalas al Calendario del iPhone." },
  { href: "/whatsapp", icon: "💬", title: "WhatsApp", detail: "Mensajes sugeridos, editables y listos para abrir en WhatsApp." },
];

export default function IPhonePage() {
  return (
    <>
      <MobileHeader title="Sofía para iPhone" back="/more" subtitle="Centro de herramientas" />
      <Page>
        <section className="rounded-3xl bg-panel p-5">
          <h2 className="text-[19px] font-semibold text-ivory">Instalar en la pantalla de inicio</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-dim">
            En Safari, toca Compartir → Agregar a pantalla de inicio → Abrir como app → Agregar.
            Abre el nuevo icono de Sofía. No necesitas App Store.
          </p>
          <p className="mt-3 text-[13px] text-alert">
            Entorno piloto: no subas documentos de identidad ni datos financieros reales
            hasta que estén conectados el almacenamiento privado y la base persistente.
          </p>
        </section>
        <nav aria-label="Herramientas para iPhone" className="grid gap-3">
          {tools.map((t) => (
            <Link key={t.href} href={t.href} className="flex min-h-24 items-center gap-4 rounded-3xl bg-panel p-5 active:bg-raise">
              <span aria-hidden className="text-[30px]">{t.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold text-ivory">{t.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-dim">{t.detail}</span>
              </span>
              <span aria-hidden className="text-xl text-faint">›</span>
            </Link>
          ))}
        </nav>
        <form method="post" action="/salir">
          <button type="submit" className="min-h-12 w-full rounded-2xl bg-raise px-4 text-[15px] text-ivory">
            Cerrar sesión en este iPhone
          </button>
        </form>
        <p className="text-[13px] text-faint">
          En iPhone las alarmas Android no funcionan. Para avisos fuera de Sofía utiliza Calendario
          y confirma su importación. Las notificaciones push web requieren configuración adicional en el servidor.
        </p>
      </Page>
    </>
  );
}
