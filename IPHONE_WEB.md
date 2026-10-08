# Sofía en iPhone (app web)

**Servidor piloto:** https://sofia-app-6qo6.onrender.com/iphone

## Instalar sin App Store

1. Abre el enlace en **Safari** de iPhone y autentícate con las credenciales de Sofía.
2. En Safari toca **Compartir → Agregar a pantalla de inicio** y activa **Abrir como app**.
3. Usa el icono Sofía. El manifest arranca en `/?modo=tablet` para mostrar la navegación simplificada.

## Herramientas

- **Correos:** `/correos` lista borradores y envíos recientes, `/settings/email` configura cuenta SMTP. En `/plates` se preparan correos con adjuntos, que se envían solo después de revisar y confirmar.
- **INE:** cliente → Documentos → tipo INE → Tomar foto. En la app web iOS no hay ML Kit; en Fotos utiliza **Texto en Vivo** para copiar el texto a Sofía, selecciona una sola foto JPG/PNG/HEIC y entra a revisar todos los campos OBSERVADOS. Sin Texto en Vivo, la captura es manual. Una foto HEIC se convierte localmente a JPEG, si el navegador puede abrirla. Desde Solicitud → «Llenar con foto o escaneo de la INE» se regresa al formulario tras la revisión.
- **Recordatorios:** `/settings/reminders`. Crear un evento, descargar el `.ics` desde el aviso y **confirmar la importación en el Calendario del iPhone**. Sin importarlo, Sofía en Safari no activará una alarma. No hay push web automático por ahora.
- **WhatsApp:** `/whatsapp`. Prepara texto de seguimiento, citas, solicitud de documentos, placas y entrega; se abre `wa.me` con el texto y el usuario pulsa Enviar en WhatsApp. No hay integración con WhatsApp Cloud API ni lectura de respuestas.

## Límites importantes antes de producción

- **No cargar INEs reales ni datos sensibles** hasta conectar PostgreSQL persistente y Supabase Storage privado; el servidor actual usa PGlite y almacenamiento temporal en Render.
- Supabase está creado y las 53 tablas del esquema `public` tienen RLS activado, pero **Render NO está conectado a esa base**. No hay políticas de acceso por usuario listas.
- Las claves SMTP deben guardarse exclusivamente en el servidor y pueden perderse en Render temporal. No configurar cuentas laborales reales hasta cerrar persistencia.
- El servidor gratuito de Render ha mostrado reinicios por memoria; validar estabilidad y despliegue antes de usar la versión en operación diaria.
- Apple permite **Web Push** en apps web instaladas desde iOS 16.4, pero requiere service worker, VAPID, base persistente de suscripciones y un envío programado. **No está implementado** en esta fase.
- Todas las herramientas solicitan confirmación humana antes de enviar correos o WhatsApp. El contenido obtenido de la INE también requiere revisión.

## Comprobaciones

- Next.js compila las rutas `/iphone`, `/correos`, `/whatsapp`, `/api/reminders/calendar`.
- Prueba manual pendiente: abrir desde iPhone real, agregar a inicio, copiar Texto en Vivo desde Fotos, importar .ics en Calendario.
