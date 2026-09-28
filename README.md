# Sofía — asistente comercial con IA para Mario Abarca (Honda)

- Sprint 1: **cerebro, persistencia y simulador**.
- Sprint 2: **app operativa iPhone-first**. Incluye clientes con procedencia y conflictos, solicitudes de crédito BBVA/Banorte en PDF, memoria de corridas y control de ventas.

Todavía no hay WhatsApp, API de IA real, pagos, notificaciones push ni producción.

> ⚠️ Todos los precios, bonos, tasas, seguros y corridas incluidos son **DEMO (ficticios)**: están marcados `is_demo = true`, sus fuentes se llaman “DEMO — … (NO REAL)” y Sofía los menciona con “(dato DEMO)”. No representan información comercial real de Honda.

## Inicio rápido

```bash
npm install
npm run dev            # http://localhost:3000 (app) · /simulator (Sprint 1)
```

No requiere base de datos ni API key:

- Sin `DATABASE_URL` usa **PGlite**, un PostgreSQL embebido que se guarda en `.data/pglite`.
- Por defecto el cerebro es el **motor demo determinista** (`SOFIA_LLM_PROVIDER=demo`).
- La primera vez aplica las migraciones y siembra los datos DEMO de Sprint 1 y Sprint 2.

Para probar desde el iPhone en la misma red Wi‑Fi:

```bash
npm run build && npx next start -H 0.0.0.0 -p 3000
```

Abre `http://<ip-de-tu-computadora>:3000` en Safari. Para instalarla como PWA hace falta HTTPS, que llega con el despliegue en Sprint 3.

La implementación de Claude se conserva (`src/server/agent/providers/anthropic.ts`), pero **no se usa**. Solo se activa con `SOFIA_LLM_PROVIDER=anthropic` y credenciales de una cuenta del proyecto; nunca con una API personal.

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
| `npm run db:reset` | Borra y re-siembra la base **PGlite local** y sus documentos privados (detén la app antes) |
| `npm run pdf:inspect -- archivo.pdf` | Lista nombres y tipos de campos AcroForm (nunca valores) |
| `npm run pdf:register -- --institution BBVA --file archivo.pdf --version v1 [--mapping m.json] [--clear-values]` | Registra una plantilla PDF oficial |
| `npm run qa:mobile` | QA con Playwright contra la app en marcha (`BASE_URL=…`); capturas en `qa-screenshots/` (ignorado) |

## Qué se puede hacer hoy

**App operativa (Sprint 2):**

- **Inicio**: “¿Qué necesita mi atención hoy?” y “Prioridades de hoy”.
- **Clientes**: lista con filtros y ficha con pestañas.
- **Crédito**: asistente de solicitud BBVA/Banorte que genera un borrador PDF.
- **Ventas**: lista, detalle editable y tabla de escritorio.
- **Alertas** y **Más**.

**Herramientas de Sprint 1** (en *Más*):

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

## Sprint 2 — app operativa

### Arquitectura

```
iPhone (PWA) ──HTTPS──► Next.js (servidor remoto, Sprint 3) ──► PostgreSQL / Supabase
                         │
                         ├─ páginas server-rendered (datos reales de la BD, force-dynamic)
                         ├─ server actions (src/app/actions.ts): validan con zod y delegan
                         └─ servicios (src/server/services/*): reglas + auditoría + procedencia
                                  └─ dominio puro (src/domain/*): provenance, credit/*, sales, quote-engine
```

La continuidad es una sola línea. Todas las entidades cuelgan del mismo `customer_id` y se enlazan entre sí (`sale_records.quote_id`, `sale_records.credit_application_id`, `documents.credit_application_id`):

**cliente → oportunidad (CRM) → cotizaciones → solicitudes de crédito → venta → entrega → comisión (estructura).**

Código nuevo:

```
src/domain/profile-fields.ts   Campos universales del cliente (secciones, validación RFC/CURP/NSS/CP, sensibles)
src/domain/provenance.ts       decideIncoming / fieldState: observado · histórico · conflicto · confirmado · reemplazado
src/domain/credit/             Adaptadores deterministas BBVA y Banorte (slots), análisis y plan de llenado
src/domain/sales.ts            Columnas del control de ventas de Mario, flujo de estados, pendientes
src/server/credit/             pdf.ts (inspección y llenado AcroForm con pdf-lib), import.ts (lectura de solicitud previa)
src/server/services/           profile, credit, documents, quotes, sales, dashboard, customer-overview, nav
src/server/db/seed-sprint2.ts  Clientes y plantillas DEMO (idempotente)
src/app/                       /, /customers, /customers/[id], /customers/[id]/credit[/appId], /sales, /sales/[id],
                               /sales/table, /alerts, /more, manifest, íconos, /api/documents/generated/[id]
src/components/app/            AppShell (barra inferior), ui, cards, forms, customer-tabs
drizzle/0001_sprint2_credit_sales.sql  Migración de Sprint 2 (incluye migración de datos de Sprint 1)
```

### Flujo móvil

La barra inferior tiene cinco entradas: **Inicio · Clientes · Ventas · Alertas · Más**. Respeta el *safe area* del iPhone. En escritorio se convierte en barra lateral.

Flujo probado de punta a punta con `npm run qa:mobile` en 390×844:

1. Abrir un cliente.
2. Crear una solicitud BBVA.
3. Resolver los conflictos (“Usar BBVA”).
4. Confirmar los datos leídos.
5. Capturar lo que falta.
6. Revisar y generar el borrador PDF.
7. Guardar una corrida validada.
8. Crear la venta y capturar pedido y factura.
9. Cerrar, volver a abrir y comprobar que todo persiste.

Sin scroll horizontal y sin inputs de menos de 16px (así iOS no hace zoom) en 390, 430, 768 y 1440px.

### Modelo del cliente y procedencia

Cada dato del cliente es un **hecho** en `customer_facts` con:

- `value` y `status`;
- `source_type`: mensaje del cliente, captura de Mario, solicitud de crédito, documento o importación;
- `source_ref_id` y `source_label`;
- `confirmed_by`, `confirmed_at` y `created_at`.

El resumen en `customer_profiles.data` es solo una proyección que se reconstruye desde los hechos (`rebuildProfile`) y **no incluye campos en conflicto**.

Reglas (`decideIncoming`):

- **Captura de Mario** → `confirmed`; los valores anteriores quedan `superseded`, **nunca se borran**. Si Mario guarda el mismo valor que un hecho observado, confirma ese hecho.
- **Mismo valor** de otra fuente → refuerza el hecho, sin duplicarlo.
- **Valor distinto** de un documento o solicitud → `conflicting`: se conservan ambos candidatos con su fuente.
- **El cliente corrige por chat** un dato solo observado → se reemplaza. Si el dato ya estaba confirmado → conflicto para que Mario decida.

### Conflictos

La tarjeta de conflicto muestra cada valor con su fuente y fecha, y tres opciones: **“Usar BBVA” / “Usar Banorte” / “Capturar otro”**. Al resolver:

- el valor elegido queda `confirmed`, con `confirmed_by` y la fecha;
- los demás quedan `superseded`, visibles en el historial;
- la auditoría (`fact_conflict_resolved`) guarda las fuentes elegida y descartada, **no los valores**.

En el ejemplo DEMO “Cliente Conflicto”, Mario elige BBVA **solo para ese cliente**. No existe ninguna prioridad por institución: el siguiente conflicto se vuelve a preguntar.

### Módulo de crédito

- Un cliente puede tener **muchas solicitudes** (`credit_applications`), cada una con su historial de estados (`credit_application_events`).
- Estados: `draft`, `missing_information`, `conflict`, `ready_for_review`, `ready_for_signature`, `submitted`, `approved`, `rejected`, `cancelled`.
- Los primeros cuatro se recalculan solos cuando cambia el perfil. El resto los decide Mario.
- No se puede pasar a *lista para firma* con conflictos abiertos.

El asistente tiene 6 pasos:

1. Análisis: lo que Sofía ya sabe.
2. Clasificación por clase de campo.
3. Completar: conflictos, confirmar y capturar faltantes.
4. Revisión: vista previa. Nunca dice “solicitud completa”.
5. Borrador PDF.
6. Estado y documentos.

Clases de campo:

| Clase | Qué hace el sistema |
|---|---|
| `AUTO_FILL` | Se llena **solo con datos confirmados** |
| `ASK_IF_MISSING` | Se pide a Mario si falta |
| `CONDITIONAL` | Solo aplica si se cumple la condición (p. ej. empleo anterior si antigüedad < 2 años) |
| `HUMAN_CONFIRMATION` | **Nunca se inventa ni se llena**: PEP, autorizaciones, cuestionario médico, consentimientos opcionales |
| `SIGNATURE` | **Nunca se llena**: firma autógrafa del cliente |

`generateApplicationPdf()`:

- verifica el hash de la plantilla y llena una **copia nueva**, sin aplanarla; la plantilla queda intacta;
- usa solo hechos `confirmed`;
- guarda la copia en `generated_documents` con `fields_filled`, `sources_used` (fuente por campo), `generated_at` y `generated_by`;
- solo lee campos AcroForm: **sin OCR**.

También se puede **importar una solicitud previa** con campos AcroForm llenos. Sus datos entran como `observed`, con la fuente “Solicitud X (archivo)”; si chocan con lo que ya existe, generan conflicto.

**Plantillas** (`application_templates`):

- institución, versión, hash, `field_mapping` (slot → nombre real del campo AcroForm) e `is_demo`;
- las incluidas son **plantillas sintéticas DEMO** generadas con pdf-lib;
- para usar los PDFs oficiales:
  ```bash
  npm run pdf:inspect -- banco.pdf
  npm run pdf:register -- --institution BBVA --file banco.pdf --version 2026-09
  ```
  El registro sugiere el mapeo y rechaza PDFs que traigan datos, salvo `--clear-values`.

**Documentos**:

- checklist por cliente con estados: `missing`, `requested`, `received`, `needs_review`, `accepted`, `rejected`;
- base común más reglas por institución (`document_requirements`), filtradas por tipo de cliente y vigencia;
- las reglas de Banorte **no se aplican a BBVA**.

### BBVA (`src/domain/credit/bbva.ts`)

| Sección | Campos |
|---|---|
| Cliente, domicilio, empleo | AUTO_FILL / ASK_IF_MISSING |
| Empleo anterior | CONDITIONAL |
| Dos referencias | ASK_IF_MISSING |
| PEP | 5 campos HUMAN_CONFIRMATION |
| Autorizaciones (buró, uso de datos, publicidad) | 3 campos HUMAN_CONFIRMATION |
| Firmas | 3 SIGNATURE |

### Banorte (`src/domain/credit/banorte.ts`)

| Sección | Campos |
|---|---|
| Cliente | Incluye NSS |
| Domicilio | Calle + número exterior + interior en un solo campo |
| Empleo | AUTO_FILL / ASK_IF_MISSING |
| Coacreditado y obligado solidario | CONDITIONAL; se capturan a mano en esta versión |
| Cuestionario médico, mercadotecnia, autorizaciones | HUMAN_CONFIRMATION |
| Firmas | SIGNATURE; las de coacreditado y obligado son condicionales |

Tiene reglas de documentos propias de Banorte en DEMO.

### Cotizaciones

- Memoria de **corridas validadas exactas**: mismo modelo, versión, enganche (±$1) y plazo, vigente y con estado `validated_quote`.
- **Sin interpolación.** Si no hay coincidencia exacta: **“No existe una corrida validada para este escenario.”** En ese caso se puede mostrar aparte una estimación etiquetada.
- Las cotizaciones vencidas aparecen como “Histórica (vencida)”.
- Mario puede registrar corridas validadas desde la pestaña Cotizaciones.

### Control de ventas

`sale_records` está separado de las cotizaciones. Contiene todas las columnas del control de Mario:

- cliente, teléfono, unidad, VIN, pedido, factura y fecha de factura;
- valor factura, enganche, institución, bono, comisión por apertura, seguro y accesorios/extras;
- fecha de entrega, estado y notas.

Al crearse desde una cotización o solicitud **hereda** unidad, bono, enganche, apertura, seguro e institución. **Nunca hereda el valor factura.** Cada cambio queda en `sale_record_changes` (valor anterior y nuevo, motivo, autor) y en auditoría.

Flujo de estados:

```
prospect → negotiation → credit_process → approved → order_created → invoiced → delivery_pending → delivered
                                                                                    └────────── cancelled (con motivo)
```

- Reabrir una venta entregada o cancelada exige motivo.
- Facturar o entregar marca al cliente como *vendido* (acción de Mario).
- Vistas: `/sales` (tarjetas con filtros por estado), `/sales/[id]` (secciones editables) y `/sales/table` (tabla de escritorio).

**Comisiones**: solo estructura (`commission_rules`, `commission_periods`, `commission_calculations`, `commission_adjustments`, `commission_payments`). **No hay fórmula**; el LLM nunca calcula comisiones.

**Alertas operativas**: se calculan desde la BD, no se guardan. Cubren:

- factura sin fecha de entrega;
- entrega vencida o próxima;
- solicitud con conflictos o faltantes;
- documentos por revisar;
- corrida estimada sin validar;
- crédito aprobado sin venta.

### PWA

- `manifest.ts` con `display: standalone`, íconos generados e `apple-touch-icon`.
- `appleWebApp` y `viewportFit: cover`, con *safe areas* en la cabecera y la barra inferior.
- Inputs con `inputMode` y `autocomplete` adecuados (teléfono, correo, montos, CP) y fuente de 16px, para que iOS no haga zoom.
- Tema oscuro.

### Seguridad y datos personales

- **Datos del repositorio**:
  - Seed, pruebas y capturas usan solo datos ficticios DEMO: RFC/CURP con prefijo DEMO, teléfonos 555 y correos `@example.com`.
  - `.gitignore` bloquea `*.pdf`, `*.xlsx`/`*.xls`/`*.xlsm`/`*.csv`, `/private/`, `/archivos-reales/`, `/qa-screenshots/` y `.data/`.
  - Los PDFs y Excels reales nunca se versionan.
- **Registros**:
  - El logger redacta RFC, CURP, correo y teléfono.
  - La auditoría guarda claves de campo, no valores.
  - El prompt enmascara los datos sensibles como “(registrado)”.
- **Firmas**: no se almacenan ni se reutilizan. Los campos de firma y consentimiento nunca se llenan.
- **PDFs generados**: se sirven solo por `/api/documents/generated/[id]` con `Cache-Control: no-store`. El almacenamiento privado está fuera de `/public`.
- **Acceso**: sin autenticación de usuarios todavía; usa `SOFIA_BASIC_AUTH` si expones la app fuera de localhost.

### Datos DEMO de Sprint 2

Todos los clientes llevan “(DEMO)” en el nombre:

| Cliente | Situación |
|---|---|
| Juan Pérez | BBVA aprobado, venta aprobada |
| Ana López | Banorte con faltantes y documentos pendientes |
| Carlos Gómez | Estimación sin validar |
| Cliente Conflicto | Solicitudes BBVA y Banorte previas que no coinciden |
| Laura Entrega | Facturada, entrega en 2 días |

## Modelo de datos (27 tablas en Sprint 1)

`workspaces`, `users`, `customers`, `conversations`, `messages`, `customer_profiles`, `customer_facts`, `crm_states`, `customer_tags`, `customer_summaries`, `knowledge_sources`, `knowledge_items`, `vehicles`, `vehicle_versions`, `commercial_offers`, `promotion_rules`, `quote_templates`, `quotes`, `financing_rules`, `insurance_rules`, `appointments`, `followups`, `documents`, `mario_alerts`, `approval_requests`, `agent_runs`, `audit_events`.

Toda información comercial lleva `status`, `source_id`, `source_type`, `valid_from`, `valid_to`, `model_scope`, `version_scope`, `notes`, `is_demo`, `created_at`, `updated_at`.

Sprint 2 agrega:

- `credit_institutions`, `application_templates`, `credit_applications`, `credit_application_events`;
- `generated_documents`, `document_requirements`;
- `sale_records`, `sale_record_changes`;
- `commission_rules`, `commission_periods`, `commission_calculations`, `commission_adjustments`, `commission_payments`.

También agrega columnas de procedencia en `customer_facts` y el vínculo `credit_application_id` en `documents`.

## Pruebas

`npm test` — 18 archivos, 105 casos, todos con PostgreSQL real (PGlite en memoria) y reloj fijo:

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
| S2 | Conflictos y procedencia (caso de referencia, sintético); BBVA no tiene prioridad universal | `tests/14-conflicts.test.ts` |
| S2 | PDF: solo confirmados; nunca humanos ni firmas; plantilla intacta; importación → conflicto | `tests/15-credit-pdf.test.ts` |
| S2 | Corridas exactas sin interpolación; vencidas como históricas | `tests/16-quotes-memory.test.ts` |
| S2 | Ventas: herencia, auditoría de cambios, flujo de estados | `tests/17-sales.test.ts` |
| S2 | Integridad (valores JSON como texto) y migración 0000→0001 | `tests/18-data-integrity.test.ts` |

Las pruebas de “mal comportamiento del modelo” usan un proveedor guionizado (`ScriptedProvider`) que responde como lo haría un LLM que inventa, y verifican que el backend lo contiene.

## Supabase / PostgreSQL

```bash
DATABASE_URL=postgres://… npm run db:migrate   # aplica drizzle/*.sql
DATABASE_URL=postgres://… npm run db:seed      # opcional: datos DEMO
```

Con `DATABASE_URL`, la app no migra ni siembra sola (evita meter datos DEMO en una base real); usa los scripts o `SOFIA_AUTO_MIGRATE=true` / `SOFIA_AUTO_SEED=true`. `db:reset` nunca borra una base remota.

## Limitaciones conocidas

- El proveedor Claude se probó con un cliente simulado (sin red). En Sprint 2 está desactivado por decisión: no se usan APIs de IA personales.
- Las plantillas BBVA/Banorte incluidas son **sintéticas**. Con los PDFs oficiales hay que registrar el mapeo real (`pdf:register`) y revisarlo.
- Los datos de coacreditado y obligado solidario de Banorte se capturan a mano en el PDF.
- El motor demo usa reglas: sirve para validar el sistema, no para medir la calidad de conversación.
- Sin autenticación de usuarios: si se expone fuera de localhost, define `SOFIA_BASIC_AUTH=usuario:contraseña`.
- Turnos concurrentes del mismo cliente no se serializan (en PGlite ocurren en serie; en Postgres el índice único de `crm_states` protege la consistencia, pero uno de los turnos fallaría).
