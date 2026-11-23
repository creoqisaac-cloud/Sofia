/**
 * Sofía Ventas dentro del turno de conversación (todo determinista):
 *  - estilo de Mario + jugada del día,
 *  - novedades registradas por modelo,
 *  - enganche bajo → alternativas que sí rinden (cotizadas por el motor, con respaldo),
 *  - qué fotos/videos/flyers adjuntar a la respuesta.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { affordableAlternatives, assessDownPayment, exceedsMonthlyTarget, type DownPaymentLevel, type PricedOption } from "@/domain/affordability";
import { mentionedModels } from "@/domain/intents";
import { effectiveStatus } from "@/domain/knowledge";
import { pickFinancingRule } from "@/domain/quote-engine";
import { dayPlaybook, type DayPlay, type SalesStyle } from "@/domain/sales-style";
import type { SpellingFix } from "@/domain/spelling";
import { normalize } from "@/domain/text";
import { findVehicle, findVersion, type CatalogSnapshot } from "../commercial/catalog";
import { pickListPrice, toFinancingLike } from "../commercial/quoting";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import type { ReadToolExecutor } from "../agent/read-tools";
import type { TurnContext } from "../agent/turn-context";
import { pickMedia, toLite, type MediaKindValue, type MediaLite } from "./media";
import { loadStyle } from "./style";

export interface AffordabilityOption {
  model: string;
  version: string;
  vehicleId: string;
  monthly: number | null;
  termMonths: number;
  refId: string;
  isDemo: boolean;
  validated: boolean;
}

export interface AffordabilityAdvice {
  level: DownPaymentLevel;
  monthlyTooHigh: boolean;
  downPayment: number;
  current: { model: string; version: string; vehicleId: string };
  options: AffordabilityOption[];
}

export interface DeskTurnContext {
  style: SalesStyle;
  day: DayPlay;
  /** Mensajes seguidos del cliente que se entendieron juntos. */
  burstCount: number;
  fixes: SpellingFix[];
  updates: Array<{ id: string; vehicleId: string | null; model: string | null; kind: string; text: string }>;
  library: MediaLite[];
  sentMediaIds: string[];
  affordability: AffordabilityAdvice | null;
  mediaPlan: { ids: string[]; models: string[]; asked: boolean; missingFor: string[] };
}

export async function loadDeskTurnData(
  db: Db,
  args: { workspaceId: string; conversationId: string; now: Date; catalog: CatalogSnapshot; burstCount: number; fixes: SpellingFix[] },
): Promise<DeskTurnContext> {
  const [style, updates, media, recentSofia] = await Promise.all([
    loadStyle(db, args.workspaceId),
    db.select().from(s.vehicleUpdates).where(and(eq(s.vehicleUpdates.workspaceId, args.workspaceId), eq(s.vehicleUpdates.active, true))).orderBy(desc(s.vehicleUpdates.createdAt)).limit(60),
    db.select().from(s.vehicleMedia).where(and(eq(s.vehicleMedia.workspaceId, args.workspaceId), eq(s.vehicleMedia.active, true))).limit(400),
    db
      .select({ metadata: s.messages.metadata })
      .from(s.messages)
      .where(and(eq(s.messages.conversationId, args.conversationId), inArray(s.messages.sender, ["sofia", "mario"])))
      .orderBy(desc(s.messages.seq))
      .limit(40),
  ]);
  const modelOf = (vehicleId: string | null) => (vehicleId ? (args.catalog.vehicles.find((v) => v.id === vehicleId)?.model ?? null) : null);
  const sent = new Set<string>();
  for (const r of recentSofia) {
    const ids = (r.metadata as { media?: unknown }).media;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") sent.add(id);
  }
  return {
    style,
    day: dayPlaybook(args.now, style),
    burstCount: args.burstCount,
    fixes: args.fixes,
    updates: updates
      .filter((u) => !u.validTo || u.validTo.getTime() >= args.now.getTime())
      .map((u) => ({ id: u.id, vehicleId: u.vehicleId, model: modelOf(u.vehicleId), kind: u.kind, text: u.text })),
    library: media.map((m) => toLite(m, modelOf(m.vehicleId))),
    sentMediaIds: [...sent],
    affordability: null,
    mediaPlan: { ids: [], models: [], asked: false, missingFor: [] },
  };
}

function pricedOptions(ctx: TurnContext): PricedOption[] {
  const out: PricedOption[] = [];
  for (const v of ctx.catalog.versions) {
    const vehicle = ctx.catalog.vehicles.find((x) => x.id === v.vehicleId);
    const price = pickListPrice(ctx.catalog, v.id, ctx.now);
    if (!vehicle || !price?.amount || !effectiveStatus(price, ctx.now).presentableAsCurrent) continue;
    out.push({ vehicleId: vehicle.id, model: vehicle.model, versionId: v.id, version: v.name, price: price.amount });
  }
  return out;
}

/**
 * Enganche bajo para el modelo que pide (o mensualidad por arriba de lo que quiere pagar):
 * busca versiones/modelos donde su mismo enganche sí rinde y las cotiza con el motor
 * (las cifras quedan respaldadas para los guardrails).
 */
export async function adviseAffordability(ctx: TurnContext, tools: ReadToolExecutor): Promise<AffordabilityAdvice | null> {
  const desk = ctx.desk;
  if (!desk) return null;
  const P = ctx.provisionalProfile;
  const down = typeof P.down_payment === "number" ? P.down_payment : null;
  if (down === null || down <= 0 || P.payment_method === "cash") return null;
  const vehicle = findVehicle(ctx.catalog, typeof P.vehicle_interest === "string" ? P.vehicle_interest : null);
  if (!vehicle) return null;
  const rule = pickFinancingRule(ctx.catalog.financing.map(toFinancingLike), ctx.now);
  if (!rule) return null;

  const priced = pricedOptions(ctx);
  const chosenVersion = typeof P.version === "string" ? findVersion(ctx.catalog, vehicle.id, P.version) : null;
  const current = chosenVersion
    ? priced.find((o) => o.versionId === chosenVersion.id)
    : priced.filter((o) => o.vehicleId === vehicle.id).sort((a, b) => a.price - b.price)[0];
  if (!current) return null;

  const assessment = assessDownPayment(current.price, down, rule.minDownPaymentPct, desk.style.healthyDownPct);
  const sysMonthly = ctx.systemQuote?.computation.ok ? ctx.systemQuote.computation.quote.monthlyPayment : null;
  const target = typeof P.target_monthly_payment === "number" ? P.target_monthly_payment : null;
  const monthlyTooHigh = exceedsMonthlyTarget(sysMonthly, target);
  if (assessment.level === "ok" && !monthlyTooHigh) return null;

  const term = typeof P.term_months === "number" && rule.allowedTerms.includes(P.term_months) ? P.term_months : rule.allowedTerms.includes(48) ? 48 : Math.max(...rule.allowedTerms);
  const alternatives = affordableAlternatives(priced, {
    downPayment: down,
    currentPrice: current.price,
    currentVersionId: current.versionId,
    currentVehicleId: current.vehicleId,
    healthyPct: desk.style.healthyDownPct,
    minPct: rule.minDownPaymentPct,
    limit: 2,
  });

  const options: AffordabilityOption[] = [];
  for (const alt of alternatives) {
    const before = tools.scratch.quotes.length;
    await tools.execute("calculate_quote", { model: alt.model, version: alt.version, down_payment: down, term_months: term, payment_method: "financing" });
    const q = tools.scratch.quotes[before];
    if (!q) continue;
    const monthly = q.computation.quote.monthlyPayment;
    if (target && monthly !== null && monthly > target * 1.25) continue;
    options.push({
      model: alt.model,
      version: alt.version,
      vehicleId: alt.vehicleId,
      monthly,
      termMonths: term,
      refId: q.refId,
      isDemo: q.computation.isDemo,
      validated: q.computation.quote.calculationType === "validated_template",
    });
  }
  return { level: assessment.level, monthlyTooHigh, downPayment: down, current: { model: current.model, version: current.version, vehicleId: current.vehicleId }, options };
}

const WANTS_MEDIA = /\b(fotos?|fotitos?|imagen(es)?|videos?|como (es|se ve|luce|esta)|ver(lo|la|los)|ensename(lo|la)?|muestrame(lo|la)?|ficha|folleto|flyer|catalogo|colores|por dentro|por fuera|interior|exterior)\b/;

/** Qué material adjuntar a la respuesta de Sofía (máx. 5 archivos). */
export function planMedia(ctx: TurnContext): DeskTurnContext["mediaPlan"] {
  const desk = ctx.desk;
  if (!desk) return { ids: [], models: [], asked: false, missingFor: [] };
  const n = normalize(ctx.newMessage.body);
  const asked = WANTS_MEDIA.test(n);
  const sent = new Set(desk.sentMediaIds);
  const picked: MediaLite[] = [];
  const models: string[] = [];
  const missingFor: string[] = [];
  const add = (items: MediaLite[]) => {
    for (const m of items) if (picked.length < 5 && !picked.some((x) => x.id === m.id)) picked.push(m);
  };

  const mentioned = mentionedModels(ctx.newMessage.body, ctx.catalogVehicles);
  const interest = typeof ctx.provisionalProfile.vehicle_interest === "string" ? [ctx.provisionalProfile.vehicle_interest] : [];
  const targetModels = Array.from(new Set([...mentioned, ...interest])).slice(0, 2);

  if (asked) {
    const kinds: MediaKindValue[] = ["photo", "video"];
    if (/\b(flyer|folleto|promo|promocion)\b/.test(n)) kinds.push("flyer");
    if (/\b(ficha|especificaciones|catalogo)\b/.test(n)) kinds.push("sheet");
    for (const model of targetModels) {
      const v = findVehicle(ctx.catalog, model);
      if (!v) continue;
      const fresh = pickMedia(desk.library, { vehicleId: v.id, kinds, now: ctx.now, exclude: sent });
      const items = fresh.length ? fresh : pickMedia(desk.library, { vehicleId: v.id, kinds, now: ctx.now });
      if (items.length) {
        add(items);
        models.push(v.model);
      } else missingFor.push(v.model);
    }
  } else {
    // Primera vez que pregunta por un modelo: un par de fotos para enamorar.
    for (const model of mentioned.slice(0, 1)) {
      const v = findVehicle(ctx.catalog, model);
      if (!v) continue;
      const items = pickMedia(desk.library, { vehicleId: v.id, kinds: ["photo"], now: ctx.now, onlyOnAsk: true, exclude: sent, perKind: { photo: 2 } });
      const alreadySentThisModel = desk.library.some((m) => m.vehicleId === v.id && sent.has(m.id));
      if (items.length && !alreadySentThisModel) {
        add(items);
        models.push(v.model);
      }
    }
  }

  // Alternativas por enganche bajo: una foto de cada una.
  for (const opt of desk.affordability?.options ?? []) {
    const items = pickMedia(desk.library, { vehicleId: opt.vehicleId, kinds: ["photo"], now: ctx.now, onlyOnAsk: true, exclude: sent, perKind: { photo: 1 } });
    if (items.length) {
      add(items);
      if (!models.includes(opt.model)) models.push(opt.model);
    }
  }
  return { ids: picked.map((m) => m.id), models, asked, missingFor };
}

/** Novedad del modelo que todavía no se le dijo a este cliente. */
export function pendingUpdateFor(ctx: TurnContext, model: string | null): { id: string; text: string } | null {
  const desk = ctx.desk;
  if (!desk || !model) return null;
  const v = findVehicle(ctx.catalog, model);
  if (!v) return null;
  const said = ctx.recentMessages.filter((m) => m.sender !== "customer").map((m) => normalize(m.body));
  const u = desk.updates.find((x) => x.vehicleId === v.id && !said.some((b) => b.includes(normalize(x.text).slice(0, 40))));
  return u ? { id: u.id, text: u.text } : null;
}

/** Texto corto que anuncia el material adjunto (si la respuesta no lo menciona ya). */
export function mediaAnnouncement(ctx: TurnContext): string | null {
  const plan = ctx.desk?.mediaPlan;
  if (!plan || !plan.ids.length) return null;
  const items = ctx.desk!.library.filter((m) => plan.ids.includes(m.id));
  const kinds = new Set(items.map((m) => m.kind));
  const parts = [kinds.has("photo") && "fotos", kinds.has("video") && "video", kinds.has("flyer") && "la promoción", kinds.has("sheet") && "la ficha técnica"].filter(Boolean) as string[];
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0]!;
  return `Te comparto ${what}${plan.models.length ? ` del ${plan.models.join(" y del ")}` : ""} 👇`;
}
