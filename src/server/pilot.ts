/**
 * Modo "Mario Tablet": experiencia piloto simplificada (Solicitudes, Seguimiento, Placas).
 * Se activa cuando la página se abre desde la APK (user-agent "SofiaTablet"), con ?modo=tablet
 * (cookie) o con SOFIA_PILOT_MODE=tablet. No borra funciones: solo las oculta de la navegación.
 */
import { cookies, headers } from "next/headers";

export const TABLET_UA = "SofiaTablet";
export const MODE_COOKIE = "sofia_modo";

export async function isTabletMode(): Promise<boolean> {
  if (process.env.SOFIA_PILOT_MODE === "tablet") return true;
  const [h, c] = await Promise.all([headers(), cookies()]);
  if ((h.get("user-agent") ?? "").includes(TABLET_UA)) return true;
  return c.get(MODE_COOKIE)?.value === "tablet";
}

export function isTabletUserAgent(ua: string | null | undefined): boolean {
  return (ua ?? "").includes(TABLET_UA) || process.env.SOFIA_PILOT_MODE === "tablet";
}
