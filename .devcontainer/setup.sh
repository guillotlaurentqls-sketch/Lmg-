#!/usr/bin/env bash
# Prépare le .env pour Codespaces : le navigateur appelle l'API via les URLs publiques des ports redirigés.
set -e
[ -f .env ] || cp .env.example .env
if [ -n "$CODESPACE_NAME" ]; then
  D="$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"
  set_var() { grep -q "^$1=" .env && sed -i "s#^$1=.*#$1=$2#" .env || echo "$1=$2" >> .env; }
  set_var VITE_SITE_URL "https://${CODESPACE_NAME}-3000.${D}"
  set_var VITE_MAIN_API "https://${CODESPACE_NAME}-25565.${D}"
  set_var VITE_PROXIES_EMBED_API "https://${CODESPACE_NAME}-25569.${D}"
fi
