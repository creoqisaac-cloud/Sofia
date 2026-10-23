# Integración de Sofía con BIKY.ai / Keybe (pendiente de confirmar plataforma)

> **Hipótesis, no hecho confirmado:** la herramienta llamada "Bivky" podría ser **BIKY.ai**. Antes de activar la Cloud API directa, confirmar qué proveedor es, qué WhatsApp gestiona y quién tiene acceso administrativo.

## Evidencia de la plataforma

- [API para desarrolladores de Keybe/BIKY](https://keybe.ai/en/developers): API de plataforma para contactos, embudos, tareas, actividades y Smart Chat; las claves por empresa las entrega Keybe.
- [Documentación del calendario](https://docs.biky.app/calendar/): citas presenciales, confirmadas, reagendadas, asistencia y ausencias.
- [Disponibilidad y configuración](https://docs.biky.app/calendar/disponibilidad): horarios de asesores, bloqueos y calendarios Google/Outlook.
- [Proceso de agendamiento](https://docs.biky.app/calendar/agendar): selección de asesor, sede, huecos reales, contacto y confirmación.

**No se identificó en documentación pública un endpoint autorizado para crear/reservar citas programáticamente. No inventar rutas ni considerar posible integración hasta recibir el protocolo oficial.**

## Ruta preferente SI la agencia ya tiene BIKY conectado al WhatsApp de Mario

1. Mantener a **BIKY como propietario de la conexión existente a WhatsApp**. No migrar ni conectar el mismo número desde otra app sin confirmar compatibilidad contractual y técnica.
2. Verificar permisos: Mario, administrador de agencia y proveedor BIKY; obtener en servidor las claves institucionales y documentación oficial de Platform API, eventos y calendario.
3. Mapear registro y sincronización:
   - **Identidad:** BIKY Contact ID ↔ Sofía `customers.id` y teléfono normalizado, siempre con workspace.
   - **Conversaciones:** Smart Chat ↔ Sofía `conversations` + `messages`; eventos inbound con deduplicación por ID de proveedor.
   - **Control humano:** cuando Mario toma el hilo, suspender respuesta automática, independientemente del estado de la IA.
   - **Citas:** Calendar Booking ID ↔ Sofía `appointments.id`; fecha exacta con zona horaria `America/Monterrey`, asesor, sede, tipo (visita/prueba de manejo), estado y posible calendar event ID.
4. El **calendario de BIKY es la fuente de verdad**: consultar huecos, reservar a través del mecanismo oficial y esperar confirmación del proveedor antes de responder “tu cita está confirmada”. Una propuesta `requestedWindow` de Sofía no es cita.
5. Asegurar sincronización bidireccional e idempotente para reagendar, cancelar y marcar asistencia/no asistencia. Aplicar reintentos y conciliación.
6. Conectar alertas a Mario con nombre, teléfono, Honda solicitado, día/hora confirmados, sede y conversación, sin filtrar PII en logs.
7. Probar en sandbox con número/test account autorizados, sin promocionales DEMO ni mensajes masivos.

## Alternativa SI BIKY NO es el propietario del canal

La rama `feature/whatsapp-cloud-mario` trae conector oficial directo a Meta Cloud API, apagado por defecto. Para agendar citas reales habrá que conectar igualmente un calendario autoritativo (BIKY, si admite API, o Google/Outlook con permisos del asesor). Nunca habilitar dos automatizaciones que respondan a un mismo mensaje.

## Contrato previsto de reserva (interno, independiente del proveedor)

```ts
interface AppointmentBookingProvider {
  findAvailability(input: {
    advisorId: string; locationId: string; fromISO: string; toISO: string;
    durationMinutes: number; timeZone: "America/Monterrey";
  }): Promise<Array<{ startISO: string; endISO: string; providerSlotId?: string }>>;
  reserve(input: {
    providerSlotId?: string; advisorId: string; customerId: string;
    startISO: string; endISO: string; locationId: string;
    idempotencyKey: string;
  }): Promise<{ providerBookingId: string; confirmedStartISO: string; confirmedEndISO: string; status: "confirmed" | "pending" }>;
  cancel(input: { providerBookingId: string; idempotencyKey: string }): Promise<void>;
}
```

Este contrato es una **propuesta de arquitectura local**, no una descripción de endpoints BIKY existentes. Su implementación concreta depende de la documentación y permisos que entregue Keybe.
