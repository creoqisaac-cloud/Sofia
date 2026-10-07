/** Regreso a la solicitud después de la foto de la INE: solo rutas internas del mismo cliente. */
import { describe, expect, it } from "vitest";
import { safeReturn } from "@/domain/return-to";

const C = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";

describe("safeReturn", () => {
  it("acepta la solicitud del mismo cliente (con paso)", () => {
    expect(safeReturn(C, `/customers/${C}/credit/${A}?step=completar`)).toBe(`/customers/${C}/credit/${A}?step=completar`);
    expect(safeReturn(C, `/customers/${C}/credit/${A}`)).toBe(`/customers/${C}/credit/${A}`);
  });
  it("rechaza otros clientes, sitios externos y basura", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    for (const bad of [`/customers/${other}/credit/${A}`, "https://evil.example/x", "//evil.example", `/customers/${C}/credit/${A}?step=x&y=1`, "", undefined, null]) expect(safeReturn(C, bad)).toBeNull();
    expect(safeReturn(".*", `/customers/${C}/credit/${A}`)).toBeNull();
  });
});
