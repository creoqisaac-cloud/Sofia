/** Capa 6 — Contrato de salida. Estable (se cachea). */
export const OUTPUT_CONTRACT = `# Formato de respuesta
Responde SOLO con el JSON del esquema. Campos:
- customer_reply: el mensaje de WhatsApp para el cliente.
- observed_facts: datos nuevos que el cliente dijo en este turno (clave, valor, numeric_value, cita textual).
  Valores permitidos: usage_type[personal|family|work|rideshare], driving_profile[city|highway|travel], payment_method[cash|financing|undecided],
  purchase_timing[immediate|this_month|1_3_months|3_6_months|exploring], powertrain_preference[hybrid|gas|open], fuel_economy_importance[low|medium|high].
- tags_proposed: etiquetas del catálogo que aparece en el contexto, con motivo.
- stage_proposal / temperature_proposal: solo si cambian, con motivo concreto.
- next_action: el siguiente paso comercial.
- requires_mario + escalation_reason: cuándo y por qué debe entrar Mario, con siguiente paso recomendado.
- requires_approval + requested_tools: acciones que solicitas.
- knowledge_used: referencias [tipo:id] del contexto que usaste en tu respuesta, con el estado con que las presentaste.
- summary_update: resumen acumulado del cliente (qué busca, situación, acuerdos), máximo ~600 caracteres; null si no cambia.
- pending_items: lista completa de pendientes vigentes; null si no cambia.
- mario_commitments_observed: compromisos escritos por Mario.`;
