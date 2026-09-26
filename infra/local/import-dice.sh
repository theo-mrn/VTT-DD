#!/usr/bin/env bash
# Importe les jets et préférences de dés Firebase dans la base locale : `pnpm import:dice`
#   pnpm import:dice                          → export + simulation (rien n'est écrit)
#   pnpm import:dice --importer               → export + import réel
#   pnpm import:dice --sans-export --importer → réutilise l'export existant
# ORDRE : comptes (`pnpm import:firebase`), personnages (`pnpm import:personnages
# --importer`), campagnes (`pnpm import:campaigns --importer`), puis dés. Les jets
# d'une campagne non importée sont ignorés ; un jet dont l'auteur n'a pas de compte
# migré est importé sous son ancien nom affiché, sans compte (voir le rapport).
# Seule la collection `rolls` (rolls/{campagne}/rolls) est exportée ici : users
# (skin et inventaire) et salles (noms affichés) viennent des exports précédents.
# Exports et rapport dans ~/vtt-export.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
RAPPORT="$EXPORT/rapport-des.ndjson"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

IMPORTER=0; EXPORTER=1
for a in "$@"; do
  case "$a" in
    --importer) IMPORTER=1 ;;
    --sans-export) EXPORTER=0 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

for f in backend/dice/.env backend/campaign/.env backend/identity/.env; do
  [ -f "$f" ] || { echo "$f introuvable. Lance d'abord : pnpm dev --preparer" >&2; exit 1; }
done
[ -f "$EXPORT/users.ndjson" ] || {
  echo "$EXPORT/users.ndjson introuvable : lance d'abord pnpm import:personnages --importer" >&2
  exit 1
}
printf 'Rappel : comptes, personnages et campagnes doivent être importés AVANT les dés.\n'

etape "Build des outils"
pnpm turbo run build --filter=@vtt/firebase-export --filter=@vtt/dice --output-logs=errors-only

if [ "$EXPORTER" = 1 ]; then
  [ -f legacy/.env ] || { echo "legacy/.env introuvable (FIREBASE_SERVICE_ACCOUNT_KEY)" >&2; exit 1; }
  etape "Export Firestore : jets de dés (rolls/{campagne}/rolls)"
  node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
    --collection rolls --recursive --out "$EXPORT"
fi
[ -f "$EXPORT/rolls.ndjson" ] || { echo "$EXPORT/rolls.ndjson introuvable" >&2; exit 1; }

# Lecture seule : compte migré de chaque UID Firebase (identity_svc), campagnes
# importées (campaign_svc), personnages importés (characters_svc, facultatif)
url() { grep -E '^DATABASE_URL=' "$1" 2>/dev/null | cut -d= -f2- || true; }
IDENTITY_DATABASE_URL="$(url backend/identity/.env)"
CAMPAIGN_DATABASE_URL="$(url backend/campaign/.env)"
CHARACTER_DATABASE_URL="$(url backend/character/.env)"
export IDENTITY_DATABASE_URL CAMPAIGN_DATABASE_URL CHARACTER_DATABASE_URL

if [ "$IMPORTER" = 1 ]; then
  etape "Import des jets et préférences de dés"
  node --env-file=backend/dice/.env backend/dice/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT"
else
  etape "Simulation (rien n'est écrit) — relance avec --importer pour importer"
  node --env-file=backend/dice/.env backend/dice/dist/import/cli.js \
    --export "$EXPORT" --report "$RAPPORT" --dry-run
fi
