# Conexiones reales de Sofía: IA, servidor, WhatsApp Business y Facebook

Todo se configura una sola vez. Sofía funciona sin nada de esto; cada conexión agrega una capacidad real.

| Conexión | Para qué | Costo |
|---|---|---|
| **IA (Claude, de Anthropic)** | Leer INE con precisión, aprender tu estilo, redactar respuestas y plantillas por cliente, crear clientes desde chats, escribir publicaciones y anuncios | Pago por uso, con saldo prepagado en tu cuenta de Anthropic |
| **Servidor (conector)** | Respaldo en la nube y puente con WhatsApp/Facebook (Meta exige un servidor con HTTPS para avisar de mensajes nuevos) | Gratis en Cloudflare |
| **WhatsApp Business (API oficial)** | Recibir y contestar mensajes desde Sofía, ver fotos (INE) que mandan los clientes | Contestar dentro de las 24 h después de que el cliente escribe: gratis. Mensajes que inicias tú (plantillas): Meta cobra por mensaje |
| **Facebook (página y Messenger)** | Publicar en tu página, contestar Messenger, preparar anuncios | Gratis (los anuncios se pagan en Meta) |

Orden recomendado: **1. IA → 2. Servidor → 3. WhatsApp → 4. Facebook.**

---

## 1. IA (5 minutos)

1. Entra a **https://console.anthropic.com** y crea tu cuenta.
2. **Billing**: carga saldo, por ejemplo 10 USD.
3. **API keys → Create key** y copia la llave (empieza con `sk-ant-`).
4. En Sofía: **Más → Conexiones → Inteligencia artificial**. Pega la llave, elige la calidad y toca **Conectar y probar**. Debe aparecer **● Conectada**.

Las tres calidades son:
- **Máxima calidad (Opus 5.5).** Recomendada para leer INE.
- **Equilibrado (Sonnet 5.5).**
- **Rápido y económico (Haiku 5.5).**

Puedes cambiar de calidad cuando quieras.

Costo aproximado con calidad máxima:
- Leer una INE (frente y reverso): unos 4 o 5 centavos de dólar.
- Redactar un mensaje de WhatsApp: 1 o 2 centavos.
- Con Haiku cuesta unas 40 veces menos.

La llave se guarda solo en ese teléfono. No viaja a respaldos ni al servidor.

---

## 2. Servidor gratis en Cloudflare (15 minutos, sin tarjeta)

1. Crea tu cuenta en **https://dash.cloudflare.com**.
2. **Workers & Pages → Create → Create Worker**. Nómbralo `sofia-conector` y toca **Deploy**.
3. Toca **Edit code**. Borra todo, pega el contenido de [`servidor/cloudflare/worker-un-archivo.js`](servidor/cloudflare/worker-un-archivo.js) y toca **Deploy**.
4. Crea el almacén de datos:
   - **Storage & Databases → KV → Create**, con el nombre `SOFIA_KV`.
   - Después, en tu Worker: **Settings → Bindings → Add → KV namespace**. Usa el nombre de variable `SOFIA_KV` y elige el KV que creaste.
5. En **Settings → Variables and Secrets**, agrega como **Secret** la clave de la app:
   - `SOFIA_TOKEN`: una clave larga que inventes, la misma que pondrás en Sofía.
   - Los datos de Meta (`META_APP_SECRET`, `WA_TOKEN`, etc.) se agregan en los pasos 3 y 4.
6. Tu dirección queda así: `https://sofia-conector.<tu-subdominio>.workers.dev`.
7. En Sofía: **Más → Conexiones → Servidor**. Pega la dirección y la clave y toca **Conectar y probar**.

Si prefieres la terminal:

```
cd prueba/servidor/cloudflare
npx wrangler kv namespace create SOFIA_KV   # pega el id en wrangler.toml
npx wrangler secret put SOFIA_TOKEN
npx wrangler deploy
```

**Otras opciones, sin atarte a una:**
- El mismo conector corre con `node prueba/servidor/servidor.mjs` en tu computadora, un VPS, Railway, Fly o Koyeb.
- Las variables se ponen en el entorno o en un archivo `prueba/servidor/.env`.
- Para que Meta llegue a tu computadora necesitas una dirección HTTPS fija, por ejemplo con un túnel con nombre de Cloudflare o un dominio estático de ngrok.
- Ojo: en Render gratis el disco se borra en cada reinicio.

---

## 3. WhatsApp Business, API oficial de Meta (30–60 minutos)

### 3.1 Crear la app
1. Necesitas un **portafolio comercial** en **https://business.facebook.com**. Si no lo tienes, créalo.
2. En **https://developers.facebook.com → Mis apps → Crear app**:
   - Caso de uso: **Conectar con clientes a través de WhatsApp**.
   - Vincúlala a tu portafolio comercial.
3. En **WhatsApp → Configuración de la API** verás un **número de prueba gratis** y dos datos que debes copiar:
   - **Identificador del número de teléfono** → `WA_PHONE_NUMBER_ID`
   - **Identificador de la cuenta de WhatsApp Business** → `WA_WABA_ID`
4. Para usar **tu número real**, agrégalo en esa misma pantalla.
   - Un número que hoy usas en la app de WhatsApp normal debe migrarse.
   - Lo más simple para empezar es un número nuevo, solo para Sofía.

### 3.2 Token permanente (no caduca)
1. Ve a **business.facebook.com → Configuración → Usuarios → Usuarios del sistema**.
2. Toca **Agregar** y crea un usuario con rol **Administrador**.
3. Toca **Asignar activos**: la app y la cuenta de WhatsApp, con control total. Si vas a conectar Facebook, agrega también tu página.
4. Toca **Generar token**, elige la app y la caducidad **Nunca**, y marca los permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - Para Facebook también: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_messaging`
5. Copia el token → `WA_TOKEN`.

### 3.3 Clave de la app y webhook
1. En **developers.facebook.com → tu app → Configuración de la app → Básica**, copia la **Clave secreta de la app** → `META_APP_SECRET`.
2. Inventa una palabra de verificación, por ejemplo `sofia-verifica-2026` → `META_VERIFY_TOKEN`.
3. Agrega en Cloudflare (o en tu `.env`) los secretos `WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_WABA_ID`, `META_APP_SECRET` y `META_VERIFY_TOKEN`. Vuelve a desplegar.
4. En **WhatsApp → Configuración → Webhook**:
   - URL de devolución: `https://<tu-conector>/webhook/meta`
   - Token de verificación: el mismo `META_VERIFY_TOKEN`
   - Toca **Verificar y guardar** y luego suscríbete al campo **messages**.
5. En Sofía: **Conexiones → Conectar y probar**. Debe aparecer tu número.
6. Prueba con **Enviar prueba** (manda la plantilla `hello_world`).
   - Con el número de prueba de Meta, primero agrega tu celular como destinatario permitido en *Configuración de la API*.
7. Para usarlo con clientes reales:
   - Pon la app en modo **En vivo**: pide una URL de política de privacidad.
   - Verifica el negocio en el portafolio para subir los límites de envío.

**Reglas de WhatsApp que conviene saber:**
- Puedes escribir libremente durante **24 horas** después del último mensaje del cliente.
- Pasado ese tiempo solo se permiten **plantillas aprobadas**. Se crean en el Administrador de WhatsApp y Sofía las muestra para enviarlas.

---

## 4. Facebook: página y Messenger (15 minutos)

1. **ID de la página.** En tu página → Información → Transparencia, o con la herramienta Graph API Explorer: `GET /me/accounts` → `FB_PAGE_ID`.
2. **Token de la página.**
   - En **Graph API Explorer**, usa el token del usuario del sistema (paso 3.2) y consulta `GET /{FB_PAGE_ID}?fields=access_token`.
   - Ese `access_token` es `FB_PAGE_TOKEN`.
3. Agrega `FB_PAGE_ID` y `FB_PAGE_TOKEN` al conector y vuelve a desplegar. En Sofía → Conexiones debe aparecer el nombre de tu página.
4. **Messenger en la bandeja:**
   - En tu app de Meta, agrega el producto **Messenger** y configura su webhook con la **misma URL y token**.
   - Suscribe tu página al campo **messages**.
5. **Anuncios:** Sofía escribe el anuncio con IA y te lleva al Administrador de anuncios. Crear campañas solo, desde Sofía, requiere el permiso `ads_management` aprobado por Meta. Se agrega cuando esté aprobado.

---

## Seguridad

- Los tokens de Meta viven **solo en el conector** (secretos de Cloudflare o tu `.env`), nunca en los teléfonos.
- El conector **verifica la firma** de cada aviso de Meta (`META_APP_SECRET`). Rechaza mensajes falsificados.
- La app habla con el conector usando la clave `SOFIA_TOKEN`.
- Las fotos de INE se guardan en el teléfono. Solo se envían a la IA para leerlas, y eso se puede apagar en Conexiones.
