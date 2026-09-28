import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app/AppShell";
import { getAppContext } from "@/server/app";
import { getDashboardCounts } from "@/server/services/nav";
import "./globals.css";

// Toda la app lee datos vivos de la BD (nada se prerenderiza con datos).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Sofía", template: "%s · Sofía" },
  description: "Operación comercial de Mario Abarca: clientes, crédito, ventas y alertas.",
  manifest: "/manifest.webmanifest",
  applicationName: "Sofía",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Sofía" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/192", apple: "/apple-icon" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const app = await getAppContext();
  const alertCount = await getDashboardCounts(app);
  return (
    <html lang="es-MX" className="dark">
      <body>
        <AppShell alertCount={alertCount}>{children}</AppShell>
      </body>
    </html>
  );
}
