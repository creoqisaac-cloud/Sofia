# Sofía en tu cuenta de Google (gratis, sin tarjeta)

Un script de Google Apps Script que corre **en tu propia cuenta de Google**. No necesitas servidor, tarjeta ni IA.

| Función | Qué hace |
|---|---|
| **Respaldo** | Guarda los datos de la app en tu Drive (`sofia-datos.json` y una copia anterior). |
| **Correo** | Envía desde tu Gmail con adjuntos (placas). Etiqueta los hilos **Sofía**, lee las respuestas y sugiere el estado por palabras clave: *falta documento*, *pago*, *placas listas* o *en trámite*. |
| **Seguimiento automático** | Si la gestoría no contesta en N días, manda **un** correo de seguimiento en el mismo hilo por periodo (máximo 3 por caso). |
| **Calendario** | Los recordatorios van al calendario **Sofía** con aviso, así suenan en el iPhone con Google Calendar. |
| **OCR** | Lee el texto de fotos (INE) con el OCR gratis de Google Drive. Las fotos no se quedan guardadas. |

Archivos: `sofia-google.gs` (el código) y `appsscript.json` (los permisos y la configuración).

## Instalación (10 minutos)

1. Entra a **https://script.google.com** con tu cuenta de Google → **Nuevo proyecto**. Ponle de nombre `Sofía`.
2. En `Código.gs` borra todo y pega el contenido de [`sofia-google.gs`](sofia-google.gs). Guarda (💾).
3. **Configuración del proyecto** (engrane, a la izquierda):
   1. Marca **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
   2. En **Propiedades de la secuencia de comandos** → **Agregar propiedad**: `TOKEN` = una clave larga que inventes (20 caracteres o más). Toca **Guardar propiedades**.
4. Vuelve al **Editor** y abre `appsscript.json`. Borra todo, pega el contenido de [`appsscript.json`](appsscript.json) y guarda.
5. Arriba elige la función **`instalar`** y toca **Ejecutar**:
   1. **Revisar permisos** → elige tu cuenta.
   2. En «Google no verificó esta app»: **Configuración avanzada** → **Ir a Sofía (no seguro)**. Es tu propio script.
   3. Marca **Seleccionar todo** y toca **Permitir**.
   4. Debe salir `Listo. Cuenta: …` en el registro.
6. **Implementar** → **Nueva implementación** → tipo (engrane) **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (no «Cualquier usuario con una Cuenta de Google»: con esa opción la app no puede conectarse)
   - Toca **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
   - Si tu cuenta es de empresa (Google Workspace) y no aparece «Cualquier usuario», tu administrador lo bloqueó: usa una cuenta personal de Gmail.
7. En Sofía: **Más → Conexiones → Google**. Pega la URL y la misma clave `TOKEN` y prueba la conexión. Debe mostrar tu correo y cuántos correos te quedan hoy.

**Recordatorios en iPhone:** instala la app **Google Calendar**, entra con la misma cuenta y permite las notificaciones. El calendario **Sofía** aparece solo.
- Si prefieres el Calendario del iPhone, agrega tu cuenta en *Ajustes → Calendario → Cuentas*.
- Si «Sofía» no aparece ahí, actívalo en https://calendar.google.com/calendar/syncselect.

**Cambiar el código después:** pega el nuevo `sofia-google.gs` → **Implementar → Gestionar implementaciones** → lápiz → Versión: **Nueva versión** → **Implementar**. La URL no cambia.

**Si ya tenías instalado el script anterior (solo respaldo, `google-apps-script.gs`):**
- Este script lo reemplaza y responde igual a la app.
- Usa los mismos archivos de Drive.
- Haz los pasos 2, 3.1, 4 y 5 (los permisos nuevos se aprueban al ejecutar `instalar`) y crea una **Nueva versión** de tu implementación.

## Seguridad

- Quien tenga la URL **y** la clave puede enviar correos desde tu Gmail. No compartas la clave.
- Para cambiarla, edita `TOKEN` en las propiedades del script y ponla igual en Sofía.
- La clave se compara en tiempo constante y nunca se devuelve en una respuesta.
- Solo usa archivos y el calendario **Sofía** que sean tuyos: si alguien te comparte un `sofia-datos.json` o un calendario con ese nombre, se ignora.
- Límites por petición:
  - 45 MB en total.
  - Adjuntos: hasta 20 archivos y 18 MB por correo.
  - OCR: hasta 6 fotos de máximo 8 MB.
- El script solo pide los permisos que usa: Gmail, enviar correo, Drive, Documentos (para leer el OCR), Calendar, activadores y tu dirección de correo.
- El OCR crea un Google Doc temporal, lo lee y lo borra. Intenta borrarlo también de la papelera; si Google no lo permite, la papelera se vacía sola a los 30 días.

## Límites de Google (cuenta gratuita, aproximados)

| Recurso | Límite |
|---|---|
| Destinatarios de correo | 100 al día |
| Documentos creados (lecturas OCR) | 250 al día |
| Tiempo de activadores | 90 minutos al día; el agente usa segundos por hora |

## Qué está probado y qué falta probar

**Probado sin cuenta de Google** (`npx vitest run tests/34-google-apps-script.test.ts`): no existe un emulador de Apps Script. La prueba carga este `.gs` en Node con dobles mínimos de GmailApp, MailApp, DriveApp, Drive, DocumentApp, CalendarApp y los demás servicios. Atrapa errores de sintaxis y de lógica en:
- **Respaldo:** el mismo protocolo de la app (`GET ?token=…[&meta=1]`, `POST { token, backup }`), la copia anterior y el candado.
- **Clave:** se rechaza si es incorrecta.
- **Correo:** envío con adjuntos y etiqueta, revisión de respuestas sin el texto citado y clasificación por palabras clave.
- **Seguimiento automático:** uno por periodo, máximo 3, nunca si ya contestaron o avisaron *placas listas*. Tampoco se repite si Gmail falla o si las propiedades del script se llenan.
- **Palabras clave:** negaciones y futuro («aún no están listas», «estarán listas el viernes») no cuentan como *placas listas*.
- **Lo ajeno se ignora:** un `sofia-datos.json` o un calendario **Sofía** que otra persona te comparta.
- **Calendario y OCR:** eventos con avisos y OCR sin dejar archivos.
- **APIs de Google:** el script solo usa métodos revisados contra la documentación de Apps Script.

La prueba también conecta el cliente de la app (`js/google.js`) con el script.

**La prueba definitiva es en tu cuenta real.** Haz esta lista una vez:
1. En el navegador abre `TU_URL?token=TU_CLAVE&meta=1`. Debe responder `{"ok":true,"updatedAt":…}`. (Esa dirección lleva tu clave: no la compartas ni le tomes captura.)
2. **Correo y adjuntos:** desde Sofía manda un correo de placas **a otro correo tuyo** con un adjunto.
   - Debe llegar con el adjunto.
   - En Gmail, el hilo debe tener la etiqueta **Sofía**.
3. **Respuestas:** contesta desde ese otro correo «Le falta la CURP». En Sofía, al revisar respuestas, debe salir **Falta documento**.
4. **Seguimiento:** pon el seguimiento automático a **1 día** y no contestes. Al día siguiente debe llegar **un solo** correo de seguimiento en el mismo hilo, y debe aparecer en la bitácora del estado.
   - Comprueba a quién llegó: es una respuesta a todos de tu último correo, y puede que también te llegue una copia a ti.
   - En **Ejecuciones** del editor ves cada vuelta del agente.
5. **Calendario:** crea un recordatorio para dentro de 15 minutos. Debe aparecer en el calendario **Sofía** y sonar en el iPhone 5 minutos antes.
6. **OCR:** lee una foto de INE con «Google».
   - Debe salir el texto.
   - En Drive (y en la papelera) no debe quedar ningún archivo `sofia-ocr-…`.
