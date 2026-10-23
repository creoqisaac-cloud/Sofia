# Sofía Móvil | Mario Abarca

**Instalar:** https://creoqisaac-cloud.github.io/Sofia/mario/

App instalable PWA de registro privado para iPhone y Android, con interfaz móvil y tablet. Código estático publicado en `gh-pages/mario/`. **No contiene usuarios, datos de clientes ni credenciales.**

## Qué funciona
- Crear, editar y buscar clientes: nombre, teléfono, Honda de interés, clasificación comercial, origen.
- Abrir ficha por cliente, agregar notas privadas, registrar citas y seguimientos.
- Agenda mensual, prevención de cruces de citas dentro de 45 min, marcar confirmada por Mario o realizada.
- Seguimientos, vencidos, reportes de etapas, historial de actividad.
- Exportar clientes a CSV, descargar respaldo JSON e importar/restaurar JSON, exportar calendario (.ics) con recordatorios.
- Persistencia IndexedDB y caché de la interfaz mediante Service Worker para uso sin conexión.
- Abrir manualmente WhatsApp desde el teléfono registrado, sin simular sincronización.

## Pruebas ejecutadas el 23/oct/2026
- Chromium móvil (390 px) y tablet (800 px), sin desbordamientos horizontales.
- Registro de cliente, nota, cita, seguimiento; recarga; funcionamiento offline. Todos pasaron en la URL publicada.
- Rechazo de teléfono duplicado, rechazo de cita empalmada, rechazo de respaldo inválido, restauración sin pérdida de registros. Todos pasaron.
- 0 errores JavaScript durante esas pruebas.
- No se disponía de Safari/iPhone físico para probar la instalación en hardware de Apple.

## Limitaciones importantes
- Esta PWA **no es un APK ni una app nativa de App Store**; se instala desde Safari/Chrome como app web.
- Los datos quedan **solo en el dispositivo**, no se sincronizan con la base SQLite de Pop!_OS o con otros teléfonos.
- GitHub Pages aloja únicamente archivos estáticos de la interfaz. No se suben datos de clientes a GitHub.
- No hay autenticación de usuario dentro de la PWA, ni cifrado adicional de la base local. Protege el teléfono, evita datos financieros o documentos sensibles y haz respaldos privados.
- Los avisos de seguimientos se muestran cuando abres la app. Para recordatorios con la app cerrada debes importar el archivo .ics al Calendario del teléfono.
- WhatsApp Cloud API aún **no está conectado**. Abrir un chat con `wa.me` NO es recibir mensajes automáticamente. Para el bot real se requieren permisos administrativos y API de Meta, webhook HTTPS, proveedor de IA y eventualmente sincronización segura con la base de Pop!_OS.
- No trates una cita registrada manualmente como reserva confirmada automáticamente por la agencia.

## Pasarla a Mario
1. Envía el enlace HTTPS.
2. Mario lo abre con Safari (iPhone) o Chrome (Samsung) y elige «Agregar a pantalla de inicio» o «Instalar aplicación».
3. Mario registra un cliente y una nota y verifica que sigan ahí al cerrar y reabrir el icono.
4. Al terminar el día, descarga su copia en **Más > Descargar copia** y guárdala de forma privada.
