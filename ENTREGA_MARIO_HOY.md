# Entrega rápida a Mario · Sofía

**Fecha de preparación:** 23 de octubre de 2026  
**Versión:** piloto supervisado (no autopiloto de WhatsApp)

## Qué puede usar Mario desde el teléfono

Acceder a **`/piloto`** de Sofía (requiere el mismo acceso del sistema).
1. Capturar prospecto desde un mensaje entrante de WhatsApp/Facebook: nombre, celular, modelo Honda.
2. Seleccionar día, hora y visita o prueba de manejo.
3. Guardar en CRM y agenda interna en una sola acción. El sistema reutiliza clientes por teléfono, evita duplicados exactos y rechaza cruces de 45 minutos de citas internas del mismo asesor.
4. Abrir el mensaje de WhatsApp, revisarlo y enviarlo manualmente al cliente.
5. Cuando el cliente **responda y Mario compruebe disponibilidad real de la agencia**, marcar la cita como **Confirmada** en Sofía y usar el enlace para enviar confirmación formal.
6. Consultar la agenda y los estados en la misma pantalla.

### Texto de WhatsApp antes de confirmar

«Hola [nombre], soy Mario de Honda Valle Oriente. Ya tengo anotada tu solicitud para tu visita / prueba de manejo de la Honda [modelo] el [fecha/hora]. ¿Me confirmas si te queda bien? Con tu respuesta dejamos la cita confirmada.»

### Texto de WhatsApp cuando Mario ha confirmado

«Hola [nombre], soy Mario de Honda Valle Oriente. Te confirmo tu visita / prueba de manejo para el [fecha/hora] para revisar la Honda [modelo]. ¡Aquí te espero! Ubicación: https://maps.app.goo.gl/dN8J4bXSwbiFPyvU9?g_st=ic»

**Importante:** Sofía no envía estos mensajes hasta que Mario presione Enviar dentro de WhatsApp.

## Lo que NO hay que anunciar como terminado

- No recibe ni responde automáticamente todos los chats de WhatsApp todavía: requiere la cuenta administradora, el permiso Meta o integración autorizada BIKY y despliegue.
- No reserva huecos automáticamente dentro de BIKY ni Google Calendar.
- La detección de cruces mira la base local de Sofía, **no es garantía de que BIKY o la agencia tengan ese horario libre**.
- El asistente LLM DEMO contiene precios ficticios y no debe enviarlos a clientes.
- No se ha probado en producción con el teléfono corporativo y credenciales reales.

## Cómo publicarlo en el servidor actual

1. Revisar que GitHub Actions haya completado **typecheck, pruebas y build** sobre la PR #1.
2. Confirmar si la agencia usa BIKY.ai y ya tiene conectado WhatsApp. No conectar dos bots al mismo número.
3. Desplegar la rama `feature/whatsapp-cloud-mario` en un entorno de pruebas o integrar los cambios aprobados en la rama que usa Render (`claude/laughing-sagan-hbxj3y`).
4. Asegurarse de tener la base PostgreSQL persistente y ejecutar migración `0005_whatsapp_cloud` (configuración `SOFIA_AUTO_MIGRATE=true` o `npm run db:migrate`).
5. Mantener `SOFIA_WHATSAPP_AUTOREPLY=false` hasta autorizar y validar el canal.
6. Abrir `https://TU_DOMINIO/piloto` con las credenciales existentes de Sofía.
7. Hacer una cita de prueba con datos autorizados, abrir WhatsApp y comprobar que no se envía automáticamente.

## Demostración para Mario (2 minutos)

- Abre Sofía → **Piloto Mario**.
- Captura un prospecto de prueba, modelo Honda CR-V, fecha/hora disponibles.
- Guarda, muestra la ficha y el botón **Abrir confirmación en WhatsApp**.
- Enseña el estado «Por confirmar» y el botón **Confirmada**.
- Abre la agenda, destaca el registro y el historial.
- Di explícitamente: «Este es el modo supervisado operativo; el bot 24/7 se conecta cuando tengamos autorización del WhatsApp y del calendario».

## Próxima fase de producción

Integrar eventos y citas con BIKY si la agencia ya lo utiliza: sincronización bidireccional, reserva con ID de proveedor, confirmación real, cancelaciones y recordatorios. Si no permite API autorizada, usar WhatsApp Cloud API oficial y un calendario con permisos de Mario.
