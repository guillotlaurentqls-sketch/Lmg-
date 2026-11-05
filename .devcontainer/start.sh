#!/usr/bin/env bash
# Lance la pile, puis rend les ports publics (nécessaire pour que le site appelle l'API depuis le navigateur).
cd "$(dirname "$0")/.."
if [ -z "$VITE_TMDB_API_KEY" ] && ! grep -Eq '^VITE_TMDB_API_KEY=.+' .env; then
  echo "⚠️  VITE_TMDB_API_KEY manquante : ajoute-la dans .env (ou en secret Codespaces), puis relance : docker compose up -d --build"
fi
docker compose up -d --build
for p in 3000 25565 25569; do gh codespace ports visibility "$p:public" -c "$CODESPACE_NAME" 2>/dev/null || true; done
echo "Site : https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
