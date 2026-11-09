# Sofía: herramienta comercial para asesores de autos

Funciona **desde el primer minuto, gratis y sin servidor**. Los datos se guardan en el teléfono, la tablet o la computadora.

Los agentes también son **gratis y sin IA**: corren en tu propia cuenta de Google y en un servidor gratis de Cloudflare. La IA es un extra opcional que mejora la redacción y la lectura. Para conectarlos, ver [CONEXIONES.md](CONEXIONES.md).

| Agente (gratis, sin IA) | Dónde corre | Qué hace solo |
|---|---|---|
| **Correo de placas** | Tu cuenta de Google | Envía desde tu Gmail con los documentos adjuntos, lee las respuestas de la gestoría, propone el estado y manda el seguimiento si no contestan |
| **Sofía vendedora (WhatsApp y Messenger)** | Conector (Cloudflare) | Atiende a cada cliente a cualquier hora: le muestra tus autos con foto y precio, cotiza a crédito, anota la prueba de manejo y te lo pasa cuando pide hablar contigo. Todo queda en Prospectos (🔥 los que quieren cita). Con IA opcional, también contesta lo que el menú no entiende |
| **Redes** | Conector (Cloudflare) | Publica en tu página de Facebook y en Instagram a la hora que programaste |
| **Recordatorios** | Tu cuenta de Google | Copia cada recordatorio al calendario **Sofía** para que suene en el iPhone |
| **Lector de INE** | El teléfono, y Google como segunda opinión | Lee frente y reverso, valida CURP, clave de elector y la zona de lectura mecánica del reverso, y compara los lectores campo por campo |

| Función | Sin conexiones | Con conexiones gratis | Con IA (opcional) |
|---|---|---|---|
| **Clientes y seguimiento** | Ficha, etapas, bitácora, próximo contacto, pantalla **Hoy**, recordatorios (Android: suenan con la app cerrada) | Recordatorios en Google Calendar (iPhone) · prospectos de WhatsApp a clientes con un toque | Clientes creados desde chats exportados, con interés y etapa |
| **Crédito con INE** | Lector del teléfono: valida CURP (dígito verificador), clave de elector, zona de lectura mecánica del reverso, fecha/sexo/nombre contra la CURP, CP ↔ estado y vigencia. Llena el **PDF oficial de BBVA o Banorte** con su mapeo real de campos | Segundo lector (Google) comparado campo por campo | Tercer lector para fotos difíciles |
| **Placas** | Checklist de documentos con fotos, correo con adjuntos desde el teléfono | **Agente de correo** en tu Gmail: respuestas, estado sugerido y seguimiento automático | — |
| **WhatsApp** | Plantillas, mensaje sugerido por etapa, pendientes del día; abre WhatsApp con el texto listo. **Inventario** y **Probar a Sofía** (el simulador de la vendedora) | **Bandeja real** (WhatsApp Business y Messenger), **Sofía vendedora** que contesta sola, prospectos con lo que dijo cada cliente, fotos del cliente → INE | Borradores **en tu estilo**, plantillas personalizadas por cliente y respuestas de la vendedora a lo que el menú no entiende |
| **Tu estilo de venta** | Importa tus chats exportados y muestra tus estadísticas: saludo, emojis, largo, trato | — | La IA aprende cómo vendes y lo imita |
| **Redes** | Texto y foto para compartir a mano | **Publicar ya o programar** en Facebook e Instagram | Publicaciones y anuncios escritos por IA |

## Cómo usarla hoy

- **Web (iPhone, Android y computadora):** https://creoqisaac-cloud.github.io/Sofia/
  - En iPhone: Safari → Compartir → *Agregar a pantalla de inicio*.
  - En computadora: Chrome o Edge → *Instalar*.
- **APK de Android:** https://creoqisaac-cloud.github.io/Sofia/Sofia-Prueba.apk. También está en los releases *Sofía Prueba* de GitHub. Las actualizaciones se instalan encima sin borrar datos.
- **Para ver un ejemplo:** Más → Ajustes → *Cargar clientes de ejemplo*.
- **Formatos oficiales de crédito:** Más → Ajustes → *Formatos oficiales de crédito*. Sube **una vez** el PDF rellenable en blanco de BBVA y el de Banorte. Sofía revisa que sea la versión conocida (cuántos campos reconoce).

## IA: opcional y bajo tu control

Todo lo de las columnas "Sin conexiones" y "Con conexiones gratis" funciona sin IA. La IA se conecta en **Más → Conexiones** con tu propia llave de Anthropic. Puedes elegir la calidad (Opus 5.5, Sonnet 5.5 o Haiku 5.5) y apagar la lectura de INE con IA. Lo que redacta la IA nunca se envía a un cliente sin que tú lo revises y toques **Enviar**.

## Datos y respaldo

- **Sin servidor:** todo queda en el dispositivo. Para respaldar: **Más → Ajustes → Respaldo** (archivo `.json` con clientes, recordatorios y fotos).
- **Con Google:** el respaldo se guarda solo en tu Drive (`sofia-datos.json` y una copia anterior).
- **Con el conector:** guarda una copia, permite usar varios dispositivos y conserva versiones anteriores. Puede ser Cloudflare gratis, tu computadora o cualquier hosting con Node.

## Límites honestos

- **INE:** ningún lector es infalible.
  - Con fotos nítidas, el lector gratis lee frente y reverso completos. Las fotos borrosas, oscuras o con sombra fuerte sobre el reverso pueden dejar campos vacíos.
  - Cuando faltan campos o los lectores no coinciden, el campo queda **marcado para revisar**, no se inventa. Siempre se muestran los datos para confirmarlos.
- **WhatsApp:**
  - Después de 24 h sin mensaje del cliente, Meta solo permite plantillas aprobadas.
  - Las respuestas automáticas son por reglas (bienvenida, horario, palabras clave). Las redacta la IA solo si la conectas, y tú las revisas.
- **Servidor gratis (Cloudflare):** unas 25 a 30 conversaciones nuevas al día (unos 130 mensajes); con el plan de 5 USD al mes, sin preocuparse. Lo programado sale con hasta 5 minutos de retraso.
- **Google gratis:** 100 destinatarios de correo al día.
- **Anuncios pagados:** Sofía los escribe y te lleva al Administrador de anuncios. Crear campañas automáticamente requiere un permiso de Meta (`ads_management`) que se tramita aparte.
- **Formatos de crédito:** se llenan los datos. PEP, consentimientos y firmas los responde y firma el cliente.

## Para desarrolladores

- **Sin compilación:** HTML + módulos de JavaScript.
- **Código generado:** `js/ine-parser.js`, `js/mxid.js`, `js/bank-adapters.js`, `vendor/anthropic-sdk.mjs` y el Worker de un archivo se generan con `node scripts/prueba-generar.mjs`. Salen de la app completa (`src/`), así que la lógica es la misma.
- **Conector:** `servidor/core.mjs` es independiente del hosting. Lo envuelven `servidor.mjs` (Node) y `cloudflare/worker.mjs`.
- **Vendedora:** `js/vendedor.js` es un módulo puro: lo usan el conector, el simulador de la app y la demo de la página de ventas, así los tres contestan igual.
- **Google:** `servidor/google/sofia-google.gs` (Apps Script) y su cliente `js/google.js`.
- **Pruebas:**
  - `npx vitest run tests/31-conector.test.ts tests/32-prueba-credito-oficial.test.ts tests/33-ine-mrz.test.ts tests/34-google-apps-script.test.ts tests/35-vendedor.test.ts`
  - Prueba de punta a punta: ver el encabezado de `scripts/prueba-e2e.mjs`. Simula la IA (también la del servidor), la API de Meta y el script de Google.
- **APK local:** `SOFIA_PRUEBA=1 npx cap sync android && cd android && ./gradlew -PsofiaPrueba assembleDebug`.
