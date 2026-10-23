# WhatsApp Cloud API para Sofía y Mario

Estado: **integración de canal preparada, pendiente de credenciales de Meta, migración y prueba end-to-end**. No es un bot desplegado ni una agenda con disponibilidad confirmada.

## Qué hace

- GET `/api/webhooks/whatsapp` responde el challenge de configuración de Meta.
- POST verifica HMAC-SHA256 con el **App Secret** antes de procesar cualquier dato.
- Procesa mensajes entrantes de texto del número conectado, registra cada `wamid` solo una vez y crea/reutiliza prospectos y conversaciones en el CRM.
- En modo Mario (o autorespuesta desactivada), solo guarda la conversación y marca al cliente como pendiente de atención.
- En modo Sofía, invoca el orquestador existente, guarda la respuesta y la envía por **WhatsApp Cloud API**.
- Guarda estado del intento y deduplica eventos repetidos para evitar doble procesamiento. Los mensajes no textuales y las notificaciones de entrega se ignoran en esta primera versión.

## Instalación

1. Contar con una aplicación Meta for Developers con WhatsApp Business Platform y un número autorizado. No se conecta mediante scraping, WhatsApp Web ni el dispositivo personal de Mario.
2. Desplegar la rama a un servidor HTTPS accesible y configurar la base PostgreSQL persistente (por ejemplo, Supabase); no usar PGlite en un despliegue con varias réplicas.
3. Ejecutar `npm run db:migrate` con `DATABASE_URL` del proyecto. La migración `0005_whatsapp_cloud.sql` agrega el registro único de eventos y un índice de deduplicación.
4. Configurar en los secretos del servidor, **nunca** en el navegador o GitHub:

   - `WHATSAPP_VERIFY_TOKEN`: cadena aleatoria privada elegida para la verificación GET.
   - `WHATSAPP_APP_SECRET`: secreto de la app Meta, para validar la firma del POST.
   - `WHATSAPP_PHONE_NUMBER_ID`: ID del número Cloud API (no el número telefónico).
   - `WHATSAPP_ACCESS_TOKEN`: token de acceso de sistema con permisos apropiados.
   - `WHATSAPP_GRAPH_VERSION`: versión Graph API (predeterminada `v26.0`, revisar vigencia en Meta).
   - `SOFIA_WHATSAPP_AUTOREPLY`: por defecto `false`; activar `true` **solo tras pruebas** con un proveedor de IA real y conocimiento comercial vigente.

5. En Meta, registrar `https://TU_DOMINIO/api/webhooks/whatsapp` y el mismo `WHATSAPP_VERIFY_TOKEN`, luego suscribir el campo `messages`.
6. Enviar un mensaje entrante desde un teléfono de pruebas autorizado y comprobar CRM, modo Mario/Sofía, envío y eventos duplicados.

## Seguridad y limitaciones

- Solo se contestan conversaciones **iniciadas por el cliente** dentro de la ventana de atención; para contacto proactivo o una conversación fuera de las 24 horas, Meta requiere plantillas aprobadas (no implementadas aquí).
- No activar el motor DEMO con clientes reales: incluye datos comerciales ficticios. El puente no envía respuestas DEMO automáticamente.
- Los webhooks pueden reintentarse; el ID entrante se deduplica en la base. Una interrupción entre el envío aceptado por Meta y el registro de éxito puede provocar un reenvío: se requiere conciliación de entregas para garantías más estrictas.
- Este cambio **no confirma citas reales automáticamente**: actualmente el orquestador registra `requestedWindow`, pero no verifica disponibilidad ni asigna `scheduledAt`. Debemos integrar una fuente real de horarios (Google Calendar o Bivky, si este último tiene API autorizada), agregar reserva atómica y confirmación antes de indicar al cliente que su cita está confirmada.
- No hay integración Bivky todavía. Hace falta documentación técnica, permisos y credenciales institucionales.
- Para producción hay que añadir alertas operativas sobre errores de salida y soporte de medios/plantillas.
