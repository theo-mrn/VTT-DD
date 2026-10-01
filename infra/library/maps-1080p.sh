#!/usr/bin/env bash
# Variantes 1080p des cartes animées de la bibliothèque (docs/carte.md, fond vidéo).
#
# Les originaux sont en VP8 3840×2160 à 60 i/s : sans décodage matériel nulle part, ils sont
# décodés par le processeur. La variante est en H.264 1920 px de large, 30 i/s, sans son (le fond
# de carte est muet), décodée par le matériel partout. Rangée à côté de l'original :
#   Map/Camp/Animated/Camp_Day.webm  →  Map/Camp/Animated/1080p/Camp_Day.mp4
# et son affiche (image à 1 s, 640 px, WebP), vignette du sélecteur de fond :
#   Map/Camp/Animated/1080p/Camp_Day.webp
#
# Usage : infra/library/maps-1080p.sh            (réencode dans $OUT, reprend où il en était)
#         infra/library/maps-1080p.sh --upload   (envoie $OUT sur R2, variables R2_* requises,
#           par exemple : set -a; . ~/.config/vtt/r2-library.env; set +a)
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
    AWS_DEFAULT_REGION=auto \
    aws s3 sync "$OUT/" "s3://$R2_BUCKET_NAME/" --endpoint-url "$R2_ENDPOINT" \
    --exclude "*" --include "*/1080p/*.mp4" --exclude "*.part.mp4" --content-type video/mp4 \
    --cache-control "public, max-age=31536000, immutable"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=auto \
    aws s3 sync "$OUT/" "s3://$R2_BUCKET_NAME/" --endpoint-url "$R2_ENDPOINT" \
    --exclude "*" --include "*/1080p/*.webp" --content-type image/webp \
    --cache-control "public, max-age=31536000, immutable"
  exit 0
fi

if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_videotoolbox; then
  ENC="-c:v h264_videotoolbox -b:v 5M -maxrate 7M -bufsize 10M -profile:v high"
else
  ENC="-c:v libx264 -preset slow -crf 23 -profile:v high"
fi

# Affiche : image à 1 s, 640 px, WebP (cwebp : le ffmpeg de Homebrew n'encode pas le WebP)
make_poster() {
  png="${2%.webp}.png"
  ffmpeg -nostdin -hide_banner -loglevel error -y -ss 1 -i "$1" -frames:v 1 \
    -vf "scale=640:-2:flags=lanczos" "$png" &&
    cwebp -quiet -q 80 "$png" -o "$2" &&
    rm -f "$png"
}

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
  poster="${dest%.mp4}.webp"
  if [ -s "$dest" ]; then
    [ -s "$poster" ] || make_poster "$dest" "$poster" || echo "  affiche en échec : $rel" >&2
    continue
  fi
  mkdir -p "$(dirname "$dest")"
  echo "[$i/$total] $rel"
  # shellcheck disable=SC2086
  if nice -n 15 ffmpeg -nostdin -hide_banner -loglevel error -y -i "$CDN$rel" -an \
    -vf "scale=1920:-2:flags=lanczos,fps=30" $ENC -tag:v avc1 -movflags +faststart \
    "$dest.part.mp4"; then
    mv "$dest.part.mp4" "$dest"
    make_poster "$dest" "$poster" || echo "  affiche en échec : $rel" >&2
  else
    rm -f "$dest.part.mp4"
    echo "  échec : $rel" >&2
  fi
done
echo "Terminé : $OUT"
