#!/usr/bin/env bash
# Importe les clients Stripe et le premium de l'ancienne app dans la base locale : `pnpm import:billing`
#   pnpm import:billing                           → simulation (rien n'est écrit)
#   pnpm import:billing --importer                → import réel
#   pnpm import:billing --exporter --importer     → réexporte users depuis Firestore, puis importe
# ORDRE : comptes (`pnpm import:firebase`), puis billing. Les champs viennent de
# users/{uid} (stripeCustomerId, stripeSubscriptionId, premium, premiumSince,
# cancelAtPeriodEnd, premiumEndDate) : l'export users des imports précédents suffit.
# Avec --importer, le premium en cours est aussi posé dans identity (badge) et
# dice (tous les skins) par leurs routes internes : ces services doivent tourner
# (`pnpm dev`), sinon l'import le signale et peut être relancé.
# Exports et rapport dans ~/vtt-export.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
RAPPORT="$EXPORT/rapport-billing.ndjson"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

IMPORTER=0; EXPORTER=0
for a in "$@"; do
  case "$a" in
    --importer) IMPORTER=1 ;;
    --exporter) EXPORTER=1 ;;
    *) echo "option inconnue : $a (--importer, --exporter)" >&2; exit 2 ;;
  esac
done

for f in backend/billing/.env backend/identity/.env; do
  [ -f "$f" ] || { echo "$f introuvable. Lance d'abord : pnpm dev --preparer" >&2; exit 1; }
done
printf 'Rappel : les comptes doivent être importés AVANT billing.\n'

etape "Build des outils"
if [ "$EXPORTER" = 1 ]; then
  pnpm turbo run build --filter=@vtt/firebase-export --filter=@vtt/billing --output-logs=errors-only
else
  pnpm turbo run build --filter=@vtt/billing --output-logs=errors-only
fi

if [ "$EXPORTER" = 1 ]; then
  [ -f legacy/.env ] || { echo "legacy/.env introuvable (FIREBASE_SERVICE_ACCOUNT_KEY)" >&2; exit 1; }
  etape "Export Firestore : users"
  node --env-file=legacy/.env tools/firebase-export/dist/cli.js --collection users --out "$EXPORT"
fi
[ -f "$EXPORT/users.ndjson" ] || {
  echo "$EXPORT/users.ndjson introuvable : relance avec --exporter" >&2
  exit 1
}

# Lecture seule : compte migré de chaque UID Firebase (identity_svc)
IDENTITY_DATABASE_URL="$(grep -E '^DATABASE_URL=' backend/identity/.env 2>/dev/null | cut -d= -f2- || true)"
export IDENTITY_DATABASE_URL

if [ "$IMPORTER" = 1 ]; then
  etape "Import des clients et du premium"
  node --env-file=backend/billing/.env backend/billing/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT"
else
  etape "Simulation (rien n'est écrit) — relance avec --importer pour importer"
  node --env-file=backend/billing/.env backend/billing/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT" --dry-run
fi
