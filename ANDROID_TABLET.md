# Sofía para la tablet de Mario (APK Android)

## Qué es la APK

La APK es la app **Sofía** para Android, hecha con Capacitor:

- ícono y splash propios;
- pantalla completa, sin barra de Chrome.

Muestra **la misma Sofía del servidor** (Next.js + base de datos) y le agrega lo nativo:

- compartir el PDF (hoja de compartir de Android);
- guardar archivos en la tablet;
- tomar fotos al subir documentos.

La APK **no contiene** datos de clientes, base de datos, contraseñas ni llaves. **Sin servidor encendido y alcanzable, la app no muestra datos**: abre la pantalla “Conexión”.

## 1. Encender el servidor de Sofía

En la computadora que funcionará como servidor, en la misma Wi‑Fi que la tablet:

```bash
npm install
SOFIA_BASIC_AUTH=mario:una-contraseña-larga npm run demo:iphone
```

La consola muestra `Network: http://192.168.x.x:3000`. Esa es la dirección para la tablet.

- La computadora debe seguir encendida mientras Mario usa la app.
- Para usarla fuera de la agencia hace falta un servidor HTTPS fijo; eso todavía no está contratado.

## 2. Descargar la APK

GitHub Actions la compila con el workflow **“Android APK (Sofía tablet)”**. Hay tres lugares para bajarla:

- **Release:** `github.com/creoqisaac-cloud/Sofia/releases`, tag `tablet-N`, archivo `Sofia.apk`.
- **Rama `apk-tablet`:** archivo `Sofia.apk`, siempre la última.
- **Artefacto `sofia-apk`** del workflow (30 días).

Para compilarla localmente se necesita Android Studio o el Android SDK: `SOFIA_SERVER_URL=http://IP:3000 npm run android:apk`. El resultado queda en `android/app/build/outputs/apk/debug/app-debug.apk` y se copia a `./Sofia.apk`.

## 3. Instalar en la tablet

1. Pasa `Sofia.apk` a la tablet (WhatsApp a sí mismo, Drive, cable USB o correo).
2. Ábrela y acepta **“Permitir de esta fuente”**. Es una app privada, no de Play Store.
3. Si aparece Play Protect, elige **“Instalar de todas formas”**.
4. Abre **Sofía**.
5. En la pantalla **Conexión**, escribe:
   - la dirección `http://192.168.x.x:3000`;
   - el usuario y contraseña de `SOFIA_BASIC_AUTH`.
6. Toca **Guardar y conectar**.

Todo se guarda **solo en la tablet**. Para cambiar el servidor después, apaga el servidor y la app vuelve a mostrar “Conexión”; o reinstala.

**Actualizaciones:** esta primera APK está firmada con una llave de *debug* del compilador. Una APK futura con otra firma pide desinstalar la anterior. Para firmar siempre igual, agrega los secretos `SOFIA_KEYSTORE_BASE64` y `SOFIA_KEYSTORE_PASSWORD` en GitHub (alias `sofia`); el workflow compila la versión *release* firmada.

## 4. Probar (datos DEMO)

### Solicitudes

1. Inicio → busca “Ana” → abre **Ana López**.
2. **1 · Documentos** → elige el tipo → **Elegir archivos** o **Tomar foto**.
3. Abre el documento → **Datos encontrados**. Cada dato está *observado* y se puede **Confirmar**, **Corregir** o **Ignorar**. Si un dato no coincide con uno que ya tenía el cliente, aparece como conflicto.
4. **Continuar a la solicitud** → **BBVA** → *Completar* (conflictos y faltantes) → *Vista previa* → *PDF* → **Generar borrador PDF**.
5. Aparece **SOLICITUD GENERADA** con **Ver PDF / Compartir / Guardar**:
   - **Compartir** abre la hoja de Android (WhatsApp, Gmail, Drive…);
   - **Guardar** lo deja en `Documentos/Sofia/`.

### Seguimiento

1. **Seguimiento** → tarjetas con último contacto, siguiente acción, fecha y motivo.
2. Botones grandes: **Contactar** (marca y registra el contacto), **Agendar cita**, **Posponer**, **Completado**.
3. En la ficha, **Registrar la cotización que enviaste**. Sofía no cotiza: guarda la cotización de Mario y agenda el seguimiento a 2 días.

### Placas / correo

1. **Placas** → trámite → **Preparar correo de placas**.
2. Aparecen Para, Asunto, Cuerpo y Adjuntos.
3. **Compartir con adjuntos** abre Gmail u otra app con los documentos; después toca **Marcar enviado**.
4. Nada se envía solo.

## Dónde quedan los documentos

- Se guardan en el **servidor**, en `SOFIA_PRIVATE_STORAGE_DIR` (por defecto `.data/private-docs/<workspace>/customers/<cliente>/…`), con permisos 600 y nombres opacos.
- Nunca en `/public` ni en git.
- Solo se sirven por `/api/documents/<id>/file`, con `no-store`.
- En la base quedan el hash, el tipo, el estado y el nombre original. Los logs no registran nombres ni valores.
- En la tablet solo queda lo que Mario **guarda o comparte** a propósito, más archivos temporales de la caché para compartir.

## Extracción de datos

**Sin IA y sin inventar.** Lo que funciona hoy:

| Documento | Qué se lee |
|---|---|
| PDF de **solicitud BBVA/Banorte llenada** | Los campos del formulario. Confianza alta. |
| PDF **con texto** (constancias, estados de cuenta digitales) | CURP, RFC y correo, solo si hay un valor inequívoco. Confianza media. |
| **Fotos** y PDFs **escaneados** | Nada automático. Mario ve la imagen y captura los datos en el mismo documento. |

- Todo lo leído entra como **observado** y solo se usa en la solicitud cuando Mario lo **confirma**.
- **OCR en la tablet (ML Kit):** existe, pero no se integró.
  - Requiere un plugin nativo de terceros.
  - Su lectura de INE o comprobantes mexicanos (fotos inclinadas, hologramas) necesita validación con documentos reales.
  - Queda como siguiente paso, con la interfaz `ExtractionProvider` ya lista.
- **OCR/visión externo** (Document AI, Textract, Azure o un modelo de visión) se conecta en `src/server/extraction/index.ts` con credenciales **del servidor**, nunca en la APK. Cada llamada queda en la métrica de uso de IA (Más → Sistema).
