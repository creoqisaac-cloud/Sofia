/**
 * Catálogo cerrado de etiquetas. El LLM solo puede proponer etiquetas de aquí.
 */
export const TAG_CATALOG = {
  uso_familiar: "Uso familiar",
  uso_trabajo: "Uso de trabajo",
  plataforma_digital: "Maneja en plataforma (Uber/DiDi)",
  interes_hibrido: "Interés en híbrido",
  prioriza_rendimiento: "Prioriza rendimiento",
  pago_contado: "Pago de contado",
  pago_financiado: "Pago con financiamiento",
  sensible_precio: "Sensible al precio",
  sensible_mensualidad: "Sensible a la mensualidad",
  compara_competencia: "Compara con competencia",
  compra_inmediata: "Compra inmediata",
  compra_este_mes: "Compra este mes",
  explorando: "Solo explorando",
  pidio_mario: "Pidió hablar con Mario",
  pidio_descuento: "Pidió descuento",
  pidio_condicion_especial: "Pidió condición especial",
  pidio_prueba_manejo: "Pidió prueba de manejo",
  credito_en_proceso: "Crédito en proceso",
  credito_aprobado: "Crédito aprobado",
  listo_para_cerrar: "Listo para cerrar",
  auto_a_cuenta: "Quiere dejar su auto a cuenta",
  reactivado: "Prospecto reactivado",
} as const;

export type Tag = keyof typeof TAG_CATALOG;

export function isKnownTag(tag: string): tag is Tag {
  return Object.prototype.hasOwnProperty.call(TAG_CATALOG, tag);
}
