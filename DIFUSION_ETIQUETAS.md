# Difusión por etiquetas: integración pendiente
La rama local existente usa whatsapp-web.js 1.34.8 y conserva un modo Solo mi WhatsApp. No se debe desactivar ese modo para probar campañas.
## Requisitos
- Importar las etiquetas existentes exclusivamente mediante una interfaz autorizada, sin reclasificar ni exigir guardar contactos en el teléfono.
- Mantener la correspondencia etiqueta/destinatario y deduplicar números.
- No considerar la etiqueta ni una conversación previa como consentimiento de marketing.
- Vista previa de campaña: etiqueta, texto, destinatarios elegibles y excluidos; confirmación explícita antes de enviar.
- Envío mediante WhatsApp Business Platform con plantilla de marketing aprobada cuando corresponda; registrar estado, bajas y errores, sin reintentar bajas.
- No enviar mediante el dispositivo vinculado no oficial ni alterar el modo de prueba.
- La integración oficial actual debe validarse respecto a la disponibilidad de importación de etiquetas; si no la ofrece, informar el bloqueo y aceptar únicamente una exportación autorizada que conserve la segmentación.
## Criterios de aceptación
Prueba con datos sintéticos, luego con un destinatario propio autorizado; no enviar a clientes reales hasta confirmar lista, consentimiento y canal oficial. Los créditos comprados en la app no se presuponen transferibles.
