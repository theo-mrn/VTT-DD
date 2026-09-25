#!/usr/bin/env bash
# Démarre toute la stack de dev en une commande : `pnpm dev`
#   1. Docker (lancé s'il est éteint), infra (Postgres, NATS, Valkey, MinIO, Mailpit)
#   2. rôles SQL puis migrations Liquibase de chaque service ayant db/changelog.yaml
#   3. .env de chaque service créé depuis son .env.example s'il manque
#   4. tous les services + le nouveau front, en parallèle, avec rechargement à chaud
# Un nouveau service est pris en compte automatiquement : rien à modifier ici.
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f infra/local/docker-compose.yml"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

etape "Docker"
if ! docker info >/dev/null 2>&1; then
  if [ "$(uname)" = Darwin ]; then
    echo "Docker est éteint : démarrage de Docker Desktop…"
    open -a Docker
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
  docker info >/dev/null 2>&1 || { echo "Docker ne répond pas. Démarre-le puis relance pnpm dev." >&2; exit 1; }
fi

etape "Infrastructure"
$COMPOSE up -d --wait

etape "Rôles et schémas SQL"
for f in infra/postgres/init/*.sql; do
  $COMPOSE exec -T postgres psql -U vtt -d vtt -v ON_ERROR_STOP=1 -q < "$f" 2>&1 | grep -v NOTICE || true
done

etape "Migrations"
for changelog in services/*/db/changelog.yaml; do
  [ -e "$changelog" ] || continue
  service=$(basename "$(dirname "$(dirname "$changelog")")")
  echo "• $service"
  infra/postgres/liquibase/migrate.sh "$service" update --log-level=WARNING >/dev/null
done

etape "Configuration"
for dossier in services/*/; do
  service=$(basename "$dossier")
  if [ -f "$dossier/scripts/init-env.mjs" ]; then
    node "$dossier/scripts/init-env.mjs"
  elif [ -f "$dossier/.env.example" ] && [ ! -f "$dossier/.env" ]; then
    cp "$dossier/.env.example" "$dossier/.env" && echo "services/$service/.env créé"
  fi
done

etape "Services et front (Ctrl+C pour tout arrêter)"
echo "  front    http://localhost:3000"
echo "  gateway  http://localhost:8080"
echo "  mails    http://localhost:8025"
exec pnpm turbo run dev --filter='./services/*' --filter=@vtt/web
