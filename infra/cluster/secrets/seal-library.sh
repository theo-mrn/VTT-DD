#!/usr/bin/env bash
# Secrets du service library seuls (docs/bibliotheque.md § Déploiement), scellés pour un
# environnement déjà en place, sans faire tourner les autres secrets (seal-staging.sh et
# seal-prod.sh, qui les couvrent aussi, les régénèrent tous) :
#
#   infra/cluster/secrets/seal-library.sh staging|prod
#
# Rôles library_owner (Jobs Liquibase) et library_svc (service), mots de passe tirés au hasard.
# Relancer le script fait tourner ces deux mots de passe : CloudNativePG les relit (label
# cnpg.io/reload), le service redémarre avec son nouveau DATABASE_URL.
set -euo pipefail

env=${1:-}
case "$env" in
  staging) prefixe=pg- pooler=vtt-pg-pooler.data.svc:5432 ;;
  prod) prefixe=pg-prod- pooler=vtt-pg-prod-pooler.data.svc:5432 ;;
  *) echo "usage : seal-library.sh staging|prod" >&2; exit 2 ;;
esac
racine=$(cd "$(dirname "$0")/../../.." && pwd)
sortie=$racine/infra/cluster/secrets/$env
for cmd in kubeseal jq openssl; do
  command -v "$cmd" >/dev/null || { echo "$cmd introuvable" >&2; exit 1; }
done

# Hexadécimal précédé d'une lettre : sans encodage dans les URL
pw() { printf 'p%s' "$(openssl rand -hex 32)"; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# secret <namespace> <nom> <type> <clé=valeur>… : même format que seal-staging.sh
secret() {
  local namespace=$1 nom=$2 type=$3 kv
  shift 3
  {
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: %s\n' "$nom" "$namespace"
    [ "$namespace" != data ] || printf '  labels:\n    cnpg.io/reload: "true"\n'
    printf 'type: %s\nstringData:\n' "$type"
    for kv in "$@"; do
      printf '  %s: %s\n' "${kv%%=*}" "$(printf '%s' "${kv#*=}" | jq -Rs .)"
    done
  } >"$tmp/secret.yaml"
  kubeseal --format yaml --controller-namespace kube-system \
    --controller-name sealed-secrets-controller <"$tmp/secret.yaml" >"$sortie/$namespace-$nom.yaml"
  rm -f "$tmp/secret.yaml"
}

owner=$(pw)
svc=$(pw)
secret data "${prefixe}library-owner" kubernetes.io/basic-auth "username=library_owner" "password=$owner"
secret "vtt-$env" pg-library-owner kubernetes.io/basic-auth "username=library_owner" "password=$owner"
secret data "${prefixe}library" kubernetes.io/basic-auth "username=library_svc" "password=$svc"
secret "vtt-$env" library-secrets Opaque "DATABASE_URL=postgresql://library_svc:$svc@$pooler/vtt"

echo "Secrets de library scellés dans $sortie" >&2
