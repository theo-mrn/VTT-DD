#!/usr/bin/env bash
# Scelle le secret R2 de l'archivage WAL de la prod (prod/data-pg-prod-wal-r2.yaml).
# Clés saisies au clavier ; ne touche à aucun autre secret, contrairement à seal-prod.sh.
set -euo pipefail
cd "$(dirname "$0")"
command -v kubeseal >/dev/null || { echo "kubeseal introuvable" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq introuvable" >&2; exit 1; }

read -rp "Access Key ID du jeton R2 (bucket vtt-pg-prod-wal) : " access_key
read -rsp "Secret Access Key : " secret_key
echo
[ -n "$access_key" ] && [ -n "$secret_key" ] || { echo "Clé vide, abandon" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
{
  printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: pg-prod-wal-r2\n  namespace: data\n'
  printf 'type: Opaque\nstringData:\n'
  printf '  ACCESS_KEY_ID: %s\n' "$(printf '%s' "$access_key" | jq -Rs .)"
  printf '  ACCESS_SECRET_KEY: %s\n' "$(printf '%s' "$secret_key" | jq -Rs .)"
} >"$tmp/secret.yaml"
kubeseal --format yaml --controller-namespace kube-system \
  --controller-name sealed-secrets-controller <"$tmp/secret.yaml" >prod/data-pg-prod-wal-r2.yaml
echo "prod/data-pg-prod-wal-r2.yaml écrit (scellé)" >&2
