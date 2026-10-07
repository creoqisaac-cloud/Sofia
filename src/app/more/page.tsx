import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { Pill, SectionCard } from "@/components/app/ui";
import { getAppContext } from "@/server/app";
import { isTabletMode } from "@/server/pilot";
import { aiUsageSince } from "@/server/services/ai-usage";
import { listInstitutions } from "@/server/services/credit";
import * as s from "@/server/db/schema";

const LINKS = [
  { href: "/settings/email", title: "Correo de Sofía", detail: "Asigna el correo desde el que Sofía envía (placas, documentos)" },
  { href: "/quote", title: "Cotizar", detail: "Corrida con fuentes; dice exactamente qué falta" },
  { href: "/plates", title: "Placas", detail: "Trámites, requisitos con fuente y correo al gestor" },
  { href: "/returns", title: "Devoluciones", detail: "Pendiente de definición por Mario (registro mínimo)" },
  { href: "/alerts", title: "Alertas", detail: "Mario, entra tú · alertas operativas" },
  { href: "/programs", title: "Programas de financiamiento", detail: "Calibración contra corridas reales" },
  { href: "/rules", title: "Reglas comerciales", detail: "Precios, bonos, tasas y vigencias (DEMO) + probador de reglas" },
  { href: "/sales/table", title: "Control de ventas (tabla)", detail: "Vista de escritorio con todas las columnas" },
  { href: "/simulator", title: "Simulador de Sofía", detail: "Herramienta técnica: conversar como cliente sin WhatsApp" },
  { href: "/mario", title: "Bandeja técnica", detail: "Alertas y aprobaciones (vista de Sprint 1)" },
];

const TABLET_LINKS = [
  { href: "/settings/email", title: "Correo de Sofía", detail: "Asigna el correo desde el que Sofía envía (placas, documentos)" },
  { href: "/settings/reminders", title: "Recordatorios y alarmas", detail: "Avisos en la tablet aunque la app esté cerrada" },
  { href: "/sales", title: "Ventas", detail: "Pedido, factura y entrega" },
  { href: "/agenda", title: "Agenda", detail: "Citas de los próximos días" },
  { href: "/returns", title: "Devoluciones", detail: "Pendiente de definición por Mario (registro mínimo)" },
  { href: "/customers/new", title: "Cliente nuevo", detail: "Dar de alta un cliente" },
];

export default async function MorePage() {
  const app = await getAppContext();
  if (await isTabletMode()) {
    const usage = await aiUsageSince(app, new Date(app.clock.now().getTime() - 30 * 86_400_000));
    return (
      <>
        <MobileHeader title="Más" />
        <Page>
          <nav className="overflow-hidden rounded-2xl bg-panel">
            {TABLET_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3 last:border-0 active:bg-raise">
                <div className="min-w-0 flex-1">
                  <div className="text-base text-ivory">{l.title}</div>
                  <div className="text-sm text-faint">{l.detail}</div>
                </div>
                <span className="text-xl text-faint">›</span>
              </Link>
            ))}
          </nav>
          <SectionCard title="Sistema">
            <p className="text-sm text-dim">
              Uso de IA en 30 días: {usage.total === 0 ? "ninguno (todo funciona sin IA)" : `${usage.total} llamada(s)`}. Base de datos: {app.dbKind === "pglite" ? "local (PGlite)" : "PostgreSQL"}.
            </p>
          </SectionCard>
        </Page>
      </>
    );
  }
  const [institutions, templates] = await Promise.all([listInstitutions(app), app.db.select().from(s.applicationTemplates)]);
  return (
    <>
      <MobileHeader title="Más" />
      <Page>
        <nav className="overflow-hidden rounded-2xl bg-panel">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3 last:border-0 active:bg-raise">
              <div className="min-w-0 flex-1">
                <div className="text-base text-ivory">{l.title}</div>
                <div className="text-sm text-faint">{l.detail}</div>
              </div>
              <span className="text-xl text-zinc-600">›</span>
            </Link>
          ))}
        </nav>
        <SectionCard title="Configuración · plantillas de solicitud" subtitle="Registra el PDF real con `npm run pdf:register` (fuera de git).">
          <ul className="divide-y divide-zinc-800">
            {templates.map((t) => (
              <li key={t.id} className="py-2 text-sm">
                <div className="flex items-center gap-2 text-zinc-100">
                  {institutions.find((i) => i.id === t.institutionId)?.name} · {t.name} {t.isDemo && <Pill tone="violet">DEMO</Pill>} {!t.active && <Pill>inactiva</Pill>}
                </div>
                <div className="text-xs text-faint">
                  versión {t.version} · {Object.keys(t.fieldMapping).length} campos mapeados
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="Sistema">
          <p className="text-sm text-zinc-400">
            Cerebro: {app.provider.name === "anthropic" ? "Claude" : "motor demo (sin IA externa)"} · Base de datos: {app.dbKind === "pglite" ? "local (PGlite)" : "PostgreSQL"}
          </p>
          <p className="mt-1 text-xs text-faint">Comisiones: estructura preparada, sin reglas hasta que Mario las confirme.</p>
        </SectionCard>
      </Page>
    </>
  );
}
