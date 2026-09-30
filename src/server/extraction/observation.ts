/**
 * Observación de OCR hecha EN EL DISPOSITIVO (ML Kit Text Recognition v2 en la APK).
 * Se conserva la estructura (páginas → bloques → líneas → elementos, con cajas y confianza)
 * para que los parsers usen geometría, no un string plano.
 *
 * Es un dato de entrada NO confiable (viene del cliente): se valida con límites estrictos.
 * Nunca se registra en logs (contiene PII).
 */
import { z } from "zod";

const Box = z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() });
const Text = z.string().max(400);
const Conf = z.number().min(0).max(1).optional();

const Element = z.object({ text: Text, confidence: Conf, box: Box.optional() });
const Line = z.object({ text: Text, confidence: Conf, box: Box, elements: z.array(Element).max(80).optional() });
const Block = z.object({ text: z.string().max(4000), confidence: Conf, box: Box, lines: z.array(Line).max(80) });
const Page = z.object({ uri: z.string().max(500).optional(), width: z.number().positive(), height: z.number().positive(), blocks: z.array(Block).max(300) });

export const DocumentObservationSchema = z.object({
  engine: z.string().max(60),
  pages: z.array(Page).min(1).max(10),
});

export type ObsBox = z.infer<typeof Box>;
export type ObsLine = z.infer<typeof Line>;
export type ObsPage = z.infer<typeof Page>;
export type DocumentObservation = z.infer<typeof DocumentObservationSchema>;

export function parseObservation(input: unknown): DocumentObservation | null {
  const r = DocumentObservationSchema.safeParse(input);
  return r.success ? r.data : null;
}

/** Líneas de una página con su caja; orden de lectura (arriba→abajo, izquierda→derecha). */
export function pageLines(page: ObsPage): ObsLine[] {
  return page.blocks
    .flatMap((b) => b.lines)
    .filter((l) => l.text.trim())
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
}

export function observationText(obs: DocumentObservation): string {
  return obs.pages.map((p) => pageLines(p).map((l) => l.text).join("\n")).join("\n\n");
}
