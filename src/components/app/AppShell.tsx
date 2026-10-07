"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconCalendar, IconCar, IconDoc, IconHome, IconMore, IconPeople, IconPlate } from "@/components/sofia/icons";
import { ReminderSync } from "@/components/sofia/ReminderSync";

type NavItem = { href: string; label: string; Icon: typeof IconHome; match: (p: string) => boolean };

/** Modo tablet (piloto de Mario): Solicitudes, Seguimiento y Placas al frente; sin herramientas de desarrollo. */
const TABLET_NAV: NavItem[] = [
  { href: "/", label: "Inicio", Icon: IconHome, match: (p: string) => p === "/" },
  { href: "/customers", label: "Clientes", Icon: IconPeople, match: (p: string) => p.startsWith("/customers") && !p.includes("/credit") },
  { href: "/applications", label: "Solicitudes", Icon: IconDoc, match: (p: string) => p.startsWith("/applications") || p.includes("/credit") },
  { href: "/followups", label: "Seguimiento", Icon: IconCalendar, match: (p: string) => p.startsWith("/followups") || p.startsWith("/agenda") },
  { href: "/plates", label: "Placas", Icon: IconPlate, match: (p: string) => p.startsWith("/plates") || p.startsWith("/emails") },
  { href: "/more", label: "Más", Icon: IconMore, match: (p: string) => ["/more", "/sales", "/returns"].some((x) => p.startsWith(x)) },
];

const NAV: NavItem[] = [
  { href: "/", label: "Inicio", Icon: IconHome, match: (p: string) => p === "/" || p.startsWith("/quote") },
  { href: "/customers", label: "Clientes", Icon: IconPeople, match: (p: string) => p.startsWith("/customers") },
  { href: "/agenda", label: "Agenda", Icon: IconCalendar, match: (p: string) => p.startsWith("/agenda") },
  { href: "/sales", label: "Ventas", Icon: IconCar, match: (p: string) => p.startsWith("/sales") },
  { href: "/more", label: "Más", Icon: IconMore, match: (p: string) => ["/more", "/rules", "/simulator", "/mario", "/alerts", "/plates", "/emails", "/returns", "/programs"].some((x) => p.startsWith(x)) },
];

/** iPhone: navegación inferior. Escritorio/tablet: barra lateral. */
export function AppShell({ children, alertCount = 0, mode = "full" }: { children: ReactNode; alertCount?: number; mode?: "full" | "tablet" }) {
  const pathname = usePathname() ?? "/";
  const items = mode === "tablet" ? TABLET_NAV : NAV;
  return (
    <div className="flex h-dvh min-h-0">
      <ReminderSync />
      <aside className="hidden w-60 shrink-0 flex-col bg-ink px-4 py-6 lg:flex">
        <div className="mb-8 px-2">
          <div className="sofia-title text-sm font-semibold text-sand">SOFÍA</div>
          <div className="mt-1 text-xs text-faint">Copiloto de Mario Abarca</div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {items.map(({ href, label, Icon, match }) => (
            <Link key={href} href={href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${match(pathname) ? "bg-raise text-ivory" : "text-dim hover:text-ivory"}`}>
              <Icon />
              {label}
              {href === "/more" && alertCount > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-alert" />}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:border-l lg:border-line lg:pb-0">{children}</main>
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-40 flex bg-ink/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link key={href} href={href} className={`relative flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-1 text-[11px] ${active ? "text-sand" : "text-faint"}`}>
              <Icon width={23} height={23} />
              {label}
              {href === "/more" && alertCount > 0 && <span className="absolute right-[26%] top-2 h-1.5 w-1.5 rounded-full bg-alert" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function MobileHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-ink/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {back && (
          <Link href={back} aria-label="Regresar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-3xl font-light text-dim hover:text-ivory">
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-ivory">{title}</h1>
          {subtitle && <div className="truncate text-sm text-dim">{subtitle}</div>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">{children}</div>;
}
