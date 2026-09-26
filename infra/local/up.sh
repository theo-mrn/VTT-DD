#!/usr/bin/env bash
# Démarre toute la stack de dev en une commande : `pnpm dev`
#   1. Docker (lancé s'il est éteint), infra : Postgres, NATS, Valkey
#      (+ optionnels : --stockage, --mails, --observabilite, --tout)
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

# Toujours démarrés : Postgres, NATS, Valkey, stockage S3 (avatars), Mailpit (e-mails).
# Option : --observabilite (Grafana), --tout
# --preparer : infra, migrations et .env seulement, sans lancer les apps (CI, vérification)
# Stockage (avatars) et mails (identity) par défaut ; Grafana à la demande
PROFILS=(--profile stockage --profile mails)
PREPARER_SEULEMENT=0
for arg in "$@"; do
  case "$arg" in
    --preparer) PREPARER_SEULEMENT=1 ;;
    --stockage) PROFILS+=(--profile stockage) ;;
    --mails) PROFILS+=(--profile mails) ;;
    --observabilite) PROFILS+=(--profile observabilite) ;;
    --tout) PROFILS+=(--profile stockage --profile mails --profile observabilite) ;;
    *) echo "Option inconnue : $arg (--stockage, --mails, --observabilite, --tout, --preparer)" >&2; exit 2 ;;
  esac
done

etape "Infrastructure"
$COMPOSE ${PROFILS[@]+"${PROFILS[@]}"} up -d --wait

etape "Stockage S3 local"
# Bucket des avatars et bannières (rejouable)
$COMPOSE exec -T s3 sh -c "echo 's3.bucket.create -name vtt-dev' | weed shell" >/dev/null 2>&1 \
  && echo "bucket vtt-dev prêt" || echo "bucket vtt-dev : création impossible (envoi d'images indisponible)"

etape "Rôles et schémas SQL"
for f in infra/postgres/init/*.sql; do
  $COMPOSE exec -T postgres psql -U vtt -d vtt -v ON_ERROR_STOP=1 -q < "$f" 2>&1 | grep -v NOTICE || true
done

etape "Migrations"
for changelog in backend/*/db/changelog.yaml; do
  [ -e "$changelog" ] || continue
  service=$(basename "$(dirname "$(dirname "$changelog")")")
  # Silencieux si tout va bien ; en cas d'échec, sortie complète de Liquibase
  if sortie=$(infra/postgres/liquibase/migrate.sh "$service" update --log-level=WARNING 2>&1); then
    echo "• $service : à jour"
  else
    echo "$sortie" >&2
    echo "• $service : échec des migrations" >&2
    exit 1
  fi
done

etape "Configuration"
for dossier in backend/*/; do
  service=$(basename "$dossier")
  if [ -f "$dossier/scripts/init-env.mjs" ]; then
    node "$dossier/scripts/init-env.mjs"
  elif [ -f "$dossier/.env.example" ] && [ ! -f "$dossier/.env" ]; then
    cp "$dossier/.env.example" "$dossier/.env" && echo "backend/$service/.env créé"
  fi
  # Complète un .env existant avec les variables apparues depuis dans .env.example,
  # sans jamais modifier une valeur déjà présente
  if [ -f "$dossier/.env.example" ] && [ -f "$dossier/.env" ]; then
    ajoutees=0
    while IFS= read -r ligne; do
      case "$ligne" in ''|\#*) continue ;; esac
      cle=${ligne%%=*}
      if ! grep -qE "^#? ?$cle=" "$dossier/.env"; then
        printf '%s\n' "$ligne" >> "$dossier/.env"
        ajoutees=$((ajoutees + 1))
      fi
    done < "$dossier/.env.example"
    [ "$ajoutees" -gt 0 ] && echo "backend/$service/.env : $ajoutees variable(s) ajoutée(s)"
  fi
done

if [ "$PREPARER_SEULEMENT" = 1 ]; then
  etape "Prêt (--preparer : services non lancés)"
  exit 0
fi

etape "Services et front (Ctrl+C pour tout arrêter)"
echo "  front    http://localhost:3000"
echo "  gateway  http://localhost:8080"
echo "  e-mails  http://localhost:8025"
exec pnpm turbo run dev --filter='./backend/*' --filter=@vtt/web
