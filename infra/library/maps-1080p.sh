#!/usr/bin/env bash
# Variantes 1080p des cartes animées de la bibliothèque (docs/carte.md, fond vidéo).
#
# Les originaux sont en VP8 3840×2160 à 60 i/s : sans décodage matériel nulle part, ils sont
# décodés par le processeur. La variante est en H.264 1920 px de large, 30 i/s, sans son (le fond
# de carte est muet), décodée par le matériel partout. Rangée à côté de l'original :
#   Map/Camp/Animated/Camp_Day.webm  →  Map/Camp/Animated/1080p/Camp_Day.mp4
#
# Usage : infra/library/maps-1080p.sh            (réencode dans $OUT, reprend où il en était)
#         infra/library/maps-1080p.sh --upload   (envoie $OUT sur R2, variables R2_* requises)
# Compatible bash 3.2 (macOS). Encodeur matériel VideoToolbox s'il existe, sinon libx264.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAPPINGS="$ROOT/frontend/public/asset-mappings.json"
OUT="${OUT:-$HOME/.cache/vtt-maps-1080p}"
CDN="https://assets.yner.fr/"

if [ "${1:-}" = "--upload" ]; then
  : "${R2_ENDPOINT:?R2_ENDPOINT manquant}" "${R2_BUCKET_NAME:?R2_BUCKET_NAME manquant}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID manquant}" "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY manquant}"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 sync "$OUT/" "s3://$R2_BUCKET_NAME/" --endpoint-url "$R2_ENDPOINT" \
    --exclude "*" --include "*/1080p/*.mp4" --content-type video/mp4 \
    --cache-control "public, max-age=31536000, immutable"
  exit 0
fi

if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_videotoolbox; then
  ENC="-c:v h264_videotoolbox -b:v 5M -maxrate 7M -bufsize 10M -profile:v high"
else
  ENC="-c:v libx264 -preset slow -crf 23 -profile:v high"
fi

# Cartes animées de la bibliothèque (chemins relatifs au CDN)
LIST="$(node -e '
  const a = require(process.argv[1]);
  for (const x of a)
    if (/\.(webm|mp4)$/i.test(x.path) && x.category.startsWith("Map") && x.path.startsWith(process.argv[2]))
      console.log(x.path.slice(process.argv[2].length));
' "$MAPPINGS" "$CDN")"

total=$(printf '%s\n' "$LIST" | grep -c . || true)
i=0
printf '%s\n' "$LIST" | while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  i=$((i + 1))
  dir="$(dirname "$rel")"
  base="$(basename "$rel")"
  dest="$OUT/$dir/1080p/${base%.*}.mp4"
  if [ -s "$dest" ]; then continue; fi
  mkdir -p "$(dirname "$dest")"
  echo "[$i/$total] $rel"
  # shellcheck disable=SC2086
  if nice -n 15 ffmpeg -nostdin -hide_banner -loglevel error -y -i "$CDN$rel" -an \
    -vf "scale=1920:-2:flags=lanczos,fps=30" $ENC -tag:v avc1 -movflags +faststart \
    "$dest.part.mp4"; then
    mv "$dest.part.mp4" "$dest"
  else
    rm -f "$dest.part.mp4"
    echo "  échec : $rel" >&2
  fi
done
echo "Terminé : $OUT"
