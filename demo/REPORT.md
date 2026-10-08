# Demo escáner INE (CI, emulador Android)

- ✅ Observación de ML Kit recibida (6/6 partes)
- ✅ La observación cumple el esquema del servidor
- ML Kit: 2 página(s), 24 bloques, 24 renglones

## IneParser sobre el OCR real de ML Kit

| Campo | Valor (sintético) | Confianza |
|---|---|---|
| voter_key | SNEJPR85050509M100 | medium |
| birth_date | 1985-05-05 | medium |
| gender | female | medium |
| paternal_last_name | SINTETICO | low |
| maternal_last_name | EJEMPLO | low |
| first_name | PRUEBA | low |
| middle_name | ANA | low |
| postal_code | 06000 | medium |
| neighborhood | CENTRO | medium |
| municipality | CUAUHTEMOC | medium |
| state | Ciudad de México | medium |
| street | FALSA | medium |
| exterior_number | 123 | medium |
| interior_number | 4 | medium |

> ⚠️ La CURP leída no pasa la validación (algún carácter dudoso): no se usó. Captúrala a mano.

- ✅ Ningún dato en confianza alta
- ✅ Ningún nombre con dígitos
- ✅ CURP dudosa en el OCR → se dejó vacía (nunca una CURP incorrecta)
- ✅ Ningún dato con valor incorrecto
- ✅ Flujo dentro de la APK: Escanear → revisión → confirmar → solicitud → PDF
- Documento 729561d7-b3e2-4b88-a8f5-d74dda3cdcc9 · 14 dato(s) OBSERVADOS → 14 CONFIRMADOS por la prueba · solicitud 160b7eac-365c-4ace-9806-31ad2551fef5
- ✅ PDF de la solicitud descargado del servidor
- ✅ PDF BBVA · CURP = "" (correcta o vacía, nunca incorrecta)
- ✅ PDF BBVA · Apellido paterno = "SINTETICO"
- ✅ PDF BBVA · primer nombre = "PRUEBA"

## Funciones de la tablet (en la APK)

- ✅ Alarma de prueba mostrada por Android (notificación local)
- ✅ Recordatorio del servidor programado en Android (LocalNotifications.getPending)
- ✅ INE por FOTO (OCR real en la tablet) → observados → confirmar todos → solicitud → PDF
- Foto INE: 14 dato(s) observados · solicitud f2057944-647a-4de5-a31f-8d9e6c77b32f
- ✅ PDF desde foto · SINTETICO / PRUEBA
- ✅ PDF desde foto · CURP = "" (correcta o vacía)
- ✅ Correo de placas enviado desde la APK (con confirmación)
- ✅ El servidor SMTP recibió el correo de placas (1 correo(s) recibidos)
- ✅ El correo de placas lleva la INE adjunta

Capturas de pantalla (APK en el emulador): `screens/`.
Única sustitución: la pantalla de cámara del escáner de Google Play (no operable en emulador) entrega la imagen sintética; el OCR es ML Kit real en el dispositivo.
