import { createHash } from "node:crypto";
import { getAppContext } from "@/server/app";
import { upcomingDeviceReminders } from "@/server/services/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function fold(line: string): string {
  let out = "", segment = "";
  for (const c of line) {
    if (Buffer.byteLength(segment + c, "utf8") > 70) {
      out += segment + "\r\n ";
      segment = c;
    } else segment += c;
  }
  return out + segment;
}
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Descarga individual de un recordatorio para importarlo manualmente a Calendario en iPhone.
 * No equivale a push: la persona debe agregar el evento.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key || key.length > 300) return Response.json({ error: "Elige un recordatorio." }, { status: 400 });
  const app = await getAppContext();
  const reminders = await upcomingDeviceReminders(app);
  const r = reminders.find((entry) => entry.key === key);
  if (!r) return Response.json({ error: "Recordatorio no encontrado o ya vencido." }, { status: 404 });
  const start = new Date(r.at);
  const end = new Date(start.getTime() + 15 * 60_000);
  const uid = createHash("sha256").update(r.key).digest("hex").slice(0, 32);
  const raw = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sofia//Recordatorios iPhone//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@sofia.local`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(r.title)}`,
    `DESCRIPTION:${icsEscape(r.body)}`,
    `URL:${new URL(r.url, url.origin).toString()}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(r.title)}`,
    "TRIGGER:PT0S",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(raw.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sofia-recordatorio.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
