import type { Metadata } from "next";
import Link from "next/link";
import { SystemBadge } from "@/components/SystemBadge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sofía · Asistente comercial",
  description: "Cerebro, memoria y simulador de Sofía, asistente comercial de Mario Abarca (Honda).",
};

const NAV = [
  { href: "/simulator", label: "Simulador" },
  { href: "/mario", label: "Bandeja de Mario" },
  { href: "/rules", label: "Reglas comerciales" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center gap-6 border-b border-slate-800 bg-slate-900 px-4 text-slate-100">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">Sofía</span>
            <span className="text-xs text-slate-400">asistente comercial de Mario Abarca · Honda</span>
          </div>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-3 py-1 text-slate-300 hover:bg-slate-800 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <SystemBadge />
          </div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
