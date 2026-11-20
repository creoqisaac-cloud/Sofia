#!/bin/bash
set -euo pipefail
version=${1:?indica la versión}
out=${2:?indica la ruta absoluta de salida}
pkg=$(mktemp -d)
trap 'rm -rf "$pkg"' EXIT
root="$pkg/opt/sofia-local"
mkdir -p "$root/app" "$pkg/DEBIAN" "$pkg/usr/bin" "$pkg/usr/share/applications" "$pkg/usr/share/icons/hicolor/scalable/apps"
git archive HEAD prueba whatsapp-web/package.json whatsapp-web/package-lock.json whatsapp-web/cliente.mjs | tar -x -C "$root/app"
install -m755 "$(command -v node)" "$root/node"
install -m644 whatsapp-web/pop-os/iniciar.sh "$root/iniciar.sh"
install -m755 whatsapp-web/pop-os/sofia-local.py "$pkg/usr/bin/sofia-local"
install -m644 whatsapp-web/pop-os/sofia-local.desktop "$pkg/usr/share/applications/"
install -m644 prueba/icon.svg "$pkg/usr/share/icons/hicolor/scalable/apps/sofia-local.svg"
(cd "$root/app/whatsapp-web" && PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev --no-audit --no-fund)
cat > "$pkg/DEBIAN/control" <<EOF
Package: sofia-whatsapp-local
Version: $version
Architecture: amd64
Maintainer: Sofia <noreply@users.noreply.github.com>
Section: net
Priority: optional
Depends: python3, python3-tk, ca-certificates, fonts-liberation, libasound2t64 | libasound2, libatk-bridge2.0-0t64 | libatk-bridge2.0-0, libatk1.0-0t64 | libatk1.0-0, libc6 (>= 2.35), libcairo2, libcups2t64 | libcups2, libdbus-1-3, libdrm2, libgbm1, libglib2.0-0t64 | libglib2.0-0, libgtk-3-0t64 | libgtk-3-0, libnspr4, libnss3, libpango-1.0-0, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0, libxrandr2, libxshmfence1, libx11-xcb1
Description: Prueba local del vendedor de Sofía con WhatsApp Business
 Vincula una cuenta por QR y prueba conversaciones desde un segundo celular.
EOF
dpkg-deb --root-owner-group -Zxz -z3 --build "$pkg" "$out"
