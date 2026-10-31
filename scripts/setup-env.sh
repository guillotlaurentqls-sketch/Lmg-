#!/usr/bin/env bash
# Prépare un conteneur Linux (environnement Claude Code) pour développer et tester l'appli.
# À coller dans « Setup script » de l'environnement, ou à lancer à la main : bash scripts/setup-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

need=()
command -v xvfb-run >/dev/null || need+=(xvfb)
command -v ffmpeg   >/dev/null || need+=(ffmpeg)
if [ ${#need[@]} -gt 0 ]; then
  (apt-get update -qq && apt-get install -y -qq "${need[@]}") || echo "⚠ installation de ${need[*]} impossible (droits ou réseau)"
fi
# Bibliothèques système qu'Electron attend sur un Linux minimal
apt-get install -y -qq libnss3 libgtk-3-0 libgbm1 libasound2 libxss1 libxtst6 libatk-bridge2.0-0 2>/dev/null || true

npm ci
node scripts/make-icons.js

# Vidéo de test (20 s) pour le site local
if command -v ffmpeg >/dev/null && [ ! -f test/e2e/site/test.webm ]; then
  ffmpeg -loglevel error -y -f lavfi -i testsrc=duration=20:size=640x360:rate=24 -f lavfi -i sine=frequency=440:duration=20 \
    -c:v libvpx -b:v 300k -c:a libvorbis test/e2e/site/test.webm
fi
echo "✔ Environnement prêt. Tests : npm test · npm run e2e · npm run e2e:real -- https://www.arte.tv/fr/"
