/**
 * Recuperación de información comercial específica para la consulta.
 *
 * Solo se envía al modelo lo relevante para el turno (modelos en alcance e
 * intención detectada), cada dato con su estado efectivo, fuente y vigencia.
 * También se construye el contexto de los guardrails (montos permitidos).
 */
import type { InfoStatus } from "@/domain/enums";
import type { Intent } from "@/domain/intents";
import { effectiveStatus, matchesScope } from "@/domain/knowledge";
import { formatMXN, formatPercent, roundMoney } from "@/domain/money";
import { pickFinancingRule } from "@/domain/quote-engine";
import { normalize } from "@/domain/text";
import type { KnowledgeRefType } from "../agent/output-schema";
import { findVehicle, type CatalogSnapshot } from "./catalog";
import { pickListPrice, resolveBonusFor, toFinancingLike, type QuoteComputation } from "./quoting";

export interface RetrievedItem {
  refType: KnowledgeRefType;
  refId: string;
  category: string;
  title: string;
  line: string;
  status: InfoStatus;
  storedStatus: InfoStatus;
  expired: boolean;
  validTo: Date | null;
  sourceName: string | null;
  isDemo: boolean;
  amounts: number[];
  percents: number[];
}

export interface CommercialContext {
  modelsInScope: string[];
  items: RetrievedItem[];
  unknownTopics: string[];
  catalogOverview: string[];
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "sin fecha";
}

function validity(from: Date | null, to: Date | null): string {
  if (!from && !to) return "sin vigencia definida";
  return `vigencia ${fmtDate(from)} → ${fmtDate(to)}`;
}

export function retrieveCommercialContext(
  cat: CatalogSnapshot,
  args: { models: string[]; versionByModel: Record<string, string | undefined>; intents: Set<Intent>; paymentMethod: string | undefined; query: string; now: Date },
): CommercialContext {
  const { now, intents } = args;
  const items: RetrievedItem[] = [];
  const unknownTopics: string[] = [];
  const srcName = (id: string | null) => (id ? (cat.sources.get(id)?.name ?? null) : null);
  const push = (item: Omit<RetrievedItem, "line"> & { body: string }) => {
    const demo = item.isDemo ? " [DEMO]" : "";
    const expiredNote = item.expired ? " — VENCIDO, NO presentar como vigente" : "";
    items.push({
      ...item,
      line: `[${item.refType}:${item.refId}] (${item.status}${expiredNote})${demo} ${item.title}: ${item.body} · fuente: ${item.sourceName ?? "sin fuente"}`,
    });
  };

  const wantsFinancing =
    intents.has("ask_financing") || intents.has("ask_quote") || args.paymentMethod === "financing" || intents.has("ask_documents");

  const vehicles = args.models.map((m) => findVehicle(cat, m)).filter((v): v is NonNullable<typeof v> => v !== null);

  for (const vehicle of vehicles) {
    const versions = cat.versions.filter((v) => v.vehicleId === vehicle.id);
    const chosenVersion = args.versionByModel[vehicle.model];
    for (const version of versions) {
      if (chosenVersion && normalize(chosenVersion) !== normalize(version.name) && versions.length > 1 && !intents.has("ask_price")) continue;
      const vEff = effectiveStatus(version, now);
      push({
        refType: "vehicle_version",
        refId: version.id,
        category: "feature",
        title: `${vehicle.model} ${version.name} ${vehicle.modelYear}`,
        body: `${version.powertrain === "hybrid" ? "híbrido" : "gasolina"}, ${version.transmission ?? "transmisión s/d"}, ${version.seats ?? "?"} plazas. Equipamiento confirmado: ${version.features.join("; ") || "sin datos"}`,
        status: vEff.status,
        storedStatus: version.status,
        expired: vEff.expired,
        validTo: version.validTo,
        sourceName: srcName(version.sourceId),
        isDemo: version.isDemo,
        amounts: [],
        percents: [],
      });
      const price = pickListPrice(cat, version.id, now);
      if (price) {
        const eff = effectiveStatus(price, now);
        const bonus = resolveBonusFor(cat, {
          vehicleId: vehicle.id,
          versionId: version.id,
          paymentMethod: args.paymentMethod === "cash" ? "cash" : args.paymentMethod === "financing" ? "financing" : null,
          downPayment: null,
          termMonths: null,
          vehiclePrice: price.amount,
          now,
        });
        const net = bonus.amount > 0 && eff.presentableAsCurrent ? roundMoney(price.amount! - bonus.amount) : null;
        const minDownRule = pickFinancingRule(cat.financing.map(toFinancingLike), now);
        const minDown = net !== null && minDownRule ? roundMoney(net * minDownRule.minDownPaymentPct) : null;
        push({
          refType: "commercial_offer",
          refId: price.id,
          category: "price",
          title: price.title,
          body: `${formatMXN(price.amount!)} (${validity(price.validFrom, price.validTo)})${net !== null ? `; con bono queda en ${formatMXN(net)}` : ""}${minDown !== null ? `; enganche mínimo ${formatMXN(minDown)}` : ""}`,
          status: eff.status,
          storedStatus: price.status,
          expired: eff.expired,
          validTo: price.validTo,
          sourceName: srcName(price.sourceId),
          isDemo: price.isDemo,
          amounts: [price.amount!, ...(net !== null ? [net] : []), ...(minDown !== null ? [minDown] : [])],
          percents: [],
        });
        if (!eff.presentableAsCurrent && (intents.has("ask_price") || intents.has("ask_quote"))) {
          unknownTopics.push(`precio vigente de ${vehicle.model} ${version.name}`);
        }
      } else if (intents.has("ask_price")) {
        unknownTopics.push(`precio de ${vehicle.model} ${version.name}`);
      }
    }

    // Bonos y promociones del modelo (vigentes e históricos, etiquetados).
    for (const offer of cat.offers.filter((o) => o.vehicleId === vehicle.id && (o.offerType === "bonus" || o.offerType === "promotion" || o.offerType === "gift"))) {
      const eff = effectiveStatus(offer, now);
      push({
        refType: "commercial_offer",
        refId: offer.id,
        category: offer.offerType === "bonus" ? "bonus" : "promotion",
        title: offer.title,
        body: `${offer.amount !== null ? formatMXN(offer.amount) : "beneficio no monetario"}. ${offer.conditions ?? ""} (${validity(offer.validFrom, offer.validTo)})`,
        status: eff.status,
        storedStatus: offer.status,
        expired: eff.expired,
        validTo: offer.validTo,
        sourceName: srcName(offer.sourceId),
        isDemo: offer.isDemo,
        amounts: offer.amount !== null ? [offer.amount] : [],
        percents: [],
      });
      for (const rule of cat.rules.filter((r) => r.offerId === offer.id)) {
        const rEff = effectiveStatus(rule, now);
        push({
          refType: "promotion_rule",
          refId: rule.id,
          category: "promotion",
          title: rule.name,
          body: `condición ${JSON.stringify(rule.condition)} → efecto ${JSON.stringify(rule.effect)} (${validity(rule.validFrom, rule.validTo)}). Solo aplica si es vigente y confirmada; el motor de cotización lo resuelve.`,
          status: rEff.status,
          storedStatus: rule.status,
          expired: rEff.expired,
          validTo: rule.validTo,
          sourceName: srcName(rule.sourceId),
          isDemo: rule.isDemo,
          // Montos de reglas: solo un ajuste vinculante y vigente es mencionable; los de reglas vencidas
          // quedan como históricos. Los de reglas no confirmadas (rumores/estimaciones) no son mencionables.
          amounts:
            rEff.presentableAsCurrent && rule.status === "confirmed"
              ? [rule.effect.add_bonus_amount].filter((x): x is number => typeof x === "number")
              : rEff.expired
                ? [rule.effect.set_bonus_amount, rule.effect.add_bonus_amount].filter((x): x is number => typeof x === "number")
                : [],
          percents: [],
        });
      }
    }

    // Plantillas validadas del modelo
    for (const t of cat.templates.filter((t) => t.vehicleId === vehicle.id)) {
      const eff = effectiveStatus(t, now);
      push({
        refType: "quote_template",
        refId: t.id,
        category: "financing",
        title: t.name,
        body: `precio ${formatMXN(t.vehiclePrice)}, bono ${formatMXN(t.bonus)}, enganche ${formatMXN(t.downPayment)}, ${t.termMonths} meses → mensualidad ${formatMXN(t.monthlyPayment)}. ${t.conditions ?? ""} (${validity(t.validFrom, t.validTo)})`,
        status: eff.status,
        storedStatus: t.status,
        expired: eff.expired,
        validTo: t.validTo,
        sourceName: srcName(t.sourceId),
        isDemo: t.isDemo,
        amounts: [t.vehiclePrice, t.bonus, t.downPayment, t.monthlyPayment, ...(t.openingCommission ? [t.openingCommission] : []), ...(t.insurance ? [t.insurance] : [])],
        percents: t.annualRate ? [roundMoney(t.annualRate * 100)] : [],
      });
    }
  }

  if (wantsFinancing) {
    for (const r of cat.financing) {
      const eff = effectiveStatus(r, now);
      push({
        refType: "financing_rule",
        refId: r.id,
        category: "financing",
        title: `${r.lender} — ${r.productName}`,
        body: `tasa anual ${formatPercent(r.annualRate)}, plazos ${r.allowedTerms.join("/")} meses, enganche mínimo ${formatPercent(r.minDownPaymentPct)}, comisión por apertura ${formatPercent(r.openingCommissionPct)} (${validity(r.validFrom, r.validTo)})`,
        status: eff.status,
        storedStatus: r.status,
        expired: eff.expired,
        validTo: r.validTo,
        sourceName: srcName(r.sourceId),
        isDemo: r.isDemo,
        amounts: [],
        percents: [r.annualRate, r.minDownPaymentPct, r.openingCommissionPct].map((x) => roundMoney(x * 100)),
      });
    }
  }

  if (intents.has("ask_insurance") || intents.has("ask_quote")) {
    const relevant = cat.insurance.filter((i) => vehicles.length === 0 || vehicles.some((v) => matchesScope(i, v.model, null)));
    for (const i of relevant) {
      const eff = effectiveStatus(i, now);
      push({
        refType: "insurance_rule",
        refId: i.id,
        category: "insurance",
        title: `${i.insurer} — ${i.coverage}`,
        body: `${i.annualPremium ? `prima anual ${formatMXN(i.annualPremium)}` : ""}${i.pctOfVehiclePrice ? `prima aprox. ${formatPercent(i.pctOfVehiclePrice)} del valor del auto` : ""} (${validity(i.validFrom, i.validTo)})`,
        status: eff.status,
        storedStatus: i.status,
        expired: eff.expired,
        validTo: i.validTo,
        sourceName: srcName(i.sourceId),
        isDemo: i.isDemo,
        amounts: i.annualPremium ? [i.annualPremium] : [],
        percents: i.pctOfVehiclePrice ? [roundMoney(i.pctOfVehiclePrice * 100)] : [],
      });
    }
    if (!relevant.some((i) => effectiveStatus(i, now).presentableAsCurrent) && intents.has("ask_insurance")) unknownTopics.push("costo del seguro");
  }

  // Conocimiento general por categoría/intención y alcance.
  const categoryWanted = new Set<string>();
  if (intents.has("ask_documents") || wantsFinancing) categoryWanted.add("policy");
  if (intents.has("ask_availability")) categoryWanted.add("availability");
  if (intents.has("ask_features")) categoryWanted.add("feature");
  if (intents.has("ask_warranty")) categoryWanted.add("warranty");
  if (intents.has("appointment") || intents.has("test_drive")) categoryWanted.add("faq");
  const q = normalize(args.query);
  for (const k of cat.knowledge) {
    const keywordHit = (k.keywords ?? []).some((kw) => q.includes(normalize(kw)));
    if (!categoryWanted.has(k.category) && !keywordHit) continue;
    const inScope = vehicles.length === 0 ? (k.modelScope ?? []).length === 0 || keywordHit : vehicles.some((v) => matchesScope(k, v.model, null));
    if (!inScope) continue;
    const eff = effectiveStatus(k, now);
    push({
      refType: "knowledge_item",
      refId: k.id,
      category: k.category,
      title: k.title,
      body: `${k.content} (${validity(k.validFrom, k.validTo)})`,
      status: eff.status,
      storedStatus: k.status,
      expired: eff.expired,
      validTo: k.validTo,
      sourceName: srcName(k.sourceId),
      isDemo: k.isDemo,
      amounts: [],
      percents: [],
    });
  }

  const PRESENTABLE: InfoStatus[] = ["confirmed", "official_quote", "validated_quote", "estimate"];
  const hasCurrent = (category: string) => items.some((i) => i.category === category && PRESENTABLE.includes(i.status));
  if (intents.has("ask_warranty") && !hasCurrent("warranty")) unknownTopics.push("garantía");
  if (intents.has("ask_availability") && !hasCurrent("availability")) unknownTopics.push("disponibilidad / inventario / colores");
  if (intents.has("ask_bonus") && vehicles.length > 0) {
    for (const v of vehicles) {
      const anyCurrent = items.some((i) => i.category === "bonus" && i.title.includes(v.model) && i.status !== "historical" && i.status !== "unknown");
      if (!anyCurrent) unknownTopics.push(`bono vigente de ${v.model}`);
    }
  }

  const catalogOverview = cat.vehicles.map((v) => {
    const versions = cat.versions.filter((x) => x.vehicleId === v.id).map((x) => x.name);
    return `${v.model} ${v.modelYear}${v.isDemo ? " [DEMO]" : ""}: ${versions.join(", ")}`;
  });

  return { modelsInScope: vehicles.map((v) => v.model), items, unknownTopics, catalogOverview };
}

/** Línea de prompt para una cotización calculada por el sistema. */
export function describeQuote(q: QuoteComputation & { ok: true }, quoteRefId: string): string {
  const x = q.quote;
  const label = x.calculationType === "validated_template" ? "COTIZACIÓN PREVIAMENTE VALIDADA" : "ESTIMACIÓN (no es cotización oficial)";
  const parts = [
    `[quote:${quoteRefId}] ${label}${q.isDemo ? " [DEMO]" : ""} — ${q.model} ${q.version}`,
    `precio ${formatMXN(x.vehiclePrice)}`,
    `bono ${formatMXN(x.bonus)}`,
    `enganche ${formatMXN(x.downPayment)}`,
  ];
  if (x.termMonths) parts.push(`plazo ${x.termMonths} meses`);
  if (x.monthlyPayment !== null) parts.push(`mensualidad ${formatMXN(x.monthlyPayment)}`);
  if (x.annualRate !== null) parts.push(`tasa anual ${formatPercent(x.annualRate)}`);
  if (x.amountFinanced !== null) parts.push(`monto a financiar ${formatMXN(x.amountFinanced)}`);
  if (x.openingCommission !== null) parts.push(`comisión apertura ${formatMXN(x.openingCommission)}`);
  parts.push(x.insurance !== null ? `seguro anual aprox. ${formatMXN(x.insurance)}` : "seguro por confirmar");
  parts.push(x.plates !== null ? `placas ${formatMXN(x.plates)}` : "placas/tenencia no incluidas");
  parts.push(`condiciones: ${x.conditions}`);
  if (x.validUntil) parts.push(`válida hasta ${x.validUntil.toISOString().slice(0, 10)}`);
  return parts.join(" · ");
}

export function quoteAmounts(q: QuoteComputation & { ok: true }): { all: number[]; estimateOnly: number[]; percents: number[] } {
  const x = q.quote;
  const all = [x.vehiclePrice, x.bonus, x.downPayment, x.vehiclePrice - x.bonus, x.monthlyPayment, x.amountFinanced, x.openingCommission, x.insurance, x.plates]
    .filter((n): n is number => typeof n === "number" && n > 0)
    .map(roundMoney);
  const estimateOnly =
    x.calculationType === "estimate"
      ? [x.monthlyPayment, x.amountFinanced, x.openingCommission, x.insurance].filter((n): n is number => typeof n === "number" && n > 0)
      : [];
  const percents = x.annualRate !== null ? [roundMoney(x.annualRate * 100)] : [];
  return { all, estimateOnly, percents };
}
