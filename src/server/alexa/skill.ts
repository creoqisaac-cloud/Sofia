/**
 * Adaptador Alexa: SOLO otra interfaz de entrada/salida para el command router existente.
 *
 *   RequestEnvelope → (texto de Mario) → runCommand / executeConfirmed → toAlexaSpeech → ResponseEnvelope
 *
 * No hay lógica comercial aquí. Las acciones que modifican algo usan la MISMA confirmación
 * del router. Las cotizaciones por voz solo LEEN corridas guardadas/validadas (no se calcula nada nuevo).
 */
import { randomUUID } from "node:crypto";
import {
  SkillBuilders,
  type HandlerInput,
  type RequestHandler,
} from "ask-sdk-core";
import type {
  IntentRequest,
  RequestEnvelope,
  ResponseEnvelope,
} from "ask-sdk-model";
import { and, desc, eq } from "drizzle-orm";
import { parseCommand } from "@/domain/command";
import { formatMXN } from "@/domain/money";
import type { AppContext } from "../app";
import { findVehicle, findVersion, loadCatalog } from "../commercial/catalog";
import {
  catalogModels,
  executeConfirmed,
  executeParsed,
  PendingActionSchema,
  type PendingAction,
} from "../command/router";
import * as s from "../db/schema";
import { logger } from "../lib/logger";
import { ServiceError } from "../services/errors";
import { lookupScenario } from "../services/quotes";
import { scrubForVoice, toAlexaSpeech } from "./speech";

export const LAUNCH_SPEECH = "Soy Sofía. ¿Qué necesitas, Mario?";
export const HELP_SPEECH =
  "Pregúntame, por ejemplo: qué tengo pendiente hoy, busca a Juan, qué le falta, o agenda a Juan mañana a las cinco.";
export const NO_SAVED_QUOTE =
  "No tengo una corrida guardada para ese escenario. Mario tiene que agregarla.";
const REPROMPT = "¿Algo más?";

/** Prefijo que se devuelve al texto cuando la frase entró por un intent con palabra de arranque (AMAZON.SearchQuery exige una). */
export const INTENT_PREFIX: Record<string, string> = {
  SofiaCommandIntent: "",
  QueIntent: "qué",
  CualesIntent: "cuáles",
  BuscaIntent: "busca",
  AgendaIntent: "agenda",
  CotizaIntent: "cotiza",
  RegistraIntent: "registra",
  MarcaIntent: "marca",
  PreparaIntent: "prepara",
  AbreIntent: "abre",
  RecuerdameIntent: "recuérdame",
  ComoVaIntent: "cómo va",
};

export interface AlexaSession {
  lastCustomerId?: string;
  /** Solo el primer nombre (no PII sensible) para que Alexa pueda decir "Juan". */
  lastCustomerName?: string;
  lastIntent?: string;
  pendingConfirmationId?: string;
}

// Acciones por confirmar: se guardan en el servidor; a Alexa solo viaja un ID opaco.
const PENDING_TTL_MS = 5 * 60_000;
const pending = new Map<string, { action: PendingAction; expires: number }>();
function storePending(action: PendingAction): string {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  const id = randomUUID();
  pending.set(id, { action, expires: now + PENDING_TTL_MS });
  return id;
}
function takePending(id: string | undefined): PendingAction | null {
  if (!id) return null;
  const p = pending.get(id);
  pending.delete(id);
  if (!p || p.expires < Date.now()) return null;
  return PendingActionSchema.parse(p.action);
}

async function rememberCustomer(
  app: AppContext,
  session: AlexaSession,
  customerId: string | null | undefined,
) {
  if (!customerId) return;
  const [c] = await app.db
    .select({ name: s.customers.displayName })
    .from(s.customers)
    .where(eq(s.customers.id, customerId));
  session.lastCustomerId = customerId;
  session.lastCustomerName = c?.name
    .replace(/\s*\(DEMO\)\s*/i, "")
    .split(" ")[0];
}

/** Cotización por voz: SOLO corridas guardadas/validadas para el escenario exacto. Nunca se calcula una nueva. */
async function savedQuoteSpeech(
  app: AppContext,
  p: {
    model?: string;
    version?: string;
    downPayment?: number;
    termMonths?: number;
  },
): Promise<string> {
  if (!p.model || !p.downPayment || !p.termMonths)
    return "Dime modelo, versión, enganche y plazo. Por ejemplo: cotiza una HR-V Touring con 150 mil a 48 meses.";
  const cat = await loadCatalog(app.db, app.workspaceId);
  const vehicle = findVehicle(cat, p.model);
  const version =
    vehicle && p.version ? findVersion(cat, vehicle.id, p.version) : null;
  if (!vehicle || !version) return NO_SAVED_QUOTE;
  const label = `${vehicle.model} ${version.name}, ${formatMXN(p.downPayment)} de enganche a ${p.termMonths} meses`;
  const demo = (isDemo: boolean) => (isDemo ? ", con datos de prueba" : "");
  // 1) Corrida exacta ya guardada (cotizador V2, programa validado)
  const [run] = await app.db
    .select()
    .from(s.quoteRuns)
    .where(
      and(
        eq(s.quoteRuns.workspaceId, app.workspaceId),
        eq(s.quoteRuns.versionId, version.id),
        eq(s.quoteRuns.saved, true),
        eq(s.quoteRuns.exactness, "exact"),
        eq(s.quoteRuns.termMonths, p.termMonths),
      ),
    )
    .orderBy(desc(s.quoteRuns.createdAt))
    .limit(20)
    .then((rows) =>
      rows.filter((r) => Math.abs(r.downPayment - p.downPayment!) <= 1),
    );
  if (run?.monthlyPayment)
    return scrubForVoice(
      `${label}: la corrida guardada queda en ${formatMXN(run.monthlyPayment)} mensuales${demo(run.isDemo)}.`,
    );
  // 2) Corrida validada de referencia (memoria de corridas reales)
  const examples = await app.db
    .select()
    .from(s.validatedQuoteExamples)
    .where(
      and(
        eq(s.validatedQuoteExamples.workspaceId, app.workspaceId),
        eq(s.validatedQuoteExamples.versionId, version.id),
        eq(s.validatedQuoteExamples.termMonths, p.termMonths),
      ),
    );
  const ex = examples.find(
    (e) =>
      Math.abs(e.downPayment - p.downPayment!) <= 1 &&
      e.expected.monthly_payment,
  );
  if (ex)
    return scrubForVoice(
      `${label}: la corrida validada queda en ${formatMXN(ex.expected.monthly_payment!)} mensuales${demo(ex.isDemo)}.`,
    );
  // 3) Corrida validada guardada por Mario (Sprint 2)
  const tpl = await lookupScenario(app, {
    model: vehicle.model,
    version: version.name,
    downPayment: p.downPayment,
    termMonths: p.termMonths,
  }).catch(() => null);
  if (tpl?.validated)
    return scrubForVoice(
      `${label}: la corrida validada queda en ${formatMXN(tpl.validated.monthlyPayment)} mensuales${demo(tpl.validated.isDemo)}.`,
    );
  return NO_SAVED_QUOTE;
}

/** Un turno de voz: texto → router existente → frase corta. */
export async function handleUtterance(
  app: AppContext,
  text: string,
  session: AlexaSession,
): Promise<{ speech: string; endSession: boolean }> {
  const parsed = parseCommand(text, await catalogModels(app), app.clock.now());
  session.lastIntent = parsed.intent;
  if (parsed.intent === "quote")
    return {
      speech: await savedQuoteSpeech(app, parsed.params),
      endSession: false,
    };
  try {
    const res = await executeParsed(app, parsed, {
      lastCustomerId: session.lastCustomerId ?? null,
    });
    await rememberCustomer(app, session, res.customerId);
    if (res.confirm)
      session.pendingConfirmationId = storePending(res.confirm.action);
    else delete session.pendingConfirmationId;
    return {
      speech: toAlexaSpeech(res, app.clock.now()).speech,
      endSession: false,
    };
  } catch (e) {
    if (e instanceof ServiceError)
      return { speech: scrubForVoice(e.message), endSession: false };
    throw e;
  }
}

export async function handleConfirmation(
  app: AppContext,
  session: AlexaSession,
  accept: boolean,
): Promise<string> {
  const action = takePending(session.pendingConfirmationId);
  delete session.pendingConfirmationId;
  if (!action)
    return accept ? "No tengo nada pendiente por confirmar." : "Está bien.";
  if (!accept) return "Listo, no hice nada.";
  try {
    const r = await executeConfirmed(app, action);
    return (
      scrubForVoice(r.message.replace(/:.*$/, "")) + ". Ya quedó en Sofía."
    );
  } catch (e) {
    if (e instanceof ServiceError) return scrubForVoice(e.message);
    throw e;
  }
}

function slotText(input: HandlerInput): string {
  const req = input.requestEnvelope.request as IntentRequest;
  const prefix = INTENT_PREFIX[req.intent.name] ?? "";
  const value = req.intent.slots?.query?.value ?? "";
  return `${prefix} ${value}`.trim();
}

const isIntent = (input: HandlerInput, ...names: string[]) =>
  input.requestEnvelope.request.type === "IntentRequest" &&
  names.includes((input.requestEnvelope.request as IntentRequest).intent.name);

export function buildSkill(app: AppContext) {
  const attrs = (input: HandlerInput) =>
    input.attributesManager.getSessionAttributes() as AlexaSession;
  const say = (input: HandlerInput, speech: string, end = false) => {
    const rb = input.responseBuilder.speak(escapeSsml(speech));
    return end
      ? rb.withShouldEndSession(true).getResponse()
      : rb.reprompt(REPROMPT).withShouldEndSession(false).getResponse();
  };
  const handlers: RequestHandler[] = [
    {
      canHandle: (i) => i.requestEnvelope.request.type === "LaunchRequest",
      handle: (i) => say(i, LAUNCH_SPEECH),
    },
    {
      canHandle: (i) => isIntent(i, "ConfirmIntent", "RejectIntent"),
      async handle(i) {
        const session = attrs(i);
        const speech = await handleConfirmation(
          app,
          session,
          isIntent(i, "ConfirmIntent"),
        );
        i.attributesManager.setSessionAttributes(session);
        return say(i, speech);
      },
    },
    {
      canHandle: (i) => isIntent(i, ...Object.keys(INTENT_PREFIX)),
      async handle(i) {
        const session = attrs(i);
        const text = slotText(i);
        if (!text) return say(i, "No te escuché bien. ¿Qué necesitas?");
        // Una nueva orden descarta cualquier confirmación pendiente anterior.
        takePending(session.pendingConfirmationId);
        delete session.pendingConfirmationId;
        const r = await handleUtterance(app, text, session);
        i.attributesManager.setSessionAttributes(session);
        return say(i, r.speech, r.endSession);
      },
    },
    {
      canHandle: (i) => isIntent(i, "AMAZON.HelpIntent"),
      handle: (i) => say(i, HELP_SPEECH),
    },
    {
      canHandle: (i) => isIntent(i, "AMAZON.StopIntent", "AMAZON.CancelIntent"),
      handle: (i) => say(i, "Hasta luego, Mario.", true),
    },
    {
      canHandle: (i) => isIntent(i, "AMAZON.FallbackIntent"),
      handle: (i) => say(i, `No entendí. ${HELP_SPEECH}`),
    },
    {
      canHandle: (i) =>
        i.requestEnvelope.request.type === "SessionEndedRequest",
      handle: (i) => i.responseBuilder.getResponse(),
    },
  ];
  const builder = SkillBuilders.custom()
    .addRequestHandlers(...handlers)
    .addErrorHandlers({
      canHandle: () => true,
      handle(i, err) {
        // Nunca se registra el texto dicho (puede traer datos personales).
        logger.error("alexa.error", { error: err.message });
        return say(
          i,
          "Tuve un problema con eso. Inténtalo de nuevo o revísalo en Sofía.",
        );
      },
    });
  // Si se configura ALEXA_SKILL_ID, solo se aceptan requests de ESA skill.
  if (process.env.ALEXA_SKILL_ID)
    builder.withSkillId(process.env.ALEXA_SKILL_ID);
  return builder.create();
}

export function escapeSsml(s: string) {
  return s.replace(/&/g, "y").replace(/</g, "").replace(/>/g, "");
}

export async function invokeSkill(
  app: AppContext,
  envelope: RequestEnvelope,
): Promise<ResponseEnvelope> {
  return buildSkill(app).invoke(envelope);
}
