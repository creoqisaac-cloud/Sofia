# Sofía — versión de prueba (gratis, sin servidor)

Esta versión está hecha para que el cliente la use **2–3 días** y deje comentarios, **sin pagar nada**: no necesita servidor, base de datos ni IA. Todo se guarda en el propio teléfono, tablet o computadora.

| Qué hace | Cómo, sin IA |
|---|---|
| **Seguimiento de clientes con recordatorios** | Ficha por cliente, etapas, bitácora, "próximo seguimiento" con botones (mañana, 3 días, 1 semana). Pantalla **Hoy** con lo pendiente. En Android los avisos suenan con la app cerrada; en iPhone se agregan al Calendario (.ics). |
| **Solicitud de crédito con INE por cámara** | Android: escáner nativo (recorta la credencial y lee el texto en el teléfono, sin internet). iPhone/PC: foto → lector incluido en la app. Valida CURP (dígito verificador), clave de elector, fecha/sexo cruzados, CP ↔ estado, vigencia y mayoría de edad. Calcula enganche, mensualidad estimada y relación pago/ingreso. Genera el **PDF** con datos, análisis, firmas y fotos de la INE. |
| **Correos para trámite de placas** | Checklist de documentos (editable), fotos/PDF de cada uno, correo a la gestoría armado solo, envío **con adjuntos** desde Gmail/Correo del teléfono, correo de seguimiento y recordatorio automático para pedir estatus. |
| **Asistente de WhatsApp** | Plantillas editables con variables, mensaje sugerido según la etapa del cliente, **"Responder"**: pegas lo que escribió el cliente → detecta el tema (precio, crédito, cita, documentos, placas, entrega, no interesado…) → respuesta sugerida + siguiente paso. Lista de pendientes del día. Abre WhatsApp con el texto listo; tú pulsas Enviar. |
| **Comentarios de la prueba** | Botón de comentario en todas las pantallas. Se juntan en Ajustes → Comentarios y se mandan por correo o WhatsApp. |

## Cómo dársela al cliente hoy

1. **Activar la página gratis (una sola vez, 1 minuto):** en GitHub → repositorio *Sofia* → **Settings → Pages** → *Source: Deploy from a branch* → rama **`gh-pages`**, carpeta **`/ (root)`** → **Save**.
   La app queda en **https://creoqisaac-cloud.github.io/Sofia/**. Cada cambio en `prueba/` la actualiza solo (flujo *Sofía Prueba*).
2. **Android:** descargar **https://creoqisaac-cloud.github.io/Sofia/Sofia-Prueba.apk** (o del release *Sofía Prueba* en GitHub) e instalar (permitir "orígenes desconocidos"). Se llama **Sofía Prueba** y no choca con la app de la tablet. Las actualizaciones se instalan encima sin borrar datos.
3. **iPhone:** abrir el enlace en **Safari** → Compartir → **Agregar a pantalla de inicio**.
4. **Computadora (Windows/Mac):** abrir el enlace en Chrome o Edge → menú → *Instalar Sofía*. No hace falta un .exe.

Para que el cliente vea cómo funciona: **Ajustes → Prueba → Cargar clientes de ejemplo**.

## Dónde quedan los datos

- En el dispositivo (IndexedDB del navegador o de la app). **No salen de ahí** salvo que se descargue un respaldo o se conecte un servidor.
- **Ajustes → Respaldo**: descarga un archivo `.json` con todo (clientes, recordatorios, fotos). Se restaura en cualquier otro dispositivo.
- Si se borran los datos del navegador o se desinstala la app, se pierde lo que no esté respaldado.

## Conectar un servidor propio (opcional, también gratis)

Sirve para respaldar automáticamente y usar varios dispositivos. Cualquiera de estas, sin atarse a ninguna:

| Opción | Costo | Cómo |
|---|---|---|
| **Google Apps Script + Drive** | Gratis, sin tarjeta | Seguir las instrucciones de [`servidor/google-apps-script.gs`](servidor/google-apps-script.gs). Pegar la URL `…/exec` y la clave en Ajustes → Servidor propio. |
| **Tu computadora** | Gratis | `node prueba/servidor/servidor.mjs` (solo Node, sin instalar nada más). Sirve la app y guarda los datos con versiones. Para usarla desde fuera de casa con HTTPS: `cloudflared tunnel --url http://localhost:8080`. |
| **Cualquier hosting con Node** (Render, Railway, Fly, Koyeb, VPS) | Gratis o de pago | El mismo `servidor.mjs`. Variables: `PORT`, `SOFIA_TOKEN`, `SOFIA_DATA_DIR`. |

El protocolo es mínimo (un `GET` y un `POST` de un JSON), así que cualquier backend futuro (Supabase, Firebase, el servidor completo de Sofía) puede implementarlo.

> Si la app se abre desde `https://…github.io`, el servidor también debe ser `https` (Apps Script, túnel o hosting). Un `http://192.168…` solo funciona abriendo la app desde ese mismo servidor.

## Publicar la app en otro lado (sin ataduras)

`prueba/` es una carpeta de archivos estáticos: se puede subir a **GitHub Pages**, **Firebase Hosting** (`cd prueba && firebase deploy`, ya incluye `firebase.json`), **Netlify**, **Cloudflare Pages** o cualquier hosting. En cada release viene también `Sofia-Prueba-web.zip`.

## IA: opcional, apagada por defecto

Nada de lo anterior usa IA. En **Ajustes → Asistente con IA** se puede activar con una llave propia de Anthropic: aparece "✨ Mejorar con IA" en WhatsApp para redactar o pulir mensajes. La llave se guarda solo en el dispositivo y nunca va a respaldos ni al servidor. Si se apaga o no hay internet, todo sigue funcionando.

**¿Y la app completa (Next.js)?** Tampoco depende de IA: por defecto usa `SOFIA_LLM_PROVIDER=demo`, un motor de reglas. Claude solo se usaría en el simulador de conversación si se activa `SOFIA_LLM_PROVIDER=anthropic`. INE, crédito, placas, recordatorios y cotizador son reglas deterministas.

## Límites honestos de esta prueba

- Sin servidor, cada dispositivo tiene sus propios datos (usar respaldo o servidor propio para compartir).
- WhatsApp: prepara y abre el mensaje, **no envía ni lee solo**. Leer/contestar automáticamente requiere WhatsApp Business API (Meta) en la fase de pago.
- Correo: se envía desde la app de correo del teléfono (con adjuntos); Sofía no guarda contraseñas de correo.
- El lector de fotos del navegador (iPhone/PC) es menos preciso que el escáner de Android; siempre se muestran los datos para revisarlos.
- El PDF es una **pre-solicitud** propia. Los PDFs oficiales BBVA/Banorte se llenan en la app completa.

## Para desarrolladores

- Sin compilación: HTML + JavaScript (módulos). `js/ine-parser.js` y `js/mxid.js` se generan desde `src/server/extraction/` (misma lógica que la app completa).
- Prueba de punta a punta: `SOFIA_TOKEN=clave-prueba node prueba/servidor/servidor.mjs` y en otra terminal `node scripts/prueba-e2e.mjs`.
- APK local: `SOFIA_PRUEBA=1 npx cap sync android && cd android && ./gradlew -PsofiaPrueba assembleDebug`.
