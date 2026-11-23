/**
 * Enganche bajo para un modelo alto (determinista, sin IA).
 *
 * Si el enganche del cliente queda por debajo del mínimo de la financiera, o por debajo del
 * enganche "sano" que Mario definió en su estilo, Sofía lo detecta y busca modelos/versiones
 * donde ese mismo enganche sí rinde (y, si el cliente dijo cuánto quiere pagar al mes, que la
 * mensualidad estimada le quede).
 */

export type DownPaymentLevel = "ok" | "low" | "below_min";

export interface DownPaymentAssessment {
  level: DownPaymentLevel;
  /** Enganche / precio. */
  pct: number;
  minPct: number;
  healthyPct: number;
}

export function assessDownPayment(price: number, downPayment: number, minPct: number, healthyPct: number): DownPaymentAssessment {
  const pct = price > 0 ? downPayment / price : 1;
  const healthy = Math.max(healthyPct, minPct);
  const level: DownPaymentLevel = pct + 1e-9 < minPct ? "below_min" : pct + 1e-9 < healthy ? "low" : "ok";
  return { level, pct, minPct, healthyPct: healthy };
}

export interface PricedOption {
  vehicleId: string;
  model: string;
  versionId: string;
  version: string;
  price: number;
}

/**
 * Opciones donde el enganche rinde: alcanza el enganche sano, más baratas que lo que pidió,
 * ordenadas de la más parecida (más cara que sí le alcanza) a la más económica.
 * Se prefiere una versión por modelo y primero otras versiones del mismo modelo.
 */
export function affordableAlternatives(
  options: PricedOption[],
  args: { downPayment: number; currentPrice: number; currentVersionId: string | null; currentVehicleId: string | null; healthyPct: number; minPct: number; limit?: number },
): PricedOption[] {
  const need = Math.max(args.healthyPct, args.minPct);
  const fits = options
    .filter((o) => o.versionId !== args.currentVersionId && o.price < args.currentPrice && args.downPayment >= o.price * need - 1)
    .sort((a, b) => b.price - a.price);
  const out: PricedOption[] = [];
  const sameModel = fits.find((o) => o.vehicleId === args.currentVehicleId);
  if (sameModel) out.push(sameModel);
  for (const o of fits) {
    if (out.length >= (args.limit ?? 2)) break;
    if (out.some((x) => x.vehicleId === o.vehicleId)) continue;
    out.push(o);
  }
  return out;
}

/** ¿La mensualidad estimada rebasa lo que el cliente dijo que puede pagar? (10 % de tolerancia) */
export function exceedsMonthlyTarget(monthly: number | null, target: number | null | undefined): boolean {
  return monthly !== null && typeof target === "number" && target > 0 && monthly > target * 1.1;
}
