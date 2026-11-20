FROM node:22-bookworm-slim
ENV PUPPETEER_SKIP_DOWNLOAD=true CHROMIUM_PATH=/usr/bin/chromium SOFIA_DATA_DIR=/data SOFIA_WHATSAPP_WEB=1
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates tini && rm -rf /var/lib/apt/lists/* && install -d -o node -g node -m 700 /data
WORKDIR /srv/whatsapp-web
COPY whatsapp-web/package*.json ./
RUN npm ci --omit=dev
COPY whatsapp-web/cliente.mjs ./
COPY prueba /srv/prueba
USER node
EXPOSE 8080
ENTRYPOINT ["tini","--"]
CMD ["node","/srv/prueba/servidor/servidor.mjs"]
