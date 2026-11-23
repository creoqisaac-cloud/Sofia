# Sofía con WhatsApp Web

Un VPS Linux con Docker Compose ejecuta la web de Sofía, su motor de ventas y un dispositivo vinculado con Chromium. Una sola instancia conserva sesión, conversaciones, citas e inventario en el volumen `datos`. El VPS tiene su propia base. La clave y los datos guardados en Cloudflare se administran por separado. El motor de reglas funciona sin una clave de IA. Para usar Anthropic, configura la clave del servidor desde Sofía.

Desde un checkout de la rama `claude/focused-gauss-q4hxvr` en el VPS:

```sh
cd whatsapp-web
umask 077
# En la primera instalación, crear .env si todavía no existe.
test -f .env || echo "SOFIA_TOKEN=$(openssl rand -hex 32)" > .env
# Para el piloto agrega SOFIA_PRUEBA_NUMERO a .env con el número del
# remitente de prueba (código de país y dígitos tal como los ve WhatsApp).
docker compose up -d --build
```

Desde tu computadora abre `ssh -L 8080:127.0.0.1:8080 usuario@servidor`. Entra a **http://localhost:8080/vincular** con el usuario **sofia** y la clave SOFIA_TOKEN del VPS. En WhatsApp Business abre **Dispositivos vinculados → Vincular un dispositivo** y escanea el QR. Puedes cerrar el túnel después de vincular.

Para atender desde el iPhone o la tablet, publica el puerto local 8080 con un proxy HTTPS de tu dominio. En **Más → Conexiones → Servidor** guarda esa URL y la misma clave. Abre **WhatsApp → Automático** para revisar el horario, el asesor, el inventario y la opción de contestar. Envía «Hola, ¿qué autos tienen?» desde el número de prueba y comprueba la respuesta. Para recibir consultas de otros clientes elimina SOFIA_PRUEBA_NUMERO de .env y vuelve a ejecutar `docker compose up -d`.

El proxy HTTPS incluido se activa con `docker compose --profile https up -d`. Primero apunta un dominio al VPS, abre los puertos TCP 80 y 443 y define SOFIA_DOMINIO en .env con ese dominio. Puedes abrir **https://tu-dominio/vincular** en otro dispositivo y escanearlo desde el celular que usa WhatsApp Business.

El QR se genera en el propio servidor. El volumen también contiene la sesión del teléfono. Conserva ese volumen al actualizar. Si WhatsApp revoca el vínculo, vuelve a abrir /vincular. Esta conexión no oficial puede sufrir desconexiones o restricciones de WhatsApp.

## Modo seguro «Solo mi WhatsApp» (chat «Tú»)

Para probar sin contestar clientes, establece estas variables en el entorno del servidor vinculado:

```env
SOFIA_SOLO_MI_WHATSAPP=1
SOFIA_PRUEBA_NUMERO=52XXXXXXXXXX
```

Usa como número de prueba **el mismo número vinculado**, con código de país y sin espacios. Reinicia el servicio; no es necesario borrar la sesión existente. En tu chat «Tú» escribe `/sofia hola`. Para probar una cotización escribe `/sofia quiero información de la CR-V`.

El comando `/sofia` reanuda el chat de prueba incluso si el vendedor lo dejó en «asesor» después de dos mensajes desconocidos. Las notas sin el prefijo no se responden. Ninguna conversación externa se procesa en este modo. Las pruebas no generan prospectos, apartados ni avisos comerciales al asesor.

**Importante:** el modo seguro debe quedar activado mientras se prueba con el WhatsApp personal. No lo desactives en el número personal para «probar clientes»; usa una cuenta o entorno empresarial y una lista de remitentes de prueba autorizados. La corrección aplica al código del repositorio: no actualiza automáticamente una instalación local ni recupera cambios de Codex que no se hayan subido a GitHub.
