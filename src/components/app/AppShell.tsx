"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Inicio", icon: "⌂", match: (p: string) => p === "/" },
  { href: "/customers", label: "Clientes", icon: "☺", match: (p: string) => p.startsWith("/customers") },
  { href: "/sales", label: "Ventas", icon: "◈", match: (p: string) => p.startsWith("/sales") },
  { href: "/alerts", label: "Alertas", icon: "!", match: (p: string) => p.startsWith("/alerts") },
  { href: "/more", label: "Más", icon: "⋯", match: (p: string) => ["/more", "/rules", "/simulator", "/mario", "/settings"].some((x) => p.startsWith(x)) },
];

/** iPhone: navegación inferior. Escritorio/tablet: barra lateral. */
export function AppShell({ children, alertCount = 0 }: { children: ReactNode; alertCount?: number }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="flex h-dvh min-h-0">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-5 lg:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold tracking-tight text-zinc-50">Sofía</div>
          <div className="text-xs text-zinc-500">Operación comercial · Mario Abarca</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${n.match(pathname) ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"}`}
            >
              <span className="w-5 text-center" aria-hidden>
                {n.icon}
              </span>
              {n.label}
              {n.href === "/alerts" && alertCount > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2 text-xs text-white">{alertCount}</span>}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link key={n.href} href={n.href} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-emerald-400" : "text-zinc-400"}`}>
              <span className="text-lg leading-none" aria-hidden>
                {n.icon}
              </span>
              {n.label}
              {n.href === "/alerts" && alertCount > 0 && <span className="absolute right-[22%] top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function MobileHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {back && (
          <Link href={back} aria-label="Regresar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-zinc-300 hover:bg-zinc-800">
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-zinc-50">{title}</h1>
          {subtitle && <div className="truncate text-sm text-zinc-400">{subtitle}</div>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">{children}</div>;
}
