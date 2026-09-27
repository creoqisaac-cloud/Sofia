/**
 * El esquema de salida del agente debe ser compatible con structured outputs de Claude:
 * todos los objetos con additionalProperties:false, todos los campos requeridos y sin
 * restricciones numéricas/de longitud no soportadas.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { AgentOutputSchema } from "@/server/agent/output-schema";
import { READ_TOOLS } from "@/server/agent/prompt/tools";

function problems(node: unknown, path = "#", out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  const n = node as Record<string, unknown>;
  if (n.type === "object") {
    if (n.additionalProperties !== false) out.push(`${path}: additionalProperties != false`);
    const required = (n.required as string[] | undefined) ?? [];
    for (const p of Object.keys((n.properties as object | undefined) ?? {})) if (!required.includes(p)) out.push(`${path}.${p}: no requerido`);
  }
  for (const k of ["minimum", "maximum", "minLength", "maxLength", "multipleOf"]) if (k in n) out.push(`${path}: usa ${k}`);
  for (const [k, v] of Object.entries(n)) problems(v, `${path}/${k}`, out);
  return out;
}

describe("contrato de salida", () => {
  it("AgentOutput es compatible con structured outputs", () => {
    const schema = zodOutputFormat(AgentOutputSchema).schema;
    expect(problems(schema)).toEqual([]);
    expect(Object.keys((schema as { properties: object }).properties)).toEqual(
      expect.arrayContaining(["customer_reply", "observed_facts", "tags_proposed", "stage_proposal", "temperature_proposal", "next_action", "requires_mario", "escalation_reason", "requires_approval", "requested_tools", "knowledge_used"]),
    );
  });

  it("las herramientas de lectura son estrictas", () => {
    for (const tool of READ_TOOLS) {
      expect(tool.strict).toBe(true);
      expect(problems(tool.input_schema)).toEqual([]);
    }
  });
});
