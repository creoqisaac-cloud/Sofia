# Sofía — asistente comercial con IA para Mario Abarca (Honda)

Sprint 1: **cerebro, persistencia y simulador**. Todavía no hay WhatsApp, pagos ni automatizaciones externas.

> ⚠️ Todos los precios, bonos, tasas, seguros y corridas incluidos son **DEMO (ficticios)**: están marcados `is_demo = true`, sus fuentes se llaman “DEMO — … (NO REAL)” y Sofía los menciona con “(dato DEMO)”. No representan información comercial real de Honda.

## Inicio rápido

```bash
npm install
npm run dev            # http://localhost:3000 → /simulator
```

No requiere base de datos ni API key: sin `DATABASE_URL` usa **PGlite** (PostgreSQL embebido, persistido en `.data/pglite`) y sin credenciales de Anthropic usa el **motor demo determinista**. La primera vez aplica migraciones y siembra los datos DEMO automáticamente.

Para usar Claude como cerebro:

```bash
cp .env.example .env.local
# ANTHROPIC_API_KEY=...        (o SOFIA_LLM_PROVIDER=anthropic si usas `ant auth login`)
# SOFIA_MODEL=claude-opus-5    SOFIA_EFFORT=medium
```

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest (PGlite en memoria, sin red) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint (config de Next) |
| `npm run check` | typecheck + lint + test |
| `npm run db:generate` | Genera migración SQL desde `src/server/db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones (PGlite o `DATABASE_URL`) |
| `npm run db:seed` | Migra y siembra DEMO si la base está vacía |
| `npm run db:reset` | Borra y re-siembra la base **PGlite local** (detén la app antes) |

## Qué se puede hacer hoy

- **Simulador** (`/simulator`): crear prospecto, escribir como cliente o como Mario, pasar el control a Mario y devolverlo a Sofía. El panel lateral muestra etapa CRM, temperatura, etiquetas, datos conocidos y faltantes, resumen acumulado, compromisos de Mario, pendientes, próximo paso, cotización (tipo + traza), fuentes usadas (con estado y DEMO), guardrails aplicados, si se recomienda a Mario, si se requiere aprobación, e historial de CRM y de hechos. Cada respuesta de Sofía muestra sus fuentes.
- **Bandeja de Mario** (`/mario`): alertas “🔥 MARIO, ENTRA TÚ” y aprobaciones pendientes (aprobar/rechazar con nota).
- **Reglas comerciales** (`/rules`): todo el conocimiento con estado guardado vs. **estado efectivo** (vigencia), fuente y DEMO; probador de bono/cotización con barrido de enganche 80k→200k.
- Cerrar la app y volver a abrirla: el simulador reabre el último prospecto (URL `?c=` + localStorage) y la conversación continúa desde la base de datos.

## Punto de partida y decisión de stack

El repositorio estaba **vacío** (sin commits en local ni en el remoto), así que no había arquitectura que conservar. Se eligió el stack más directo hacia lo que pide el proyecto (Supabase/PostgreSQL):

- **Next.js 16 (App Router) + TypeScript + Tailwind 4** — UI interna y API (route handlers) en un solo proyecto.
- **PostgreSQL vía Drizzle ORM.** Las migraciones SQL (`drizzle/`) son PostgreSQL estándar: se aplican igual a **PGlite** (dev/pruebas, cero infraestructura) que a **Supabase** (`DATABASE_URL`). No hay migración tecnológica pendiente para producción.
- **Zod** para validar todo lo que cruza una frontera (LLM, API, herramientas).
- **@anthropic-ai/sdk** para el cerebro (Claude), detrás de una interfaz de proveedor.
- **Vitest** para pruebas.

## Arquitectura

**Principio:** el LLM conversa y propone; el backend valida; la base de datos recuerda; reglas deterministas controlan todo dato comercial sensible.

```
mensaje del cliente ─► messages (inmutable)
        │
        ▼
buildTurnContext  ── memoria por capas (nunca el historial completo)
  1 perfil estructurado   2 estado CRM   3 resumen acumulado   4 compromisos de Mario
  5 pendientes            6 últimos 12 mensajes                7 conocimiento recuperado
  + intenciones y escalamientos detectados por reglas + cotización calculada por el motor
        │
        ▼
buildPrompt ── system (estable, cacheable): identidad · estilo · reglas · seguridad · herramientas · contrato
               user (dinámico): cliente · memoria · contexto comercial · conversación
        │
        ▼
proveedor (Claude | motor demo) ── herramientas de SOLO LECTURA deterministas
        │                           (get_commercial_info, calculate_quote)
        ▼
AgentOutput (JSON estructurado, validado con zod)
        │
        ├─► anclaje de hechos: solo lo que el cliente escribió (cita textual; números presentes)
        ├─► guardrails de la respuesta (montos/porcentajes sin respaldo, vencidos como vigentes,
        │   "cotización oficial", "Mario aprobó", disponibilidad/garantía sin confirmar,
        │   preguntas repetidas, exceso de documentos, estimaciones sin etiqueta, identidad)
        │     └─ bloqueado → 1 reintento con retroalimentación → si persiste, respuesta segura sin cifras
        ▼
applyTurnEffects (UNA transacción)
   hechos→perfil · etapa/temperatura (reglas de transición, motivo, autor) · etiquetas (catálogo)
   cotizaciones (motor) · acciones (auto vs. aprobación) · alertas · resumen/compromisos · auditoría
```

### Código

```
src/domain/            Reglas puras y deterministas (sin BD ni red)
  enums.ts             Vocabulario cerrado: etapas, temperaturas, estados de información, disparadores…
  bonus.ts             Regla crítica del bono (ver abajo)
  quote-engine.ts      Cotización: estimate | validated_template (nunca official)
  knowledge.ts         Estado efectivo por vigencia (vencido ⇒ histórico)
  guards.ts            Guardrails de la respuesta
  facts.ts             Catálogo de hechos del perfil, fusión y datos faltantes
  crm.ts               Transiciones de etapa/temperatura
  documents.ts         Documentación progresiva (uno a la vez)
  approvals.ts         Política: acciones automáticas vs. con aprobación
  escalation.ts        Disparadores deterministas de “MARIO, ENTRA TÚ”
  intents.ts / money.ts Intenciones, extracción de hechos, montos en español MX
src/server/
  db/                  Esquema Drizzle, conexión (PGlite/Postgres), seed DEMO
  commercial/          Catálogo, recuperación con estado efectivo, adaptador de cotización
  agent/               Contexto del turno, prompt por capas, proveedores, validación, efectos, orquestador
  services/            Casos de uso (prospectos, conversación, bandeja de Mario, reglas)
  storage/documents.ts Almacenamiento privado de documentos (solo referencias en BD)
src/app/               Páginas (simulator, mario, rules) y API
drizzle/               Migraciones SQL (PostgreSQL estándar)
tests/                 Pruebas (dominio + integración con BD real en memoria)
```

### Decisiones importantes

1. **Contrato de salida estructurado.** El modelo devuelve `AgentOutput` (`customer_reply`, `observed_facts`, `tags_proposed`, `stage_proposal`, `temperature_proposal`, `next_action`, `requires_mario`, `escalation_reason`, `requires_approval`, `requested_tools`, `knowledge_used`, + `summary_update`, `pending_items`, `mario_commitments_observed`). Con Claude se usa *structured outputs* (`output_config.format`); en todos los casos se valida con zod. El texto libre nunca toca la BD.
2. **Cálculos fuera del modelo.** Precios, bonos, mensualidades y vigencias salen del motor determinista (directamente o vía la herramienta `calculate_quote`). Las cifras que devuelven las herramientas se agregan a lo “respaldado”; cualquier otra cifra en la respuesta se bloquea.
3. **Regla del bono.** `resolveBonus` toma el bono de la oferta vigente del vehículo/versión. El enganche no interviene salvo en una regla `bonus_adjustment` **explícita, vigente y con estatus vinculante** (`confirmed`/`official_quote`); condiciones o efectos desconocidos ⇒ la regla no se aplica (falla cerrada).
4. **Seis estados de información** (`confirmed`, `official_quote`, `validated_quote`, `estimate`, `historical`, `unknown`) + **estado efectivo** calculado con la fecha actual: lo vencido se vuelve `historical` aunque en BD diga `confirmed`, y lo futuro no se presenta.
5. **Cotizaciones.** Sofía solo produce `estimate` o `validated_template` (coincidencia exacta con una corrida validada vigente). Una restricción `CHECK` en `quotes` impide registrar `official` sin `created_by = 'mario'` y fuente.
6. **Memoria.** Ventana fija de 12 mensajes + memoria estructurada; el tamaño del prompt no crece con el historial (probado con 400 mensajes). Todos los mensajes originales se conservan.
7. **Hechos anclados.** Un hecho propuesto se acepta solo si su evidencia aparece literal en un mensaje del cliente y, si es número, el número aparece en ese mensaje. Los valores reemplazados quedan como `superseded` (bitácora completa); cambiar de modelo retira la versión incompatible.
8. **CRM.** La IA propone; `validateStageTransition` decide (sin retrocesos para Sofía, “vendido” solo Mario, cita/prueba no retroceden un cierre). Cada cambio guarda motivo, autor, estado anterior y `agent_run_id`.
9. **Escalamiento doble.** Reglas deterministas (pide a Mario, crédito aprobado, listo para comprar, descuento, condición especial, cerca del cierre) + propuesta del modelo (p. ej. criterio humano). El payload de la alerta se arma desde la BD, no desde el texto del modelo; se deduplica por disparador.
10. **Identidad y honestidad.** Sofía escribe en representación de Mario pero no se hace pasar por él ni niega ser asistente si le preguntan directamente; nunca afirma que Mario revisó/aprobó algo sin evidencia real (mensaje de Mario o aprobación decidida).
11. **Proveedor Claude.** `claude-opus-5`, *adaptive thinking*, `effort` configurable (por defecto `medium` para latencia de chat), capas estables con `cache_control`, herramientas `strict`, y `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) para que un rechazo de clasificador se reintente en el servidor. Si la API falla o rechaza, Sofía responde de forma segura y queda registrado.
12. **Motor demo.** Implementa el mismo contrato con reglas y pasa por los mismos validadores. Hace el simulador usable sin costo y las pruebas reproducibles; no pretende la calidad conversacional del LLM.
13. **Multitenancy ligera.** Toda entidad comercial lleva `workspace_id` (hoy solo el workspace de Mario) y hay tabla `users`; sin roles ni facturación todavía.
14. **Documentos y PII.** En BD solo referencia opaca, hash y estado; al prompt solo tipo + estado; el logger redacta teléfonos/correos/CURP/RFC y omite cuerpos de mensaje; la API no expone llaves de almacenamiento.

## Modelo de datos (27 tablas)

`workspaces`, `users`, `customers`, `conversations`, `messages`, `customer_profiles`, `customer_facts`, `crm_states`, `customer_tags`, `customer_summaries`, `knowledge_sources`, `knowledge_items`, `vehicles`, `vehicle_versions`, `commercial_offers`, `promotion_rules`, `quote_templates`, `quotes`, `financing_rules`, `insurance_rules`, `appointments`, `followups`, `documents`, `mario_alerts`, `approval_requests`, `agent_runs`, `audit_events`.

Toda información comercial lleva `status`, `source_id`, `source_type`, `valid_from`, `valid_to`, `model_scope`, `version_scope`, `notes`, `is_demo`, `created_at`, `updated_at`.

## Pruebas

`npm test` — 13 archivos, 72 casos, todos con PostgreSQL real (PGlite en memoria) y reloj fijo:

| # | Requisito | Archivo |
|---|---|---|
| 1 | Aumentar enganche no aumenta bono | `tests/01-bonus-rule.test.ts` |
| 2 | Promoción vencida no se trata como vigente | `tests/02-expired-promotion.test.ts` |
| 3 | Información desconocida no se inventa | `tests/03-unknown-info.test.ts` |
| 4 | Estimación no se presenta como oficial | `tests/04-quote-types.test.ts` |
| 5 | Dato ya dado no se vuelve a pedir | `tests/05-no-repeat-questions.test.ts` |
| 6 | Conversación continúa tras intervención de Mario | `tests/06-mario-intervention.test.ts` |
| 7 | Cliente de cierre produce alerta a Mario | `tests/07-closing-alert.test.ts` |
| 8 | No se pide toda la documentación de golpe | `tests/08-documents.test.ts` |
| 9 | El perfil preserva hechos compatibles | `tests/09-profile-merge.test.ts` |
| 10 | La memoria no reenvía todo el historial (+ reinicio y continuidad) | `tests/10-memory.test.ts` |
| — | El texto libre del modelo no modifica la BD; bucle del proveedor Claude con cliente simulado; capas del prompt | `tests/11-llm-contract.test.ts` |
| — | Reglas e historial de CRM | `tests/12-crm-rules.test.ts` |
| — | Esquema compatible con structured outputs | `tests/13-output-schema.test.ts` |

Las pruebas de “mal comportamiento del modelo” usan un proveedor guionizado (`ScriptedProvider`) que responde como lo haría un LLM que inventa, y verifican que el backend lo contiene.

## Supabase / PostgreSQL

```bash
DATABASE_URL=postgres://… npm run db:migrate   # aplica drizzle/*.sql
DATABASE_URL=postgres://… npm run db:seed      # opcional: datos DEMO
```

Con `DATABASE_URL`, la app no migra ni siembra sola (evita meter datos DEMO en una base real); usa los scripts o `SOFIA_AUTO_MIGRATE=true` / `SOFIA_AUTO_SEED=true`. `db:reset` nunca borra una base remota.

## Limitaciones conocidas

- El proveedor Claude se probó con un cliente simulado (sin red); falta validarlo contra la API real con una key.
- El motor demo usa reglas: sirve para validar el sistema, no para medir la calidad de conversación.
- Sin autenticación de usuarios: si se expone fuera de localhost, define `SOFIA_BASIC_AUTH=usuario:contraseña`.
- Turnos concurrentes del mismo cliente no se serializan (en PGlite ocurren en serie; en Postgres el índice único de `crm_states` protege la consistencia, pero uno de los turnos fallaría).
