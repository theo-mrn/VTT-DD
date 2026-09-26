#!/usr/bin/env bash
# Importe les personnages Firebase dans la base locale : `pnpm import:personnages`
#   pnpm import:personnages              → export + simulation (rien n'est écrit)
#   pnpm import:personnages --importer   → export + import réel
#   pnpm import:personnages --sans-export --importer   → réutilise l'export existant
# Prérequis : comptes déjà importés (`pnpm import:firebase` ou connexion des joueurs),
# FIREBASE_SERVICE_ACCOUNT_KEY dans legacy/.env. Exports et rapport dans ~/vtt-export.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
RAPPORT="$EXPORT/rapport-personnages.ndjson"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

IMPORTER=0; EXPORTER=1
for a in "$@"; do
  case "$a" in
    --importer) IMPORTER=1 ;;
    --sans-export) EXPORTER=0 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

[ -f backend/character/.env ] || { echo "Lance d'abord : pnpm dev --preparer" >&2; exit 1; }

etape "Build des outils"
pnpm turbo run build --filter=@vtt/firebase-export --filter=@vtt/character --output-logs=errors-only

if [ "$EXPORTER" = 1 ]; then
  [ -f legacy/.env ] || { echo "legacy/.env introuvable (FIREBASE_SERVICE_ACCOUNT_KEY)" >&2; exit 1; }
  etape "Export Firestore : personnages, salles, systèmes, inventaires, bonus"
  node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
    --collection cartes --collection users --collection Salle --collection gameSystems \
    --collection Inventaire --collection Bonus --recursive --out "$EXPORT"
fi

# Compte identity_svc pour retrouver le compte migré de chaque UID Firebase
IDENTITY_DATABASE_URL="$(grep -E '^DATABASE_URL=' backend/identity/.env | cut -d= -f2-)"
export IDENTITY_DATABASE_URL

# Stockage S3 (mêmes réglages qu'identity) : avatars embarqués dans les anciennes fiches
while IFS= read -r ligne; do export "$ligne"; done < <(grep -E '^S3_[A-Z_]+=' backend/identity/.env || true)

if [ "$IMPORTER" = 1 ]; then
  etape "Import des personnages"
  node --env-file=backend/character/.env backend/character/dist/import/cli.js \
    --export "$EXPORT" --rapport "$RAPPORT"
else
  etape "Simulation (rien n'est écrit) — relance avec --importer pour importer"
  node --env-file=backend/character/.env backend/character/dist/import/cli.js \
    --export "$EXPORT" --rapport "$RAPPORT" --simulation
fi
