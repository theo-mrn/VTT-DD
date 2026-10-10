#!/usr/bin/env bash
# Secret R2 de l'archivage continu de la PRODUCTION (WAL et sauvegardes de base du cluster
# vtt-pg-prod, plugin Barman Cloud), scellé pour le namespace data dans
# infra/cluster/secrets/prod/data-pg-prod-wal-r2.yaml.
#
#   infra/cluster/secrets/seal-wal-prod.sh
#
# Bucket et jeton propres à la prod (bucket vtt-pg-prod-wal, jeton R2 limité à ce bucket) :
# une erreur sur l'archive du staging ne touche pas celle de la prod, et inversement.
# Les clés sont demandées au clavier sans écho : elles ne passent ni par un fichier ni par
# l'historique du shell. Seule la version scellée est écrite.
#
# Ne touche à aucun autre secret, contrairement à seal-prod.sh qui les fait tous tourner.
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
