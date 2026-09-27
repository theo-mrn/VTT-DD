#!/usr/bin/env bash
# Gabarit des secrets de NATS et Valkey : écrit sur la sortie standard les 5 Secrets, avec des
# mots de passe aléatoires identiques des deux côtés (serveurs dans messaging, clients dans
# vtt-staging et vtt-prod). Aucun mot de passe n'est versionné : rediriger HORS du dépôt.
#
#   bash infra/messaging/generate-secrets.sh > ~/vtt-messaging-secrets.yaml
#   kubectl apply -f ~/vtt-messaging-secrets.yaml && rm ~/vtt-messaging-secrets.yaml
#
# Voir « Déploiement » dans docs/bus.md (rotation, vérification).
set -euo pipefail

# Hexadécimal (sans encodage dans nats://… et redis://…) précédé d'une lettre : NATS lit
# $NATS_…_PASSWORD comme une valeur brute de sa configuration, et un mot de passe qui commence
# par un chiffre y serait lu comme un nombre (le serveur refuse de démarrer).
pw() { printf 'p%s' "$(openssl rand -hex 32)"; }

nats_sys=$(pw)
nats_staging=$(pw)
nats_prod=$(pw)
valkey_staging=$(pw)
valkey_prod=$(pw)

# secret <nom> <namespace> <clé=valeur>…
secret() {
  local name=$1 namespace=$2 kv
  shift 2
  printf -- '---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: %s\n' \
    "$name" "$namespace"
  printf 'type: Opaque\nstringData:\n'
  for kv in "$@"; do printf "  %s: '%s'\n" "${kv%%=*}" "${kv#*=}"; done
}

# Serveurs (namespace messaging)
secret nats-accounts messaging \
  "SYS_PASSWORD=$nats_sys" "STAGING_PASSWORD=$nats_staging" "PROD_PASSWORD=$nats_prod"
secret valkey-staging-users messaging "default=$valkey_staging"
secret valkey-prod-users messaging "default=$valkey_prod"

# Clients (services, secretEnv des infra/gitops/<env>/*.yaml)
secret messaging-credentials vtt-staging \
  "NATS_PASSWORD=$nats_staging" "REDIS_PASSWORD=$valkey_staging"
secret messaging-credentials vtt-prod \
  "NATS_PASSWORD=$nats_prod" "REDIS_PASSWORD=$valkey_prod"
