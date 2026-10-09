# Sofía: herramienta comercial para asesores de autos

Funciona **desde el primer minuto, gratis y sin servidor**. Los datos se guardan en el teléfono, la tablet o la computadora.

Cuando la conectas (ver [CONEXIONES.md](CONEXIONES.md)), suma:
- IA real.
- WhatsApp Business oficial.
- Facebook.

| Función | Sin conexiones | Con conexiones |
|---|---|---|
| **Clientes y seguimiento** | Ficha, etapas, bitácora, próximo contacto, pantalla **Hoy**, recordatorios (Android: suenan con la app cerrada; iPhone: Calendario) | Clientes creados solos desde chats de WhatsApp, con su interés y etapa leídos por IA |
| **Crédito con INE** | Escáner nativo en Android y lector en iPhone/PC. Valida CURP (dígito verificador), clave de elector, fecha/sexo/nombre contra la CURP, RFC, CP ↔ estado, vigencia y edad. Llena el **PDF oficial de BBVA o Banorte** con su mapeo real de campos, más la pre-solicitud de Sofía | La **IA lee la INE** y el lector del teléfono la verifica campo por campo; lo que no coincide se marca para revisar |
| **Placas** | Checklist de documentos con fotos, correo a la gestoría con adjuntos, seguimiento automático | — |
| **WhatsApp** | Plantillas, mensaje sugerido por etapa, respuestas por tema, pendientes del día; abre WhatsApp con el texto listo | **Bandeja real** (WhatsApp Business y Messenger): mensajes entrantes, borradores de IA **en tu estilo**, envío desde Sofía, plantillas aprobadas, fotos del cliente → INE |
| **Tu estilo de venta** | Importa tus chats exportados y muestra tus estadísticas: saludo, emojis, largo, trato | La IA aprende cómo vendes y **personaliza las plantillas para cada cliente** |
| **Redes** | Texto y foto para compartir en Facebook/Instagram | **Publica en tu página de Facebook**, escribe publicaciones y anuncios con IA |

## Cómo usarla hoy

- **Web (iPhone, Android y computadora):** https://creoqisaac-cloud.github.io/Sofia/
  - En iPhone: Safari → Compartir → *Agregar a pantalla de inicio*.
  - En computadora: Chrome o Edge → *Instalar*.
- **APK de Android:** https://creoqisaac-cloud.github.io/Sofia/Sofia-Prueba.apk. También está en los releases *Sofía Prueba* de GitHub. Las actualizaciones se instalan encima sin borrar datos.
- **Para ver un ejemplo:** Más → Ajustes → *Cargar clientes de ejemplo*.
- **Formatos oficiales de crédito:** Más → Ajustes → *Formatos oficiales de crédito*. Sube **una vez** el PDF rellenable en blanco de BBVA y el de Banorte. Sofía revisa que sea la versión conocida (cuántos campos reconoce).

## IA: opcional y bajo tu control

Todo lo de la columna "Sin conexiones" funciona sin IA. La IA se conecta en **Más → Conexiones** con tu propia llave de Anthropic. Puedes elegir la calidad (Opus 5.5, Sonnet 5.5 o Haiku 5.5) y apagar la lectura de INE con IA. Nada se envía a un cliente sin que tú lo revises y toques **Enviar**.

## Datos y respaldo

- **Sin servidor:** todo queda en el dispositivo. Para respaldar: **Más → Ajustes → Respaldo** (archivo `.json` con clientes, recordatorios y fotos).
- **Con servidor:** el conector guarda una copia, permite usar varios dispositivos y conserva versiones anteriores. Puede ser Cloudflare gratis, tu computadora o cualquier hosting con Node.

## Límites honestos

- **INE:** ningún lector es infalible.
  - Con IA más la verificación del teléfono y las reglas oficiales (dígito verificador de la CURP, cruces de fecha, sexo y nombre), los errores quedan **marcados**, no ocultos.
  - Siempre se muestran los datos para confirmarlos.
- **WhatsApp:**
  - Después de 24 h sin mensaje del cliente, Meta solo permite plantillas aprobadas.
  - Sofía prepara las respuestas, pero no contesta sola.
- **Anuncios pagados:** Sofía los escribe con IA y te lleva al Administrador de anuncios. Crear campañas automáticamente requiere un permiso de Meta (`ads_management`) que se tramita aparte.
- **Formatos de crédito:** se llenan los datos. PEP, consentimientos y firmas los responde y firma el cliente.

## Para desarrolladores

- **Sin compilación:** HTML + módulos de JavaScript.
- **Código generado:** `js/ine-parser.js`, `js/mxid.js`, `js/bank-adapters.js`, `vendor/anthropic-sdk.mjs` y el Worker de un archivo se generan con `node scripts/prueba-generar.mjs`. Salen de la app completa (`src/`), así que la lógica es la misma.
- **Conector:** `servidor/core.mjs` es independiente del hosting. Lo envuelven `servidor.mjs` (Node) y `cloudflare/worker.mjs`.
- **Pruebas:**
  - `npx vitest run tests/31-conector.test.ts tests/32-prueba-credito-oficial.test.ts`
  - Prueba de punta a punta: ver el encabezado de `scripts/prueba-e2e.mjs`. Simula la IA y la API de Meta.
- **APK local:** `SOFIA_PRUEBA=1 npx cap sync android && cd android && ./gradlew -PsofiaPrueba assembleDebug`.
