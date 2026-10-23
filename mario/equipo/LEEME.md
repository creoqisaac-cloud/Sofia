# Sofía Equipo · Cartera compartida real

**Abrir:** https://creoqisaac-cloud.github.io/Sofia/mario/equipo/

La versión **/mario/equipo/** es diferente de **/mario/**:
- **/mario/equipo/**: sincronización real de clientes/notas/citas/seguimientos entre dos cuentas privadas, Supabase PostgreSQL, internet necesario, protección RLS por equipo. Este es el enlace para Mario y para el administrador.
- **/mario/**: versión independiente que funciona sin internet y solo guarda datos en ese teléfono. **No se sincroniza**.

## Activar cada cuenta
1. Abre **/mario/equipo/** en Safari (iPhone) o Chrome (Samsung) o navegador de escritorio.
2. Ingresa correo, una contraseña única de por lo menos 12 caracteres y el **código personal de invitación** recibido privadamente del administrador.
3. Pulsa **Crear mi cuenta por primera vez**. El registro utiliza una función protegida y un código de un solo uso; no depende de un correo de confirmación.
4. Después pulsa **Entrar a mi equipo** con el mismo correo/contraseña.
5. Ya puedes registrar clientes y notas, crear citas y seguimientos. La información se guarda en Postgres y se consulta desde el otro dispositivo autorizado.
6. Usa **Más > Descargar copia** para un respaldo privado con periodicidad. Un respaldo JSON exportado desde la versión local anterior se puede importar en la compartida usando **Más > Restaurar copia**; la importación fusiona registros, no borra los existentes.

**No pegues invitaciones, contraseñas, datos de clientes o claves de Meta en un repositorio público.** La clave publicable de Supabase en JavaScript no es una credencial privada, las reglas PostgreSQL RLS resguardan la información.

## Verificación técnica
- Proyecto Supabase **Sofia** activo, 8 tablas nuevas de equipo con RLS aplicado.
- Inserciones anónimas de clientes rechazadas HTTP 401; consultas anónimas devolvieron `[]`.
- Edge Function `sofia-mobile-register` activa; solicitudes inválidas recibieron HTTP 400/403.
- Chromium de prueba: pantalla de acceso y validación de sintaxis aprobadas.
- Navegador automatizado con **red simulada**: validó sesión, pertenencia a equipo, escritura de un cliente, evento, y lectura tras recarga. **Esto no es todavía una prueba con las dos cuentas reales.**
- No se ha conectado WhatsApp Cloud API ni ninguna cuenta del cliente.

## Límites y protección
- La app compartida **necesita internet**; no guarda cambios offline. Si no tienes red, espera antes de añadir clientes.
- Acceso de propietario y asesor restringido al mismo equipo; código de invitación caduca y se usa solo una vez.
- El enlace por sí mismo no concede acceso. Los usuarios deben autenticarse e inscribirse por invitación.
- No subas INE, RFC, fotos ni datos financieros sensibles. Recomendada MFA/gestión de acceso para ampliar su uso.
- La app móvil actual no tiene historial real de WhatsApp; no creer que abrir un chat via wa.me significa tener el número integrado.
