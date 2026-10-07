-- Mantiene despierto el servidor gratuito de Render (se duerme a los 15 min sin uso).
-- Supabase llama a /api/health cada 10 minutos con pg_cron + pg_net (incluidos en el plan gratis).
-- Reemplaza la URL por la de Render antes de ejecutarlo (SQL Editor de Supabase).
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('sofia-keepalive') where exists (select 1 from cron.job where jobname = 'sofia-keepalive');
select cron.schedule('sofia-keepalive', '*/10 * * * *', $$ select net.http_get('https://SOFIA-URL.onrender.com/api/health') $$);
