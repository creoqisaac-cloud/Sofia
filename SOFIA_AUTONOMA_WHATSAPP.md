# Sofía: WhatsApp autónomo + citas reales + aviso privado a Mario

## Qué quiere Mario (no borradores)

1. Un cliente escribe por el **WhatsApp Business ya autorizado**.
2. Sofía responde automáticamente, de manera natural, en nombre del equipo de Mario.
3. Conoce el modelo Honda deseado, ofrece los **horarios disponibles del calendario real**, confirma la elección y realiza la reserva.
4. El cliente recibe la confirmación de la cita.
5. Mario recibe por **WhatsApp**, automáticamente, una notificación con cliente, modelo, fecha, hora y celular: «Hola papi 👋 Ya tenemos cita confirmada...».
6. Si Mario interviene, la IA deja de contestar hasta devolverle el control.

**No basta escribir al CRM un campo `requestedWindow`: es una propuesta, no una cita.**

## La vía corta cuando la agencia YA tiene BIKY.ai conectado

La [documentación de BIKY](https://docs.biky.app/biky/habilidades) identifica una habilidad nativa **Agendamiento**. En cuentas automotrices tiene configuración para **citas de autos nuevos**. Su [Calendario](https://docs.biky.app/calendar/) revisa disponibilidad real de asesores (horario, bloqueos y Google/Outlook) y reserva reuniones desde la propia IA. [Flows](https://docs.biky.app/flows/nodos) puede ejecutar solicitudes HTTP y enviar plantillas aprobadas de WhatsApp.

1. Administrador de la cuenta Keybe/BIKY: **Configuración > Canales > WhatsApp**. Verificar cuál número ya está conectado, sin migrarlo a otra app.
2. **Biky admin > Apariencia/Personalidad**: hacer que el agente se presente como **Sofía, asistente de Mario Abarca de Honda Valle Oriente**. No fingir ser Mario.
3. **Biky admin > Habilidades > Agendamiento**: activar/configurar **Autos nuevos** y reuniones presenciales de Honda Valle Oriente. En cuentas automotrices Keybe puede bloquear cambios; solicitar configuración al administrador/proveedor si está bloqueado.
4. **Calendario > Asesores / Mi horario / Bloqueos / Calendarios**: asignar a Mario como asesor, zona horaria de Monterrey, horarios reales, ubicación Honda Valle Oriente y Google/Outlook si la agencia lo utiliza.
5. Probar dos conversaciones desde un número autorizado: «Quiero una CR-V, ¿puedo ir mañana?» y «Tengo tiempo a las 5». Confirmar en el calendario BIKY que se crea una cita con fecha, asesor y contacto.
6. Para el aviso inmediato a Mario, confirmar con Keybe **qué evento oficial de reserva confirmada expone Flows**. La documentación pública menciona recordatorios de agendamiento y cambios de SalesCard, pero NO prueba un disparador directo de "cita creada" ni garantiza que Flows entregue el ID de reserva. **No disparar avisos solo por mover la SalesCard a Agendado.**
7. Si el evento confirmado y su ID son accesibles, en **Flows > Nodo HTTP** mapear a `POST https://TU_DOMINIO/api/webhooks/biky-booking`, con header `Authorization: Bearer [secreto]` y el siguiente contrato JSON. El backend verifica token, guarda cita confirmada e inicia el aviso una sola vez.
8. Como ruta de notificación, priorizar **otro Flow autorizado de BIKY** para contactar al WhatsApp de Mario, o usar un sender autorizado en Meta con una plantilla aprobada. **No tomar control directo desde Meta de la línea que administra BIKY.** La recepción HTTP del Flow es aceptación del proveedor, no prueba de que WhatsApp haya entregado el mensaje.

```json
{
  "booking_id": "ID_REAL_CONFIRMADO_DEL_CALENDARIO",
  "status": "confirmed",
  "customer_name": "Roberto",
  "customer_phone": "8112345678",
  "model": "CR-V",
  "starts_at": "2026-10-24T17:00:00-06:00",
  "advisor": "Mario Abarca",
  "location": "Honda Valle Oriente",
  "kind": "test_drive"
}
```

Es el **contrato de Sofía**, no un endpoint o cuerpo que la API de BIKY garantice. Solo debe enviarse después de comprobar la reserva BIKY y tener su ID real.

## Notificación automática

El backend nuevo `src/server/biky/mario-notify.ts` elige automáticamente uno de dos transportes:

- **Biky Flow**: `SOFIA_MARIO_NOTIFY_FLOW_URL` + token, envía JSON de aviso al webhook privado que el administrador configure. Ese Flow debe enviar la plantilla de WhatsApp al contacto Mario. Revisar el mapeo, destino y permisos del Flow.
- **Meta WhatsApp template**: `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` + `SOFIA_MARIO_WHATSAPP_TO` + `SOFIA_MARIO_TEMPLATE` aprobada con 5 parámetros (cliente, fecha, hora, modelo y celular). Debe ser un emisor empresarial autorizado y Mario haber aceptado las notificaciones.

WhatsApp restringe mensajes proactivos fuera de la ventana de servicio de 24 horas: el aviso se envía mediante plantilla aprobada, no mediante texto libre. Al aceptar el envío el estado es `submitted`; la entrega efectiva se verifica luego mediante el proveedor.

## Seguridad y pruebas

- Webhook de BIKY con token privado, tamaño máximo de cuerpo y datos estrictamente validados.
- Solo `status=confirmed`, ID real de reserva, asesor Mario Abarca, sede Honda Valle Oriente y hora ISO con zona. Nunca trata una propuesta como confirmación.
- Persistencia atómica de `biky_booking_receipts` con unicidad por ID de reserva y una cita local `appointments` ya confirmada.
- Reintentos del mismo evento no crean otra cita y no vuelven a disparar avisos una vez que el proveedor aceptó el primero.
- Fallos de envío quedan con estado `failed` y pueden reintentarse **reentregando el mismo evento**.
- Si Meta/Flows acepta el envío pero el servidor pierde conexión antes de guardar el acuse, puede producirse un aviso duplicado; en producción se requiere conciliación de entregas para garantía más estricta.
- Variables secretas en servidor, no publicarlas en el repositorio.
- **Esta rama NO está desplegada** y NO está conectada a las credenciales de BIKY ni a la línea WhatsApp real. Las pruebas automatizadas no equivalen a una entrega de WhatsApp confirmada.

## Dependencias que faltan para activar al cliente real

1. Confirmar si «Bivky» es **BIKY.ai de Keybe** y obtener acceso autorizado al administrador de la cuenta para configurar Habilidad Agendamiento, WhatsApp y Flows.
2. Confirmar qué evento de reserva y qué campos expone Keybe por API/Flows y hacer el mapeo.
3. Configurar un canal aprobado para notificaciones al WhatsApp de Mario.
4. Conectar PostgreSQL persistente, desplegar la rama y aplicar migraciones 0005/0006.
5. Prueba end-to-end con Roberto ficticio y teléfono autorizado: cliente escribe > Sofía responde > BIKY reserva > Sofia recibe webhook > Mario recibe aviso.
