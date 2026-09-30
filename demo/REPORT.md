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
- Documento d5dcc5ff-9a55-4268-b3c9-85a5c1544490 · 14 dato(s) OBSERVADOS → 14 CONFIRMADOS por la prueba · solicitud 2bf6c934-3553-4c93-b238-7914a9599fab
- ✅ PDF de la solicitud descargado del servidor
- ✅ PDF BBVA · CURP = "" (correcta o vacía, nunca incorrecta)
- ✅ PDF BBVA · Apellido paterno = "SINTETICO"
- ✅ PDF BBVA · primer nombre = "PRUEBA"

Capturas de pantalla (APK en el emulador): `screens/`.
Única sustitución: la pantalla de cámara del escáner de Google Play (no operable en emulador) entrega la imagen sintética; el OCR es ML Kit real en el dispositivo.
