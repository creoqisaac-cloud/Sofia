# Servidor de Sofía GRATIS: Supabase + Render

| Pieza | Servicio gratuito | Qué guarda |
|---|---|---|
| Base de datos | **Supabase** (Postgres, 500 MB) | Clientes, seguimientos, recordatorios, solicitudes, correo cifrado |
| Documentos | **Supabase Storage** (bucket privado, 1 GB) | INE, comprobantes, PDFs generados |
| App (Next.js) | **Render** (plan Free, Docker) | Nada: se puede reiniciar sin perder datos |

Supabase no ejecuta la app de Sofía (Next.js), por eso se usa Render para esa parte.

## Límites del plan gratis

- **Render duerme el servidor** tras 15 minutos sin uso. `supabase/keepalive.sql` lo despierta cada 10 minutos.
- Si aun así está dormido, la tablet muestra **“Sofía se está despertando…”** y reintenta sola, hasta 3 minutos.
- Los **recordatorios y alarmas ya programados en la tablet suenan aunque el servidor esté dormido**.
- **Supabase pausa proyectos sin actividad** durante 7 días. El keepalive cuenta como actividad.

## Pasos

Claude los hace por ti si conectas los conectores de Supabase y Render.

1. **Supabase** → New project, región `us-east` o la más cercana. Guarda la contraseña de la base de datos.
2. **Render** → New → Blueprint → repo `Sofia` (usa `render.yaml`). Llena las variables:
   - `DATABASE_URL`: Supabase → Connect → **Session pooler**. Es la dirección `postgres://postgres.<ref>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres`.
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API. La llave **service_role** es secreta: va solo en Render, nunca en la APK.
   - `SOFIA_BASIC_AUTH`: `usuario:contraseña` de la tablet.
3. Al primer arranque Sofía crea sus tablas y su espacio de trabajo. Los datos DEMO van marcados como DEMO.
4. En Supabase → SQL Editor, ejecuta `supabase/keepalive.sql` con la URL de Render.
5. En la tablet, pantalla **Conexión**: la URL de Render y el usuario/contraseña de `SOFIA_BASIC_AUTH`.

## Plan de pago (opcional)

Para servidor sin dormir y disco propio: Render Starter + disco persistente en `/data`. Ver el historial de `render.yaml`.
