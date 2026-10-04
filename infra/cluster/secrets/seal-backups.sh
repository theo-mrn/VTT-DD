#!/usr/bin/env bash
# Secrets des sauvegardes de la base (docs : infra/cluster/backup/RESTORE.md), scellés pour le
# namespace data, à partir de ~/.config/vtt/staging.env (rien n'est affiché) :
#   logical-backup-rclone  dumps quotidiens chiffrés (rclone crypt) vers le bucket vtt-logical-backups
#   pg-wal-r2              WAL et sauvegardes de base (plugin Barman Cloud) vers le bucket vtt-pg-wal
# Variables : R2_ENDPOINT, BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY,
#   WAL_R2_ACCESS_KEY_ID, WAL_R2_SECRET_ACCESS_KEY, BACKUP_VAULT_PASSWORD, BACKUP_VAULT_SALT.
# Rejouable : remplace les deux fichiers sans toucher aux autres secrets (seal-staging.sh).
set -euo pipefail
cd "$(dirname "$0")"
env_file=${VTT_ENV_FILE:-$HOME/.config/vtt/staging.env}
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
for v in R2_ENDPOINT BACKUP_R2_ACCESS_KEY_ID BACKUP_R2_SECRET_ACCESS_KEY WAL_R2_ACCESS_KEY_ID \
  WAL_R2_SECRET_ACCESS_KEY BACKUP_VAULT_PASSWORD BACKUP_VAULT_SALT; do
  [ -n "${!v:-}" ] || { echo "Variable manquante : $v" >&2; exit 1; }
done
command -v kubeseal >/dev/null || { echo "kubeseal introuvable" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# rclone obscure : rclone local, sinon son image Docker
obscure() {
  if command -v rclone >/dev/null; then rclone obscure "$1"
  else docker run --rm rclone/rclone:1.71 obscure "$1"; fi
}

# secret <nom> <clé=valeur>… : Secret en clair (fichier temporaire) scellé pour data
secret() {
  local nom=$1 kv
  shift
  {
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: data\n' "$nom"
    printf 'type: Opaque\nstringData:\n'
    for kv in "$@"; do printf '  %s: %s\n' "${kv%%=*}" "$(printf '%s' "${kv#*=}" | jq -Rs .)"; done
  } >"$tmp/secret.yaml"
  kubeseal --format yaml --controller-namespace kube-system \
    --controller-name sealed-secrets-controller <"$tmp/secret.yaml" >"staging/data-$nom.yaml"
  rm -f "$tmp/secret.yaml"
  echo "staging/data-$nom.yaml" >&2
}

secret logical-backup-rclone \
  "RCLONE_CONFIG_R2_TYPE=s3" "RCLONE_CONFIG_R2_PROVIDER=Cloudflare" \
  "RCLONE_CONFIG_R2_ENDPOINT=$R2_ENDPOINT" \
  "RCLONE_CONFIG_R2_ACCESS_KEY_ID=$BACKUP_R2_ACCESS_KEY_ID" \
  "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$BACKUP_R2_SECRET_ACCESS_KEY" \
  "RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true" \
  "RCLONE_CONFIG_VAULT_TYPE=crypt" "RCLONE_CONFIG_VAULT_REMOTE=r2:vtt-logical-backups/pg" \
  "RCLONE_CONFIG_VAULT_PASSWORD=$(obscure "$BACKUP_VAULT_PASSWORD")" \
  "RCLONE_CONFIG_VAULT_PASSWORD2=$(obscure "$BACKUP_VAULT_SALT")"

# Clés lues par l'ObjectStore Barman Cloud (infra/cluster/data/backup.yaml)
secret pg-wal-r2 \
  "ACCESS_KEY_ID=$WAL_R2_ACCESS_KEY_ID" "ACCESS_SECRET_KEY=$WAL_R2_SECRET_ACCESS_KEY"
