# Subir Sofía a un servidor siempre encendido (Render)

Así la tablet de Mario funciona sin ninguna computadora encendida.

## 1. Crear el servidor (una sola vez, ~5 minutos)

1. Entra a <https://render.com> → **Sign in with GitHub**. Autoriza el repo `Sofia`.
2. **New → Blueprint** → elige el repo `Sofia`. Render lee `render.yaml`.
3. Te pide `SOFIA_BASIC_AUTH`. Escribe `mario:una-contraseña-larga`, que es el usuario y la contraseña de la tablet.
4. **Apply**.
   - Usa el plan Starter con disco de 1 GB, más o menos US$7–8 al mes, con tarjeta.
   - El plan gratis **no sirve**: se duerme y borra los datos en cada reinicio.
5. Espera el primer deploy (5–10 min). Render te da una dirección tipo `https://sofia-xxxx.onrender.com`.
6. Comprueba que el servidor responde:
   - `https://…onrender.com/api/health` debe mostrar `{"ok":true}`;
   - la página principal pide usuario y contraseña.

Cada push a la rama `claude/laughing-sagan-hbxj3y` vuelve a desplegar el servidor solo.

## 2. Conectar la tablet

- **Opción rápida:** Mario abre la APK que ya tiene. En la pantalla **Conexión** escribe:
  - la dirección `https://sofia-xxxx.onrender.com`;
  - el usuario y la contraseña.

  Luego toca **Guardar y conectar**.
- **APK con la dirección ya puesta:** en GitHub → Actions → **Android APK (Sofía tablet)** → *Run workflow*, con `server_url` igual a la dirección de Render. La nueva `Sofia.apk` sale en Releases.

## Qué hay dentro

- `Dockerfile`: compila Next.js y arranca con `next start`.
- Los datos van en el disco `/data`:
  - base PGlite en `/data/pglite`;
  - documentos privados en `/data/private-docs`.
- Las migraciones corren solas al arrancar.
- Se cargan los datos **DEMO** marcados (igual que en el piloto) para poder probar. Los clientes reales que Mario agregue quedan en el disco del servidor, nunca en git ni en la APK.
- `/api/health` es la única ruta sin contraseña y no devuelve datos.
- Sin IA externa: `SOFIA_LLM_PROVIDER=demo`.
- Respaldo: Render → Disks → snapshots diarios automáticos.
