#!/usr/bin/env bash
# Secrets du staging, scellés pour le cluster (Sealed Secrets) dans infra/cluster/secrets/staging/.
# Seuls les fichiers scellés sont commités : les valeurs en clair ne quittent jamais la machine.
#
#   infra/cluster/secrets/seal-staging.sh [fichier d'environnement]
#
# Le fichier (par défaut ~/.config/vtt/staging.env, jamais dans le dépôt) donne les valeurs
# externes ; tout le reste (mots de passe Postgres, NATS, Valkey, secret interne, clés JWT,
# secret d'envoi audio) est tiré au hasard ici. Relancer le script fait tourner TOUS ces
# secrets : les sessions en cours tombent (nouvelles clés JWT), les services redémarrent.
#
# Variables attendues :
#   R2_ENDPOINT          https://<compte>.r2.cloudflarestorage.com
#   R2_BUCKET            bucket applicatif (portraits, cartes, sons)
#   R2_ACCESS_KEY_ID     clé du bucket applicatif
#   R2_SECRET_ACCESS_KEY
#   R2_PUBLIC_URL        domaine public du bucket (https://…)
# Facultatives (absentes : fonction coupée) :
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
#   SMTP_URL (smtp(s)://…), STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PREMIUM_PRICE_ID
#   FIREBASE_SCRYPT_SIGNER_KEY, FIREBASE_SCRYPT_SALT_SEPARATOR, FIREBASE_SCRYPT_ROUNDS,
#   FIREBASE_SCRYPT_MEM_COST (comptes importés de l'ancienne app)
#   BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY (bucket vtt-logical-backups, clé à part)
#   BACKUP_VAULT_PASSWORD, BACKUP_VAULT_SALT : chiffrement des sauvegardes (rclone crypt) ; à
#     garder aussi ailleurs (gestionnaire de mots de passe) : sans eux, aucune restauration
set -euo pipefail

env_file=${1:-$HOME/.config/vtt/staging.env}
racine=$(cd "$(dirname "$0")/../../.." && pwd)
sortie=$racine/infra/cluster/secrets/staging
[ -f "$env_file" ] || { echo "Fichier introuvable : $env_file" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$env_file"; set +a
for v in R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_URL; do
  [ -n "${!v:-}" ] || { echo "Variable manquante : $v" >&2; exit 1; }
done
command -v kubeseal >/dev/null || { echo "kubeseal introuvable" >&2; exit 1; }

# Hexadécimal précédé d'une lettre : sans encodage dans les URL, jamais lu comme un nombre (NATS)
pw() { printf 'p%s' "$(openssl rand -hex 32)"; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$sortie"

# secret <namespace> <nom> <type> <clé=valeur>… : écrit le Secret en clair (fichier temporaire),
# le scelle pour ce namespace et ce nom, et ne garde que la version scellée
secret() {
  local namespace=$1 nom=$2 type=$3 kv
  shift 3
  {
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: %s\n' "$nom" "$namespace"
    printf 'type: %s\nstringData:\n' "$type"
    for kv in "$@"; do
      [ -n "${kv#*=}" ] || continue # valeur facultative absente
      printf '  %s: %s\n' "${kv%%=*}" "$(printf '%s' "${kv#*=}" | jq -Rs .)"
    done
  } >"$tmp/secret.yaml"
  kubeseal --format yaml --controller-namespace kube-system \
    --controller-name sealed-secrets-controller <"$tmp/secret.yaml" >"$sortie/$namespace-$nom.yaml"
  rm -f "$tmp/secret.yaml"
}

# ─── PostgreSQL : un rôle propriétaire (migrations) et un rôle de service par schéma ─────────
base=vtt
pooler=vtt-pg-pooler.data.svc:5432 # PgBouncer, mode transaction
direct=vtt-pg-rw.data.svc:5432     # LISTEN du relais d'outbox : jamais par PgBouncer
for s in identity billing campaign characters dice history audio; do
  owner=$(pw)
  svc=$(pw)
  # Mots de passe lus par CloudNativePG (rôles gérés) dans data, et par les Jobs Liquibase
  # (propriétaire) dans vtt-staging
  secret data "pg-$s-owner" kubernetes.io/basic-auth "username=${s}_owner" "password=$owner"
  secret vtt-staging "pg-$s-owner" kubernetes.io/basic-auth "username=${s}_owner" "password=$owner"
  secret data "pg-$s" kubernetes.io/basic-auth "username=${s}_svc" "password=$svc"
  # bash 3.2 (macOS) : pas de tableau associatif, une variable par schéma
  printf -v "url_$s" '%s' "postgresql://${s}_svc:$svc@$pooler/$base"
  printf -v "direct_$s" '%s' "postgresql://${s}_svc:$svc@$direct/$base"
done
backup_ro=$(pw)
secret data pg-backup-ro kubernetes.io/basic-auth "username=backup_ro" "password=$backup_ro"

# ─── Bus : NATS (compte STAGING) et Valkey ────────────────────────────────────────────────
nats_staging=$(pw)
valkey_staging=$(pw)
# PROD : compte déclaré par la configuration NATS, inutilisé tant que la prod n'est pas déployée
secret messaging nats-accounts Opaque \
  "SYS_PASSWORD=$(pw)" "STAGING_PASSWORD=$nats_staging" "PROD_PASSWORD=$(pw)"
secret messaging valkey-staging-users Opaque "default=$valkey_staging"
secret vtt-staging messaging-credentials Opaque \
  "NATS_PASSWORD=$nats_staging" "REDIS_PASSWORD=$valkey_staging"

# ─── Services ─────────────────────────────────────────────────────────────────────────────
interne=$(pw)
jwks=$(node -e '
  const { generateKeyPairSync, randomUUID } = require("node:crypto");
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  process.stdout.write(JSON.stringify([{ ...jwk, kid: randomUUID(), alg: "EdDSA", use: "sig" }]));
')
s3=("S3_ENDPOINT=$R2_ENDPOINT" "S3_BUCKET=$R2_BUCKET" "S3_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID"
  "S3_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY" "S3_PUBLIC_URL=$R2_PUBLIC_URL")

secret vtt-staging identity-secrets Opaque \
  "DATABASE_URL=$url_identity" "DATABASE_DIRECT_URL=$direct_identity" \
  "INTERNAL_API_SECRET=$interne" "JWT_PRIVATE_JWKS=$jwks" "${s3[@]}" \
  "SMTP_URL=${SMTP_URL:-}" \
  "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}" \
  "DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID:-}" "DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET:-}" \
  "FIREBASE_SCRYPT_SIGNER_KEY=${FIREBASE_SCRYPT_SIGNER_KEY:-}" \
  "FIREBASE_SCRYPT_SALT_SEPARATOR=${FIREBASE_SCRYPT_SALT_SEPARATOR:-}" \
  "FIREBASE_SCRYPT_ROUNDS=${FIREBASE_SCRYPT_ROUNDS:-}" \
  "FIREBASE_SCRYPT_MEM_COST=${FIREBASE_SCRYPT_MEM_COST:-}"
secret vtt-staging billing-secrets Opaque \
  "DATABASE_URL=$url_billing" "INTERNAL_API_SECRET=$interne" \
  "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}" "STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}" \
  "STRIPE_PREMIUM_PRICE_ID=${STRIPE_PREMIUM_PRICE_ID:-}"
secret vtt-staging campaign-secrets Opaque \
  "DATABASE_URL=$url_campaign" "DATABASE_DIRECT_URL=$direct_campaign" \
  "INTERNAL_API_SECRET=$interne" "${s3[@]}"
secret vtt-staging character-secrets Opaque \
  "DATABASE_URL=$url_characters" "DATABASE_DIRECT_URL=$direct_characters" \
  "INTERNAL_API_SECRET=$interne" "${s3[@]}"
secret vtt-staging dice-secrets Opaque \
  "DATABASE_URL=$url_dice" "DATABASE_DIRECT_URL=$direct_dice" \
  "INTERNAL_API_SECRET=$interne"
secret vtt-staging history-secrets Opaque \
  "DATABASE_URL=$url_history" "INTERNAL_API_SECRET=$interne"
secret vtt-staging audio-secrets Opaque \
  "DATABASE_URL=$url_audio" "DATABASE_DIRECT_URL=$direct_audio" \
  "INTERNAL_API_SECRET=$interne" "AUDIO_UPLOAD_SECRET=$(pw)" "${s3[@]}"
secret vtt-staging realtime-secrets Opaque "INTERNAL_API_SECRET=$interne"

# ─── Sauvegarde logique (pg_dump chiffré vers un autre bucket R2) ─────────────────────────
# rclone obscure : rclone local, sinon son image Docker
obscure() {
  if command -v rclone >/dev/null; then rclone obscure "$1"
  else docker run --rm rclone/rclone:1.71 obscure "$1"; fi
}
if [ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]; then
  for v in BACKUP_R2_SECRET_ACCESS_KEY BACKUP_VAULT_PASSWORD BACKUP_VAULT_SALT; do
    [ -n "${!v:-}" ] || { echo "Variable manquante : $v" >&2; exit 1; }
  done
  secret data logical-backup-rclone Opaque \
    "RCLONE_CONFIG_R2_TYPE=s3" "RCLONE_CONFIG_R2_PROVIDER=Cloudflare" \
    "RCLONE_CONFIG_R2_ENDPOINT=$R2_ENDPOINT" \
    "RCLONE_CONFIG_R2_ACCESS_KEY_ID=$BACKUP_R2_ACCESS_KEY_ID" \
    "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$BACKUP_R2_SECRET_ACCESS_KEY" \
    "RCLONE_CONFIG_VAULT_TYPE=crypt" "RCLONE_CONFIG_VAULT_REMOTE=r2:vtt-logical-backups/pg" \
    "RCLONE_CONFIG_VAULT_PASSWORD=$(obscure "$BACKUP_VAULT_PASSWORD")" \
    "RCLONE_CONFIG_VAULT_PASSWORD2=$(obscure "$BACKUP_VAULT_SALT")"
fi

echo "Secrets scellés dans $sortie :" >&2
ls "$sortie" >&2
