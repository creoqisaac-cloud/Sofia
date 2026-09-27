/**
 * Instantánea del catálogo comercial de un workspace.
 * El catálogo es pequeño (un asesor), así que se carga completo por turno.
 * TODO(siguiente sprint): consultas dirigidas + caché si crece.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import type { CatalogVehicle } from "@/domain/intents";

export type VehicleRow = typeof s.vehicles.$inferSelect;
export type VersionRow = typeof s.vehicleVersions.$inferSelect;
export type OfferRow = typeof s.commercialOffers.$inferSelect;
export type RuleRow = typeof s.promotionRules.$inferSelect;
export type FinancingRow = typeof s.financingRules.$inferSelect;
export type InsuranceRow = typeof s.insuranceRules.$inferSelect;
export type TemplateRow = typeof s.quoteTemplates.$inferSelect;
export type KnowledgeRow = typeof s.knowledgeItems.$inferSelect;
export type SourceRow = typeof s.knowledgeSources.$inferSelect;

export interface CatalogSnapshot {
  vehicles: VehicleRow[];
  versions: VersionRow[];
  offers: OfferRow[];
  rules: RuleRow[];
  financing: FinancingRow[];
  insurance: InsuranceRow[];
  templates: TemplateRow[];
  knowledge: KnowledgeRow[];
  sources: Map<string, SourceRow>;
}

export async function loadCatalog(db: Db, workspaceId: string): Promise<CatalogSnapshot> {
  const [vehicles, versions, offers, rules, financing, insurance, templates, knowledge, sources] = await Promise.all([
    db.select().from(s.vehicles).where(eq(s.vehicles.workspaceId, workspaceId)),
    db.select().from(s.vehicleVersions).where(eq(s.vehicleVersions.workspaceId, workspaceId)),
    db.select().from(s.commercialOffers).where(eq(s.commercialOffers.workspaceId, workspaceId)),
    db.select().from(s.promotionRules).where(eq(s.promotionRules.workspaceId, workspaceId)),
    db.select().from(s.financingRules).where(eq(s.financingRules.workspaceId, workspaceId)),
    db.select().from(s.insuranceRules).where(eq(s.insuranceRules.workspaceId, workspaceId)),
    db.select().from(s.quoteTemplates).where(eq(s.quoteTemplates.workspaceId, workspaceId)),
    db.select().from(s.knowledgeItems).where(eq(s.knowledgeItems.workspaceId, workspaceId)),
    db.select().from(s.knowledgeSources).where(eq(s.knowledgeSources.workspaceId, workspaceId)),
  ]);
  return {
    vehicles: vehicles.filter((v) => v.active),
    versions: versions.filter((v) => v.active),
    offers,
    rules,
    financing,
    insurance,
    templates,
    knowledge,
    sources: new Map(sources.map((src) => [src.id, src])),
  };
}

export function toCatalogVehicles(cat: CatalogSnapshot): CatalogVehicle[] {
  return cat.vehicles.map((v) => {
    const versions = cat.versions.filter((x) => x.vehicleId === v.id);
    return {
      model: v.model,
      aliases: v.aliases ?? [],
      versions: versions.map((x) => x.name),
      hasHybrid: versions.some((x) => x.powertrain === "hybrid"),
    };
  });
}

export function findVehicle(cat: CatalogSnapshot, model: string | null | undefined): VehicleRow | null {
  if (!model) return null;
  const m = model.toLowerCase().replace(/[\s-]/g, "");
  return (
    cat.vehicles.find(
      (v) => v.model.toLowerCase().replace(/[\s-]/g, "") === m || (v.aliases ?? []).some((a) => a.toLowerCase().replace(/[\s-]/g, "") === m),
    ) ?? null
  );
}

export function findVersion(cat: CatalogSnapshot, vehicleId: string, name: string | null | undefined): VersionRow | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return cat.versions.find((x) => x.vehicleId === vehicleId && x.name.toLowerCase() === n) ?? null;
}
