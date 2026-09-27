/** Utilidades para route handlers: validación y errores sin filtrar detalles internos ni PII. */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { logger } from "./lib/logger";
import { ServiceError } from "./services/customers";

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ServiceError("JSON inválido.");
  }
  return schema.parse(json);
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const data = await fn(...args);
      return NextResponse.json(data ?? { ok: true });
    } catch (error) {
      if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Datos inválidos.", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
      }
      logger.error("api.error", { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "Error interno." }, { status: 500 });
    }
  };
}
