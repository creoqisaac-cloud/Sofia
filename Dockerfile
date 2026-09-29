# Sofía — servidor siempre encendido (Render / Railway / Fly / cualquier Docker).
# Datos (PGlite + documentos privados) en /data: montar un disco persistente ahí.
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    PGLITE_DATA_DIR=/data/pglite SOFIA_PRIVATE_STORAGE_DIR=/data/private-docs \
    SOFIA_LLM_PROVIDER=demo PORT=3000
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /data
EXPOSE 3000
CMD ["sh", "-c", "exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
