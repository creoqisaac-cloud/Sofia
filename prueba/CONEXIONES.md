# Conexiones reales de Sofía: todo gratis, la IA es un extra

Sofía funciona sin nada de esto. Cada conexión agrega una capacidad real y **ninguna necesita IA ni tarjeta**. La IA de pago solo mejora la redacción y la lectura cuando tú decidas.

| Conexión | Qué hace | Costo |
|---|---|---|
| **Google (tu propia cuenta)** | Respaldo en tu Drive · **agente de correo**: envía desde tu Gmail con adjuntos, lee las respuestas de la gestoría, sugiere el estado y da seguimiento solo · recordatorios en Google Calendar (suenan en el iPhone) · segundo lector de INE (OCR de Drive) | Gratis |
| **Servidor (conector) en Cloudflare** | Puente con Meta, que exige un servidor HTTPS para avisar de mensajes nuevos · **agente de WhatsApp/Messenger** que contesta solo por reglas · prospectos nuevos · bandeja · **publicaciones programadas** que salen aunque la app esté cerrada | Gratis, sin tarjeta |
| **WhatsApp Business (API oficial)** | Recibir y contestar desde Sofía, respuestas automáticas, ver las fotos (INE) que mandan los clientes | Contestar en las 24 h siguientes al mensaje del cliente: gratis. Plantillas que inicias tú: Meta cobra por mensaje |
| **Facebook e Instagram** | Publicar ya o programado en tu página y en Instagram, contestar Messenger | Gratis (los anuncios se pagan en Meta) |
| **IA (opcional)** | Redactar en tu estilo, plantillas por cliente, leer INE difíciles, crear clientes desde chats | De pago, por uso, con tu llave de Anthropic |

Orden recomendado: **1. Google → 2. Servidor → 3. WhatsApp → 4. Facebook e Instagram → 5. IA (si la quieres).**

---

## 1. Google: datos, correo, recordatorios y lector (10 minutos)

Tu cuenta de Google hace de servidor con un script de Google Apps Script que corre en tu propia cuenta.

1. Sigue la guía paso a paso: [`servidor/google/LEEME.md`](servidor/google/LEEME.md).
2. En Sofía: **Más → Conexiones → Google**. Pega la dirección que termina en `/exec` y tu clave, y toca **Conectar y probar**. Debe aparecer tu correo.
3. Toca **Probar recordatorio**. Debe aparecer en el calendario **Sofía** de tu Google Calendar.

Qué se activa:
- **Placas:**
  - **Enviar a la gestoría** sale de tu Gmail con las fotos de los documentos.
  - **Revisar respuestas** lee lo que contestó la gestoría y propone el estado (*falta documento*, *pago*, *placas listas*, *en trámite*). Tú lo aplicas con un toque.
  - **Seguimiento automático:** si no contestan en N días, Google manda un recordatorio en el mismo hilo. Es uno por periodo, con un máximo de 3, y Sofía no tiene que estar abierta.
- **Recordatorios:** cada recordatorio de Sofía se copia al calendario **Sofía** con aviso.
- **Crédito:** la INE la leen el lector del teléfono **y** el de Google. Los campos se comparan uno por uno y lo que no coincide se marca.
- **Respaldo:** si no tienes el conector, los datos se respaldan en tu Drive.

Límites de una cuenta gratuita: 100 destinatarios de correo al día y unas 250 lecturas de INE con Google al día.

---

## 2. Servidor gratis en Cloudflare (15 minutos, sin tarjeta)

1. Crea tu cuenta en **https://dash.cloudflare.com**.
2. **Workers & Pages → Create → Create Worker**. Nómbralo `sofia-conector` y toca **Deploy**.
3. Toca **Edit code**. Borra todo, pega el contenido de [`servidor/cloudflare/worker-un-archivo.js`](servidor/cloudflare/worker-un-archivo.js) y toca **Deploy**.
4. Crea el almacén de datos:
   - **Storage & Databases → KV → Create**, con el nombre `SOFIA_KV`.
   - En tu Worker: **Settings → Bindings → Add → KV namespace**. Usa el nombre de variable `SOFIA_KV` y elige el KV que creaste.
5. **Programador de publicaciones:** en tu Worker, **Settings → Triggers → Cron Triggers → Add**, con `*/5 * * * *` (cada 5 minutos). Sin esto, lo programado solo sale cuando alguien abre la app.
6. En **Settings → Variables and Secrets**, agrega como **Secret**:
   - `SOFIA_TOKEN`: una clave larga que inventes. Es la misma que pondrás en Sofía.
   - `PUBLIC_URL`: la dirección de tu Worker (paso 7). Instagram descarga de ahí las fotos programadas.
   - Los datos de Meta (`META_APP_SECRET`, `WA_TOKEN`, etc.) se agregan en los pasos 3 y 4.
7. Tu dirección queda así: `https://sofia-conector.<tu-subdominio>.workers.dev`.
8. En Sofía: **Más → Conexiones → Servidor**. Pega la dirección y la clave y toca **Conectar y probar**.

Si prefieres la terminal (el cron ya viene en `wrangler.toml`):

```
cd prueba/servidor/cloudflare
npx wrangler kv namespace create SOFIA_KV   # pega el id en wrangler.toml
npx wrangler secret put SOFIA_TOKEN
npx wrangler deploy
```

**Límites del plan gratis de Cloudflare:**
- **1,000 escrituras al día** en KV. Cada mensaje que entra usa de 3 a 6, así que alcanza para **unos 200 mensajes al día**.
- 100,000 peticiones al día.
- Si te quedas corto: el plan pagado de Workers, o el mismo conector en tu computadora (abajo), que no tiene ese límite.

**Otras opciones, sin atarte a una:**
- El mismo conector corre con `node prueba/servidor/servidor.mjs` en tu computadora, un VPS, Railway, Fly o Koyeb. Ahí el programador revisa cada minuto.
- Las variables se ponen en el entorno o en un archivo `prueba/servidor/.env`.
- Para que Meta llegue a tu computadora necesitas una dirección HTTPS fija, por ejemplo con un túnel con nombre de Cloudflare o un dominio estático de ngrok. Ponla también en `PUBLIC_URL`.
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
3. Toca **Asignar activos**: la app y la cuenta de WhatsApp, con control total. Si vas a conectar Facebook e Instagram, agrega también tu página.
4. Toca **Generar token**, elige la app y la caducidad **Nunca**, y marca los permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - Para Facebook también: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_messaging`
   - Para Instagram también: `instagram_basic`, `instagram_content_publish`
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

### 3.4 Agente automático (gratis, sin IA)
En Sofía: **WhatsApp → Automático**.
- **Contestar automáticamente:** enciéndelo y elige tus días, tu horario y tu zona horaria.
- **Bienvenida:** el primer mensaje a quien te escribe por primera vez.
- **Fuera de horario:** lo que contesta cuando no estás.
- **Respuestas por palabra clave:** por ejemplo *precio, cuánto cuesta* → tu respuesta. Ya trae tres de ejemplo: precio, crédito y ubicación.
- Variables: `{nombre}` (del perfil del cliente), `{asesor}`, `{agencia}`.
- **No repetir antes de N horas:** cada contacto recibe cada respuesta automática una sola vez en ese periodo, nunca más de una por mensaje.
- **Pausa si contestaste a mano:** si tú le escribiste hace menos de N minutos, el agente no interrumpe.
- **Prospectos nuevos:** cada contacto que escribe por primera vez aparece en esa pestaña y en **Hoy**. Con **Agregar como cliente** queda en tu lista con un recordatorio para contestarle.

Corre en tu servidor: contesta aunque el teléfono esté apagado.

**Reglas de WhatsApp que conviene saber:**
- Puedes escribir libremente durante **24 horas** después del último mensaje del cliente. Las respuestas automáticas siempre caen dentro de esa ventana.
- Pasado ese tiempo solo se permiten **plantillas aprobadas**. Se crean en el Administrador de WhatsApp y Sofía las muestra para enviarlas.

---

## 4. Facebook e Instagram (15 minutos)

### 4.1 Página de Facebook
1. **ID de la página.** En tu página → Información → Transparencia, o con la herramienta Graph API Explorer: `GET /me/accounts` → `FB_PAGE_ID`.
2. **Token de la página.**
   - En **Graph API Explorer**, usa el token del usuario del sistema (paso 3.2) y consulta `GET /{FB_PAGE_ID}?fields=access_token`.
   - Ese `access_token` es `FB_PAGE_TOKEN`.
3. Agrega `FB_PAGE_ID` y `FB_PAGE_TOKEN` al conector y vuelve a desplegar. En Sofía → Conexiones debe aparecer el nombre de tu página.
4. **Messenger en la bandeja:**
   - En tu app de Meta, agrega el producto **Messenger** y configura su webhook con la **misma URL y token**.
   - Suscribe tu página al campo **messages**.

### 4.2 Instagram
1. Tu cuenta de Instagram debe ser **profesional** (Empresa o Creador) y estar **vinculada a tu página** de Facebook (Instagram → Configuración → Cuenta → Compartir en otras apps, o desde la página: Configuración → Cuentas vinculadas).
2. El token del usuario del sistema necesita `instagram_basic` e `instagram_content_publish` (paso 3.2). Si lo creaste sin ellos, genera uno nuevo y vuelve a sacar `FB_PAGE_TOKEN`.
3. **ID de Instagram:** en Graph API Explorer, `GET /{FB_PAGE_ID}?fields=instagram_business_account` → el `id` es `IG_USER_ID`.
4. Agrega `IG_USER_ID` (y `PUBLIC_URL`, paso 2.6) al conector y vuelve a desplegar. En Sofía → Conexiones debe aparecer tu `@usuario`.

### 4.3 Publicar y programar
En Sofía: **Redes**.
- Escribe el texto (a mano o con IA), agrega una foto y elige **Facebook** y/o **Instagram**.
- **Publicar ahora** sale de inmediato.
- **Programar** guarda la publicación en tu servidor, que la publica a la hora elegida aunque la app esté cerrada. En Cloudflare puede tardar hasta 5 minutos.
- En **Programadas** ves el estado de cada una (programada, publicada o con error) y puedes cancelar las que no han salido.
- Instagram solo acepta publicaciones **con foto**, en formato entre 4:5 (vertical) y 1.91:1 (horizontal). Sofía la convierte a JPG y revisa el formato.
- **Anuncios pagados:** Sofía escribe el anuncio y te lleva al Administrador de anuncios. Crear campañas solo, desde Sofía, requiere el permiso `ads_management` aprobado por Meta.

---

## 5. IA (opcional, 5 minutos)

Todo lo anterior funciona sin IA. Con IA, Sofía redacta en tu estilo, personaliza plantillas por cliente, crea clientes desde chats exportados y suma un tercer lector para INE difíciles.

1. Entra a **https://console.anthropic.com** y crea tu cuenta.
2. **Billing**: carga saldo, por ejemplo 10 USD.
3. **API keys → Create key** y copia la llave (empieza con `sk-ant-`).
4. En Sofía: **Más → Conexiones → Inteligencia artificial**. Pega la llave, elige la calidad y toca **Conectar y probar**. Debe aparecer **● Conectada**.

Calidades: **Máxima (Opus 5.5)**, **Equilibrado (Sonnet 5.5)** y **Rápido y económico (Haiku 5.5)**. Puedes cambiarla cuando quieras.

Costo aproximado con calidad máxima:
- Leer una INE (frente y reverso): unos 4 o 5 centavos de dólar.
- Redactar un mensaje de WhatsApp: 1 o 2 centavos.
- Con Haiku cuesta unas 40 veces menos.

La llave se guarda solo en ese teléfono. No viaja a respaldos ni al servidor.

---

## Qué está probado y cómo confirmarlo en tus cuentas

- La app, el conector y el script de Google pasan pruebas automáticas contra **simulaciones** de las APIs de Meta y Google: `scripts/prueba-e2e.mjs`, `tests/31`, `tests/34`.
- La confirmación real es en tus cuentas. Cada conexión tiene su botón:
  - **Google:** *Conectar y probar* y *Probar recordatorio*, más la lista de pruebas de [`servidor/google/LEEME.md`](servidor/google/LEEME.md).
  - **WhatsApp:** *Enviar prueba*. Luego escríbele a tu número desde otro celular: debe contestar la bienvenida y aparecer en **Prospectos**.
  - **Facebook e Instagram:** *Conectar y probar*, y después una publicación programada para dentro de 10 minutos.

---

## Seguridad

- Los tokens de Meta viven **solo en el conector** (secretos de Cloudflare o tu `.env`), nunca en los teléfonos.
- El conector **verifica la firma** de cada aviso de Meta (`META_APP_SECRET`). Rechaza mensajes falsificados.
- La app habla con el conector usando la clave `SOFIA_TOKEN`, y con Google usando la clave `TOKEN` de tu script. Quien tenga la dirección **y** la clave de Google puede enviar correos desde tu Gmail: no la compartas.
- Las fotos de INE se guardan en el teléfono. Solo salen para leerlas: a tu Google (el script borra el archivo temporal) o a la IA, si la conectas. La lectura con IA se puede apagar en Conexiones.
