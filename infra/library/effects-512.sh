#!/usr/bin/env bash
# Variantes 512 px des effets animés de la bibliothèque (gabarits de mesure, docs/carte.md).
#
# Les effets sont dessinés dans des formes (cône, cercle) : leur image est copiée dans WebGL à
# chaque image affichée. Les originaux (VP8 avec transparence, 600 à 800 px) passent en VP9 avec
# transparence, 512 px au plus, 24 i/s, sans son : copie 1,4 à 2,4 fois plus légère. Rangée à
# côté de l'original :  Effect/Cone/cone1.webm  →  Effect/Cone/512/cone1.webm
#
# Usage : infra/library/effects-512.sh            (réencode dans $OUT, reprend où il en était)
#         infra/library/effects-512.sh --upload   (envoie $OUT sur R2, variables R2_* requises,
#           par exemple : set -a; . ~/.config/vtt/r2-library.env; set +a)
# Compatible bash 3.2 (macOS). Le décodeur libvpx est requis : celui de ffmpeg perd la transparence.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAPPINGS="$ROOT/frontend/public/asset-mappings.json"
OUT="${OUT:-$HOME/.cache/vtt-effects-512}"
CDN="https://assets.yner.fr/"

if [ "${1:-}" = "--upload" ]; then
  : "${R2_ENDPOINT:?R2_ENDPOINT manquant}" "${R2_BUCKET_NAME:?R2_BUCKET_NAME manquant}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID manquant}" "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY manquant}"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=auto \
    aws s3 sync "$OUT/" "s3://$R2_BUCKET_NAME/" --endpoint-url "$R2_ENDPOINT" \
    --exclude "*" --include "Effect/*/512/*.webm" --exclude "*.part.webm" \
    --content-type video/webm --cache-control "public, max-age=31536000, immutable"
  exit 0
fi

LIST="$(node -e '
  const a = require(process.argv[1]);
  for (const x of a)
    if (/\.webm$/i.test(x.path) && x.category.startsWith("Effect") && x.path.startsWith(process.argv[2]))
      console.log(x.path.slice(process.argv[2].length));
' "$MAPPINGS" "$CDN")"

printf '%s\n' "$LIST" | while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  dest="$OUT/$(dirname "$rel")/512/$(basename "$rel")"
  if [ -s "$dest" ]; then continue; fi
  mkdir -p "$(dirname "$dest")"
  echo "$rel"
  if nice -n 15 ffmpeg -nostdin -hide_banner -loglevel error -y -c:v libvpx -i "$CDN$rel" -an \
    -vf "scale='min(512,iw)':-2:flags=lanczos,fps=24" -c:v libvpx-vp9 -pix_fmt yuva420p \
    -b:v 0 -crf 34 -row-mt 1 -auto-alt-ref 0 "$dest.part.webm"; then
    mv "$dest.part.webm" "$dest"
  else
    rm -f "$dest.part.webm"
    echo "  échec : $rel" >&2
  fi
done
echo "Terminé : $OUT"
