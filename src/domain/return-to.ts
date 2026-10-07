const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Solo regresos internos a una solicitud del mismo cliente (evita redirecciones abiertas). */
export function safeReturn(customerId: string, v: string | undefined | null): string | null {
  if (!v || !UUID.test(customerId)) return null;
  const m = v.match(/^\/customers\/([0-9a-f-]{36})\/credit\/([0-9a-f-]{36})(\?step=[a-z]+)?$/);
  return m && m[1] === customerId && UUID.test(m[2]!) ? v : null;
}
