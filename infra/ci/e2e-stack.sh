#!/usr/bin/env bash
# Stack complète des tests de bout en bout (CI) : la même que `pnpm dev`, mais compilée.
#   1. infra (Postgres, NATS, Valkey, S3, Mailpit, Kourrier), rôles, migrations et .env : up.sh --preparer
#   2. services compilés, lancés depuis dist/ avec leur .env
#   3. front construit en build de test (NEXT_PUBLIC_E2E : état de la carte exposé aux tests),
#      servi par `next start` ; la WebSocket vise la gateway directement
# Journaux de chaque processus dans e2e-logs/ (artefact du job en cas d'échec).
set -euo pipefail
cd "$(dirname "$0")/../.."
LOGS="$PWD/e2e-logs"
mkdir -p "$LOGS"

bash infra/local/up.sh --preparer

pnpm turbo run build --filter='./backend/*' --output-logs=errors-only

lancer() { # nom dossier point-d-entrée
  (cd "backend/$2" && nohup node --env-file=.env --import ./dist/instrumentation.js "dist/$3" \
    > "$LOGS/$1.log" 2>&1 &)
}
for service in identity character campaign dice billing history realtime audio gateway; do
  lancer "$service" "$service" main.js
done
lancer audio-worker audio worker.js

attendre() { # url nom
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "$1" && { echo "• $2 prêt"; return 0; }
    sleep 2
  done
  echo "• $2 ne répond pas ($1)" >&2
  tail -n 40 "$LOGS/$2.log" >&2 || true
  return 1
}
for paire in identity:3001 character:3002 campaign:3003 dice:3004 history:3005 realtime:3006 \
  billing:3007 audio:3008 gateway:8080; do
  attendre "http://localhost:${paire#*:}/healthz" "${paire%%:*}"
done

NEXT_PUBLIC_E2E=true NEXT_PUBLIC_REALTIME_ORIGIN=http://localhost:8080 \
  pnpm --filter @vtt/web build > "$LOGS/web-build.log" 2>&1 \
  || { tail -n 60 "$LOGS/web-build.log" >&2; exit 1; }
(cd frontend && nohup pnpm start > "$LOGS/web.log" 2>&1 &)
attendre http://localhost:3000/connexion web
