#!/bin/bash
set -eu
root=/opt/sofia-local
cd "$root/app/whatsapp-web"
ruta_chrome() {
    "$root/node" -p "require('puppeteer').executablePath()"
}
chrome=$(ruta_chrome 2>/dev/null || true)
if [[ ! -x "$chrome" ]]; then
    "$root/node" node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js browsers install chrome
    chrome=$(ruta_chrome)
fi
export CHROMIUM_PATH="$chrome"
mkdir -p "$SOFIA_DATA_DIR"
cd "$SOFIA_DATA_DIR/.."
exec "$root/node" "$root/app/prueba/servidor/servidor.mjs"
