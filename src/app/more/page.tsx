import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { Pill, SectionCard } from "@/components/app/ui";
import { getAppContext } from "@/server/app";
import { listInstitutions } from "@/server/services/credit";
import * as s from "@/server/db/schema";

const LINKS = [
  { href: "/rules", title: "Reglas comerciales", detail: "Precios, bonos, tasas y vigencias (DEMO) + probador de reglas" },
  { href: "/sales/table", title: "Control de ventas (tabla)", detail: "Vista de escritorio con todas las columnas" },
  { href: "/simulator", title: "Simulador de Sofía", detail: "Herramienta técnica: conversar como cliente sin WhatsApp" },
  { href: "/mario", title: "Bandeja técnica", detail: "Alertas y aprobaciones (vista de Sprint 1)" },
];

export default async function MorePage() {
  const app = await getAppContext();
  const [institutions, templates] = await Promise.all([listInstitutions(app), app.db.select().from(s.applicationTemplates)]);
  return (
    <>
      <MobileHeader title="Más" />
      <Page>
        <nav className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-16 items-center gap-3 border-b border-zinc-800 px-4 py-3 last:border-0 active:bg-zinc-800">
              <div className="min-w-0 flex-1">
                <div className="text-base text-zinc-100">{l.title}</div>
                <div className="text-sm text-zinc-500">{l.detail}</div>
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
                <div className="text-xs text-zinc-500">
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
          <p className="mt-1 text-xs text-zinc-500">Comisiones: estructura preparada, sin reglas hasta que Mario las confirme.</p>
        </SectionCard>
      </Page>
    </>
  );
}
