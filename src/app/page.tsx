import Link from "next/link";
import { SofiaCommand } from "@/components/sofia/SofiaCommand";
import { TodayList } from "@/components/sofia/TodayList";
import { getAppContext } from "@/server/app";
import { getTodayItems } from "@/server/services/today";

const QUICK = [
  { label: "Cotizar", href: "/quote" },
  { label: "Solicitud", href: "/customers?f=credit" },
  { label: "Seguimiento", href: "/agenda#seguimiento" },
  { label: "Cita", href: "/agenda?new=1" },
  { label: "Venta", href: "/sales" },
];

/** HOME: "¿Qué necesito hacer ahorita?" — comando/voz arriba y solo lo que requiere acción. */
export default async function HomePage() {
  const app = await getAppContext();
  const items = await getTodayItems(app);
  const raw = app.clock.now().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const today = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <div className="mx-auto flex max-w-xl flex-col px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="flex items-center justify-between">
        <span className="sofia-title text-[13px] font-semibold text-sand">SOFÍA</span>
        <span className="text-[13px] text-faint">{today}</span>
      </div>
      <h1 className="mt-6 text-[30px] font-semibold leading-tight tracking-tight text-ivory">¿Qué necesitas, Mario?</h1>
      <div className="mt-5">
        <SofiaCommand />
      </div>

      <nav aria-label="Acciones rápidas" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {QUICK.map((q) => (
          <Link key={q.label} href={q.href} className="flex min-h-11 shrink-0 items-center rounded-full bg-panel px-5 text-[15px] text-ivory active:bg-raise">
            {q.label}
          </Link>
        ))}
      </nav>

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="sofia-title text-[12px] font-semibold text-dim">HOY</h2>
          {items.length > 0 && <span className="text-[13px] text-faint">{items.length} por atender</span>}
        </div>
        <div className="mt-1">
          <TodayList items={items.slice(0, 10)} />
        </div>
      </section>
    </div>
  );
}
