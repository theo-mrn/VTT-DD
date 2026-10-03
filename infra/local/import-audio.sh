#!/usr/bin/env bash
# Importe les sons de l'ancienne app dans la base locale : `pnpm import:audio`
#   pnpm import:audio             → simulation (rien n'est écrit)
#   pnpm import:audio --importer  → import réel (sons, playlists, musique en pause)
# ORDRE : campagnes (`pnpm import:campaigns --importer`) puis sons : une salle dont la
# campagne n'est pas importée est ignorée (voir le rapport). Les envois de l'ancienne
# app sont copiés dans le bucket local (stockage S3 de `pnpm dev`), puis analysés par le
# worker. Exports lus dans ~/vtt-export : sound_templates.ndjson, cartes.ndjson,
# rtdb-rooms.json (pour les réexporter : pnpm import:campaigns). Rejouable, mais pas
# après la bascule : une playlist supprimée depuis reviendrait.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
RAPPORT="$EXPORT/rapport-audio.ndjson"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

IMPORTER=0
for a in "$@"; do
  case "$a" in
    --importer) IMPORTER=1 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

for f in backend/audio/.env backend/campaign/.env; do
  [ -f "$f" ] || { echo "$f introuvable. Lance d'abord : pnpm dev --preparer" >&2; exit 1; }
done
[ -f "$EXPORT/sound_templates.ndjson" ] || {
  echo "$EXPORT/sound_templates.ndjson introuvable : export Firestore des sons absent" >&2
  exit 1
}

etape "Build"
pnpm turbo run build --filter=@vtt/audio --output-logs=errors-only

# Lecture seule : salle de l'ancienne app → campagne importée (campaign_svc)
CAMPAIGN_DATABASE_URL="$(grep -E '^DATABASE_URL=' backend/campaign/.env | cut -d= -f2-)"
export CAMPAIGN_DATABASE_URL

ARGS=(--export "$EXPORT" --report "$RAPPORT")
[ -f "$EXPORT/rtdb-rooms.json" ] && ARGS+=(--rtdb "$EXPORT/rtdb-rooms.json")
if [ "$IMPORTER" = 1 ]; then
  etape "Import des sons"
  node --env-file=backend/audio/.env backend/audio/dist/import/cli.js "${ARGS[@]}" --importer
else
  etape "Simulation (rien n'est écrit) — relance avec --importer pour importer"
  node --env-file=backend/audio/.env backend/audio/dist/import/cli.js "${ARGS[@]}"
fi
