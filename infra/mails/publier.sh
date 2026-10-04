#!/usr/bin/env bash
# Publie les templates d'e-mails sur R2 (bucket kourrier-templates), où Kourrier les lit.
# Ils sont pris en compte en moins d'une minute (cache de Kourrier), sans redéploiement.
#
# Prérequis : `npx wrangler login` (compte Cloudflare propriétaire du bucket).
#
# Usage, depuis la racine du dépôt :
#   bash infra/mails/publier.sh            # publie tout
#   bash infra/mails/publier.sh --dry-run  # liste ce qui serait publié
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/infra/mails/templates"

BUCKET=kourrier-templates
SIMULATION=false
[[ ${1:-} == --dry-run ]] && SIMULATION=true

# Un template invalide ne serait détecté qu'à l'envoi (dead-letter queue de Kourrier) :
# vérifier au moins que chaque modèle a un objet et un corps.
for dossier in */*/*/; do
  [[ -f $dossier/subject.txt ]] || { echo "$dossier : subject.txt manquant" >&2; exit 1; }
  [[ -f $dossier/body.html || -f $dossier/body.txt ]] || {
    echo "$dossier : body.html ou body.txt requis" >&2; exit 1; }
done

find . -type f \( -name '*.html' -o -name '*.txt' \) | sed 's#^\./##' | sort | while read -r f; do
  case $f in
    *.html) type='text/html; charset=utf-8' ;;
    *) type='text/plain; charset=utf-8' ;;
  esac
  if $SIMULATION; then
    echo "publierait $BUCKET/$f"
  else
    npx -y wrangler r2 object put "$BUCKET/$f" --file "$f" --content-type "$type" --remote >/dev/null
    echo "publié     $BUCKET/$f"
  fi
done
