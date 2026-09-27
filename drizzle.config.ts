import { defineConfig } from "drizzle-kit";

// Las migraciones SQL generadas son PostgreSQL estándar: se aplican igual a
// PGlite (desarrollo local) que a Supabase/PostgreSQL (DATABASE_URL).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
