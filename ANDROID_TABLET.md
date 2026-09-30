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
- Para que funcione sin computadora encendida y fuera de la agencia, sube el servidor a Render: ver `DEPLOY.md`.

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

## Escanear documentos (APK)

En **1 · Documentos**, dentro de la APK, aparece **Escanear documento**:

1. Elige el tipo (por ejemplo **INE**) y toca **Escanear documento**.
2. Se abre el escáner de Google (ML Kit Document Scanner):
   - detecta los bordes;
   - recorta y endereza;
   - mejora la imagen.

   Para la INE escanea **frente y reverso** (hasta 2 páginas). También se puede importar una foto.
3. El texto se lee **en la tablet** con ML Kit Text Recognition v2:
   - el modelo viene dentro de la APK;
   - no necesita internet;
   - no cuesta tokens.
4. El archivo se sube como documento privado. Lo leído entra **OBSERVADO** y se abre la pantalla de revisión, donde se puede **Confirmar**, **Corregir** o **Ignorar**.
5. Lo confirmado llena la solicitud BBVA/Banorte. Lo observado **nunca** se usa sin confirmar.

Qué garantiza:

- No se guarda en la galería.
- Las imágenes temporales de la caché se borran al subirlas.
- El texto leído no va a logs.

Requisitos y límites:

- **Requiere Google Play services.** La primera vez, Google Play descarga el módulo del escáner. Si no está disponible, se usa **Tomar foto** o **Elegir archivos** con captura manual.
- **En un navegador** no hay escáner ni OCR: se sube a mano. No se finge OCR web.

### Qué lee de la INE (IneParser v1)

| Dato | Cómo se valida |
|---|---|
| Apellidos y nombre(s) | Renglones debajo de NOMBRE. **Nunca** acepta dígitos ni símbolos. Se cruzan con las iniciales de la CURP y con el reverso. |
| CURP | Estructura, estado, fecha real y **dígito verificador**. Nunca se corrige ni se reconstruye un carácter dudoso. |
| Clave de elector | Estructura. Se cruza su fecha y sexo. |
| Fecha de nacimiento y sexo | Se cruzan con CURP, clave y reverso (MRZ). |
| Domicilio | Calle, número, interior, colonia, CP, municipio y estado. El CP se cruza con el estado. Si la calle lleva manzana o lote, no se parte. |
| Reverso (MRZ) | Solo si los dígitos verificadores ICAO son válidos. |

Reglas de confianza:

- **Nunca** hay confianza alta: el máximo es *media*, y solo cuando otra fuente independiente lo respalda.
- Si dos fuentes no coinciden, el dato queda en confianza *baja* y la nota del documento lo avisa.
- Si un dato contradice uno ya confirmado del cliente, queda en **conflicto**.
- Si falta evidencia, el campo se deja vacío.

## Extracción de datos

**Sin IA y sin inventar.** Lo que funciona hoy:

| Documento | Qué se lee |
|---|---|
| **Escaneo en la APK** (INE) | IneParser v1 sobre el OCR de ML Kit en la tablet. Confianza media o baja. |
| **Escaneo en la APK** (otros documentos) | CURP (con dígito verificador), RFC y correo, solo si hay un valor inequívoco. Confianza baja. |
| PDF de **solicitud BBVA/Banorte llenada** | Los campos del formulario. Confianza alta. |
| PDF **con texto** (constancias, estados de cuenta digitales) | CURP, RFC y correo, solo si hay un valor inequívoco. Confianza media. |
| **Fotos** y PDFs **escaneados** subidos sin el escáner | Nada automático. Mario captura los datos en el mismo documento. |

- Todo lo leído entra como **observado** y solo se usa en la solicitud cuando Mario lo **confirma**.
- **OCR/visión externo** (Document AI, Textract, Azure o un modelo de visión) se conecta en `src/server/extraction/index.ts` con credenciales **del servidor**, nunca en la APK. Cada llamada queda en la métrica de uso de IA (Más → Sistema).

## Pruebas del escáner en CI

El workflow compila la APK y la prueba en un **emulador Android** con una INE **sintética** (persona inexistente, `scripts/ine-sintetica.mjs`):

- OCR real de ML Kit sobre frente y reverso;
- el plugin expuesto a la página;
- el flujo **dentro de la APK** contra un servidor Sofía real: Escanear → observados → Confirmar → solicitud BBVA → PDF.

El resultado (reporte, capturas y PDF sintético) queda en `demo/` de la rama `apk-tablet`.

Lo único que no se puede operar en un emulador es la pantalla de cámara del escáner de Google Play: en la prueba se entrega la imagen sintética en su lugar. **La captura con cámara se valida en la tablet real.**
