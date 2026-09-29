/** Health check para el hosting (sin datos; no requiere Basic Auth). */
export function GET() {
  return Response.json({ ok: true });
}
