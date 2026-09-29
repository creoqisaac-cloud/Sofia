/**
 * Capa HTTP de Alexa: verifica SIEMPRE firma y timestamp con los verificadores oficiales
 * (ask-sdk-express-adapter) antes de tocar la lógica. Sin firma válida → 400.
 *
 * Bypass solo para pruebas automatizadas: ALEXA_SKIP_VERIFICATION_FOR_TESTS=true Y NODE_ENV=test.
 */
import {
  SkillRequestSignatureVerifier,
  TimestampVerifier,
} from "ask-sdk-express-adapter";
import type { RequestEnvelope } from "ask-sdk-model";
import type { AppContext } from "../app";
import { logger } from "../lib/logger";
import { invokeSkill } from "./skill";

export function verificationBypassed(): boolean {
  return (
    process.env.ALEXA_SKIP_VERIFICATION_FOR_TESTS === "true" &&
    process.env.NODE_ENV === "test"
  );
}

export async function verifyAlexaRequest(
  rawBody: string,
  headers: Record<string, string>,
): Promise<void> {
  if (verificationBypassed()) return;
  // Timestamp primero (barato, sin red); luego firma + cadena de certificados de Amazon.
  await new TimestampVerifier().verify(rawBody);
  await new SkillRequestSignatureVerifier().verify(rawBody, headers);
}

export async function processAlexaHttp(
  rawBody: string,
  headers: Headers | Record<string, string>,
  getApp: () => Promise<AppContext>,
): Promise<Response> {
  const plain: Record<string, string> = {};
  if (headers instanceof Headers)
    headers.forEach((v, k) => (plain[k.toLowerCase()] = v));
  else for (const [k, v] of Object.entries(headers)) plain[k.toLowerCase()] = v;
  try {
    await verifyAlexaRequest(rawBody, plain);
  } catch (e) {
    logger.warn("alexa.rejected", {
      reason: e instanceof Error ? e.message.slice(0, 120) : "verificación",
    });
    return Response.json(
      { error: "Solicitud de Alexa no verificada." },
      { status: 400 },
    );
  }
  let envelope: RequestEnvelope;
  try {
    envelope = JSON.parse(rawBody) as RequestEnvelope;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const res = await invokeSkill(await getApp(), envelope);
  return Response.json(res, { headers: { "Cache-Control": "no-store" } });
}
