#!/usr/bin/env bash
# Importe les campagnes Firebase (collection `Salle`) dans la base locale : `pnpm import:campaigns`
#   pnpm import:campaigns              → export + simulation (rien n'est écrit)
#   pnpm import:campaigns --importer   → export + import réel
#   pnpm import:campaigns --sans-export --importer   → réutilise l'export existant
# ORDRE : comptes (`pnpm import:firebase`), puis personnages
# (`pnpm import:personnages --importer`), puis campagnes. Les membres sans compte
# migré et les personnages non importés sont ignorés (voir le rapport).
# Seule la collection `salles` (membres) est exportée ici : Salle, users, cartes
# et gameSystems viennent de l'export des personnages, pour que campagnes et
# personnages partent du même instantané. Exports et rapport dans ~/vtt-export.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
RAPPORT="$EXPORT/rapport-campagnes.ndjson"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

IMPORTER=0; EXPORTER=1
for a in "$@"; do
  case "$a" in
    --importer) IMPORTER=1 ;;
    --sans-export) EXPORTER=0 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

for f in backend/campaign/.env backend/character/.env backend/identity/.env; do
  [ -f "$f" ] || { echo "$f introuvable. Lance d'abord : pnpm dev --preparer" >&2; exit 1; }
done
for c in Salle users cartes gameSystems; do
  [ -f "$EXPORT/$c.ndjson" ] || {
    echo "$EXPORT/$c.ndjson introuvable : lance d'abord pnpm import:personnages --importer" >&2
    exit 1
  }
done
printf 'Rappel : comptes (pnpm import:firebase) et personnages (pnpm import:personnages --importer)\n'
printf 'doivent être importés AVANT les campagnes.\n'

etape "Build des outils"
pnpm turbo run build --filter=@vtt/firebase-export --filter=@vtt/campaign --output-logs=errors-only

if [ "$EXPORTER" = 1 ]; then
  [ -f legacy/.env ] || { echo "legacy/.env introuvable (FIREBASE_SERVICE_ACCOUNT_KEY)" >&2; exit 1; }
  etape "Export Firestore : membres des campagnes (salles/{code}/Noms)"
  node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
    --collection salles --recursive --out "$EXPORT"
fi

# Lecture seule : compte migré de chaque UID Firebase (identity_svc),
# personnages importés (characters_svc)
IDENTITY_DATABASE_URL="$(grep -E '^DATABASE_URL=' backend/identity/.env | cut -d= -f2-)"
CHARACTER_DATABASE_URL="$(grep -E '^DATABASE_URL=' backend/character/.env | cut -d= -f2-)"
export IDENTITY_DATABASE_URL CHARACTER_DATABASE_URL

if [ "$IMPORTER" = 1 ]; then
  etape "Import des campagnes"
  node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT"
else
  etape "Simulation (rien n'est écrit) — relance avec --importer pour importer"
  node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT" --dry-run
fi
