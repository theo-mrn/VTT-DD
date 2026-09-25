#!/usr/bin/env bash
# Démarre identity en local de bout en bout : Postgres, rôles, migrations, .env, service.
#   pnpm dev:identity
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f deploy/compose/docker-compose.yml"

echo "▶ Postgres"
$COMPOSE up -d --wait postgres
# Rejouables : appliqués aussi sur un volume déjà existant
for f in deploy/postgres/init/*.sql; do
  $COMPOSE exec -T postgres psql -U vtt -d vtt -v ON_ERROR_STOP=1 -q < "$f" 2>&1 | grep -v NOTICE || true
done

echo "▶ Migrations Liquibase (identity)"
deploy/postgres/liquibase/migrate.sh identity update

echo "▶ Configuration"
node services/identity/scripts/init-env.mjs

echo "▶ Build"
pnpm turbo run build --filter=@vtt/identity... --output-logs=errors-only

echo "▶ identity sur http://localhost:3001"
cd services/identity
exec node --env-file=.env --import ./dist/instrumentation.js dist/main.js
