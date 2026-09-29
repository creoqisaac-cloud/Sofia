# Integración con Sale-U (preparación)

**Estado: pendiente de documentación oficial y credenciales de Sale-U.**

No encontré documentación pública verificable de una API de Sale-U, así que **no se asume ningún endpoint**. Sofía no hace scraping ni automatiza el portal.

Lo que ya existe en Sofía:

- La interfaz `CrmProvider` (`src/server/crm/provider.ts`), sin implementación todavía.
- Un lugar reservado para `SaleUProvider`.

Cuando Sale-U entregue su documentación, se implementa ese proveedor sin cambiar el resto de Sofía.

## Qué nos interesa LEER de Sale-U

| Dato | Uso en Sofía |
|---|---|
| ID del lead/cliente | Llave de enlace con el `customer_id` de Sofía |
| Nombre, teléfono, correo | Buscar y contactar sin volver a capturar |
| Vehículo de interés, origen del lead | Contexto de seguimiento |
| Asesor asignado | Filtrar solo los leads de Mario |
| Etapa/estatus del lead | Saber qué sigue |
| Citas y actividades registradas | Evitar duplicar citas y seguimientos |
| Número de cliente, pedido, factura (si Sale-U los maneja) | Conciliar con Ventas |

## Qué podríamos ESCRIBIR, solo si Sale-U lo permite y Mario lo autoriza

- Actividad: llamada realizada, cita agendada, cotización enviada, solicitud enviada.
- Cambio de etapa del lead.
- Siguiente contacto programado.

Los documentos personales (INE, comprobantes, solicitudes) no se suben automáticamente a Sale-U.

## Lo que hay que pedirle a Sale-U

1. **API:** documentación oficial (REST/GraphQL), URL base, límites de uso y ambiente de pruebas.
2. **Autenticación:** tipo (OAuth 2.0 / API key / token por usuario), alcance de permisos y cómo se revoca. Las credenciales van **solo en el servidor** de Sofía, nunca en la APK.
3. **IDs:** ID de lead/cliente estable, ID del asesor (Mario) e ID de la agencia/sucursal.
4. **Webhooks:** lead nuevo, lead actualizado, cita creada/cambiada, lead asignado. Hacen falta la firma de verificación y la política de reintentos.
5. **Lectura incremental:** endpoint de “cambios desde fecha X”, por si no hay webhooks.
6. **Legal:** aviso de privacidad y contrato de tratamiento de datos entre la agencia, Sale-U y Sofía.

## Mapeo propuesto: lead de Sale-U → cliente de Sofía

1. **Guardar el ID externo:** se agregará la tabla `external_links(customer_id, provider, external_id)`. No existe todavía; se crea cuando haya API.
2. **Emparejar un lead nuevo:**
   - buscar por `external_id`;
   - si no existe, por teléfono normalizado a 10 dígitos;
   - si hay más de un candidato, **Mario elige**; nunca se fusiona automáticamente.
3. **Registrar lo que llegue de Sale-U:** entra como **hecho observado** con fuente “Sale-U” (el mismo sistema de procedencia). Si contradice un dato confirmado, se genera un **conflicto** para que Mario decida.
4. **Sin IA en la sincronización:** es determinista y no llama a ningún modelo.
