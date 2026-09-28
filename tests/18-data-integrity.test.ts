/**
 * Integridad de datos:
 *  - Valores de hechos que parecen números/booleanos conservan su tipo texto
 *    (regresión: con PGlite, jsonb de primer nivel "5550000001" regresaba como número).
 *  - La migración de Sprint 1 → Sprint 2 conserva los datos existentes.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { getProfileState, recordFacts } from "@/server/services/profile";
import { makeApp, newProspect, type TestApp } from "./helpers";

describe("tipos de valores del perfil", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("teléfonos, números exteriores y CP se conservan como texto", async () => {
    const p = await newProspect(app, "Tipos");
    await recordFacts(app, {
      customerId: p.customer.id,
      entries: [
        { key: "mobile_phone", value: "5550000001" },
        { key: "exterior_number", value: "10" },
        { key: "postal_code", value: "12345" },
        { key: "interior_number", value: "true" },
        { key: "nss", value: "01234567890" },
      ],
      sourceType: "mario_capture",
      sourceLabel: "Captura",
    });
    const rows = await app.db.select().from(s.customerFacts).where(eq(s.customerFacts.customerId, p.customer.id));
    for (const r of rows) expect(typeof r.value, r.factKey).toBe("string");
    const st = await getProfileState(app.db, p.customer.id);
    expect(st.fields.mobile_phone!.state.value).toBe("5550000001");
    expect(st.fields.postal_code!.state.value).toBe("12345");
    const [profile] = await app.db.select().from(s.customerProfiles).where(and(eq(s.customerProfiles.customerId, p.customer.id)));
    expect((profile!.data as Record<string, unknown>).exterior_number).toBe("10");
  });
});

describe("migración Sprint 1 → Sprint 2", () => {
  it("convierte hechos jsonb a texto sin perder valores y renombra estados", async () => {
    const dir = path.resolve("drizzle");
    const statements = (file: string) =>
      fs
        .readFileSync(path.join(dir, file), "utf8")
        .split("--> statement-breakpoint")
        .map((x) => x.trim())
        .filter(Boolean);
    const db = new PGlite();
    for (const sql of statements("0000_init.sql")) await db.exec(sql);
    await db.exec(`
      INSERT INTO workspaces (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'w', 'w');
      INSERT INTO customers (id, workspace_id, display_name) VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'c');
      INSERT INTO customer_facts (workspace_id, customer_id, fact_key, value, value_text, source, status) VALUES
        ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'budget', '350000'::jsonb, '350000', 'customer_message', 'active'),
        ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'name', '"Laura"'::jsonb, 'Laura', 'customer_message', 'active'),
        ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'usage_type', '["family"]'::jsonb, 'family', 'customer_message', 'superseded');
    `);
    const file = fs.readdirSync(dir).find((f) => f.startsWith("0001_"))!;
    for (const sql of statements(file)) await db.exec(sql);
    const res = await db.query<{ fact_key: string; value: string; status: string }>("SELECT fact_key, value, status FROM customer_facts ORDER BY fact_key");
    const parsed = Object.fromEntries(res.rows.map((r) => [r.fact_key, { value: JSON.parse(r.value), status: r.status }]));
    expect(parsed).toEqual({
      budget: { value: 350000, status: "observed" },
      name: { value: "Laura", status: "observed" },
      usage_type: { value: ["family"], status: "superseded" },
    });
    await db.close();
  });
});
