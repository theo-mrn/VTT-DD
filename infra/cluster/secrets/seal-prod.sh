#!/usr/bin/env bash
# Secrets de la production, scellés pour le cluster (Sealed Secrets) dans
# infra/cluster/secrets/prod/ (docs/deploiement.md, « Production »). Seuls les fichiers scellés
# sont commités : les valeurs en clair ne quittent jamais la machine.
#
#   infra/cluster/secrets/seal-prod.sh
#
# Neufs, propres à la prod : mots de passe PostgreSQL (cluster vtt-pg-prod), Valkey de prod,
# secret interne, clés JWT, secret d'envoi audio.
# Relus dans le cluster (mêmes comptes externes que le staging, décision du 2026-10-09) :
#   - mot de passe NATS du compte PROD (messaging/nats-accounts) ;
#   - R2 (même bucket), Google et Discord OAuth, Kourrier, Firebase (identity-secrets,
#     campaign-secrets du staging), Stripe live et secret du webhook (billing-secrets),
#     Cloudflare Realtime (voice-secrets).
#
# Relancer le script fait tourner TOUS les secrets de prod : sessions perdues, services
# redémarrés. Prérequis : kubectl (accès au cluster), kubeseal, jq, node, openssl.
set -euo pipefail

racine=$(cd "$(dirname "$0")/../../.." && pwd)
sortie=$racine/infra/cluster/secrets/prod
for cmd in kubectl kubeseal jq node openssl; do
  command -v "$cmd" >/dev/null || { echo "$cmd introuvable" >&2; exit 1; }
done

# Hexadécimal précédé d'une lettre : sans encodage dans les URL, jamais lu comme un nombre (NATS)
pw() { printf 'p%s' "$(openssl rand -hex 32)"; }

# Valeur d'un secret existant du cluster (vide si la clé manque)
lire() { kubectl -n "$1" get secret "$2" -o json | jq -r --arg k "$3" '.data[$k] // empty | @base64d'; }

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
    # CloudNativePG ne relit un mot de passe de rôle géré que si son Secret porte ce label
    [ "$namespace" != data ] || printf '  labels:\n    cnpg.io/reload: "true"\n'
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

# ─── Valeurs reprises du staging ─────────────────────────────────────────────────────────
S=vtt-staging
nats_prod=$(lire messaging nats-accounts PROD_PASSWORD)
[ -n "$nats_prod" ] || { echo "Mot de passe NATS PROD introuvable (messaging/nats-accounts)" >&2; exit 1; }
r2=()
for k in R2_ENDPOINT R2_BUCKET_NAME R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_URL; do
  v=$(lire $S campaign-secrets "$k")
  [ -n "$v" ] || { echo "$k introuvable dans $S/campaign-secrets" >&2; exit 1; }
  r2+=("$k=$v")
done
externes=()
for k in KOURRIER_API_KEY SMTP_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DISCORD_CLIENT_ID \
  DISCORD_CLIENT_SECRET FIREBASE_SCRYPT_SIGNER_KEY FIREBASE_SCRYPT_SALT_SEPARATOR \
  FIREBASE_SCRYPT_ROUNDS FIREBASE_SCRYPT_MEM_COST; do
  externes+=("$k=$(lire $S identity-secrets "$k")")
done
stripe_key=$(lire $S billing-secrets STRIPE_SECRET_KEY)
stripe_webhook=$(lire $S billing-secrets STRIPE_WEBHOOK_SECRET)
kourrier=$(lire $S identity-secrets KOURRIER_API_KEY)
cloudflare=()
for k in CLOUDFLARE_REALTIME_APP_ID CLOUDFLARE_REALTIME_APP_TOKEN CLOUDFLARE_TURN_KEY_ID \
  CLOUDFLARE_TURN_KEY_TOKEN; do
  cloudflare+=("$k=$(lire $S voice-secrets "$k")")
done

# ─── PostgreSQL de prod (vtt-pg-prod) : un rôle propriétaire et un rôle de service ───────
base=vtt
pooler=vtt-pg-prod-pooler.data.svc:5432 # PgBouncer, mode transaction
direct=vtt-pg-prod-rw.data.svc:5432     # LISTEN du relais d'outbox : jamais par PgBouncer
for s in identity billing campaign characters dice history audio; do
  owner=$(pw)
  svc=$(pw)
  # Rôles gérés par CNPG (data, préfixe pg-prod-) ; propriétaire relu par les Jobs Liquibase
  secret data "pg-prod-$s-owner" kubernetes.io/basic-auth "username=${s}_owner" "password=$owner"
  secret vtt-prod "pg-$s-owner" kubernetes.io/basic-auth "username=${s}_owner" "password=$owner"
  secret data "pg-prod-$s" kubernetes.io/basic-auth "username=${s}_svc" "password=$svc"
  printf -v "url_$s" '%s' "postgresql://${s}_svc:$svc@$pooler/$base"
  printf -v "direct_$s" '%s' "postgresql://${s}_svc:$svc@$direct/$base"
done
secret data pg-prod-backup-ro kubernetes.io/basic-auth "username=backup_ro" "password=$(pw)"

# ─── Bus : NATS (compte PROD, déjà créé) et Valkey de prod ───────────────────────────────
valkey_prod=$(pw)
secret messaging valkey-prod-users Opaque "default=$valkey_prod"
secret vtt-prod messaging-credentials Opaque \
  "NATS_PASSWORD=$nats_prod" "REDIS_PASSWORD=$valkey_prod"

# ─── Services ─────────────────────────────────────────────────────────────────────────────
interne=$(pw)
jwks=$(node -e '
  const { generateKeyPairSync, randomUUID } = require("node:crypto");
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  process.stdout.write(JSON.stringify([{ ...jwk, kid: randomUUID(), alg: "EdDSA", use: "sig" }]));
')

secret vtt-prod identity-secrets Opaque \
  "DATABASE_URL=$url_identity" "DATABASE_DIRECT_URL=$direct_identity" \
  "INTERNAL_API_SECRET=$interne" "JWT_PRIVATE_JWKS=$jwks" "${r2[@]}" "${externes[@]}"
secret vtt-prod billing-secrets Opaque \
  "DATABASE_URL=$url_billing" "DATABASE_DIRECT_URL=$direct_billing" \
  "STRIPE_SECRET_KEY=$stripe_key" "STRIPE_WEBHOOK_SECRET=$stripe_webhook" \
  "INTERNAL_API_SECRET=$interne" "KOURRIER_API_KEY=$kourrier"
secret vtt-prod campaign-secrets Opaque \
  "DATABASE_URL=$url_campaign" "DATABASE_DIRECT_URL=$direct_campaign" \
  "INTERNAL_API_SECRET=$interne" "${r2[@]}"
secret vtt-prod character-secrets Opaque \
  "DATABASE_URL=$url_characters" "DATABASE_DIRECT_URL=$direct_characters" \
  "INTERNAL_API_SECRET=$interne" "${r2[@]}"
secret vtt-prod dice-secrets Opaque \
  "DATABASE_URL=$url_dice" "DATABASE_DIRECT_URL=$direct_dice" \
  "INTERNAL_API_SECRET=$interne"
secret vtt-prod history-secrets Opaque \
  "DATABASE_URL=$url_history" "INTERNAL_API_SECRET=$interne"
secret vtt-prod audio-secrets Opaque \
  "DATABASE_URL=$url_audio" "DATABASE_DIRECT_URL=$direct_audio" \
  "INTERNAL_API_SECRET=$interne" "AUDIO_UPLOAD_SECRET=$(pw)" "${r2[@]}"
secret vtt-prod realtime-secrets Opaque "INTERNAL_API_SECRET=$interne"
secret vtt-prod voice-secrets Opaque "${cloudflare[@]}"

echo "Secrets scellés dans $sortie :" >&2
ls "$sortie" >&2
