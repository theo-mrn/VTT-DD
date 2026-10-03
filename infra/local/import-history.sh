#!/usr/bin/env bash
# Importe l'ancien Historique Firebase dans le journal local (service history) : `pnpm import:history`
#   pnpm import:history                          → export + simulation (rien n'est écrit)
#   pnpm import:history --importer               → export + import réel
#   pnpm import:history --sans-export --importer → réutilise l'export existant
# ORDRE : comptes (`pnpm import:firebase`), personnages (`pnpm import:personnages
# --importer`), campagnes (`pnpm import:campaigns --importer`), puis historique. Les
# événements d'une campagne non importée sont ignorés ; une note privée dont l'auteur n'a
# pas de compte migré reste visible du MJ seul (voir le rapport).
# Seule la collection `Historique` (Historique/{campagne}/events) est exportée ici.
# Rejouable : les événements déjà importés sont écartés. Exports et rapport dans ~/vtt-export.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
RAPPORT="$EXPORT/rapport-historique.ndjson"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

IMPORTER=0; EXPORTER=1
for a in "$@"; do
  case "$a" in
    --importer) IMPORTER=1 ;;
    --sans-export) EXPORTER=0 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

for f in backend/history/.env backend/campaign/.env backend/identity/.env; do
  [ -f "$f" ] || { echo "$f introuvable. Lance d'abord : pnpm dev --preparer" >&2; exit 1; }
done
printf 'Rappel : comptes, personnages et campagnes doivent être importés AVANT l’historique.\n'

etape "Build des outils"
pnpm turbo run build --filter=@vtt/firebase-export --filter=@vtt/history --output-logs=errors-only

if [ "$EXPORTER" = 1 ]; then
  [ -f legacy/.env ] || { echo "legacy/.env introuvable (FIREBASE_SERVICE_ACCOUNT_KEY)" >&2; exit 1; }
  etape "Export Firestore : historique (Historique/{campagne}/events)"
  node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
    --collection Historique --recursive --out "$EXPORT"
fi
[ -f "$EXPORT/Historique.ndjson" ] || { echo "$EXPORT/Historique.ndjson introuvable" >&2; exit 1; }

# Lecture seule : compte migré de chaque UID Firebase (identity_svc), campagnes importées
# et rôles des membres (campaign_svc), personnages importés (characters_svc, facultatif)
url() { grep -E '^DATABASE_URL=' "$1" 2>/dev/null | cut -d= -f2- || true; }
IDENTITY_DATABASE_URL="$(url backend/identity/.env)"
CAMPAIGN_DATABASE_URL="$(url backend/campaign/.env)"
CHARACTER_DATABASE_URL="$(url backend/character/.env)"
export IDENTITY_DATABASE_URL CAMPAIGN_DATABASE_URL CHARACTER_DATABASE_URL

if [ "$IMPORTER" = 1 ]; then
  etape "Import de l'historique"
  node --env-file=backend/history/.env backend/history/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT"
else
  etape "Simulation (rien n'est écrit) — relance avec --importer pour importer"
  node --env-file=backend/history/.env backend/history/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT" --dry-run
fi
