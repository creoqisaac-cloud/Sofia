/** Estilo de venta guardado en la configuración del workspace (`settings.salesStyle`). */
import { eq } from "drizzle-orm";
import { resolveStyle, type SalesStyle } from "@/domain/sales-style";
import type { AppContext } from "../app";
import type { Db } from "../db/client";
import * as s from "../db/schema";

export async function loadStyle(db: Db, workspaceId: string): Promise<SalesStyle> {
  const [ws] = await db.select({ settings: s.workspaces.settings }).from(s.workspaces).where(eq(s.workspaces.id, workspaceId));
  return resolveStyle((ws?.settings ?? {}).salesStyle);
}

export async function saveStyle(app: AppContext, input: Partial<SalesStyle>): Promise<SalesStyle> {
  const [ws] = await app.db.select({ settings: s.workspaces.settings }).from(s.workspaces).where(eq(s.workspaces.id, app.workspaceId));
  const settings = ws?.settings ?? {};
  const next = resolveStyle({ ...resolveStyle(settings.salesStyle), ...input });
  await app.db.update(s.workspaces).set({ settings: { ...settings, salesStyle: next } }).where(eq(s.workspaces.id, app.workspaceId));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "sales_style_updated", entityType: "workspace", entityId: app.workspaceId, data: {} });
  return next;
}
