#!/usr/bin/env bash
# Importe les comptes Firebase dans la base locale : `pnpm import:firebase`
#   1. exporte les comptes (avec leurs hash) et les paramètres de hachage du projet
#   2. exporte de Firestore les profils (users), le catalogue des titres (titles),
#      les clés d'API (apiKeys), les liens du bot Discord (discordLinks), les
#      amitiés (friendships) et les demandes d'ami (requests)
#   3. écrit les paramètres de hachage dans backend/identity/.env
#   4. importe le tout dans identity (rejouable : ce qui est déjà importé est ignoré)
# Identifiants : FIREBASE_SERVICE_ACCOUNT_KEY dans legacy/.env.
# Les exports (hash, e-mails) vont dans ~/vtt-export, hors du dépôt, en 0600.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPORT="${VTT_EXPORT_DIR:-$HOME/vtt-export}"
etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }

[ -f legacy/.env ] || { echo "legacy/.env introuvable (FIREBASE_SERVICE_ACCOUNT_KEY)" >&2; exit 1; }
[ -f backend/identity/.env ] || { echo "Lance d'abord : pnpm dev --preparer" >&2; exit 1; }

etape "Build des outils"
pnpm turbo run build --filter=@vtt/firebase-export --filter=@vtt/identity --output-logs=errors-only

etape "Export des comptes Firebase"
node --env-file=legacy/.env tools/firebase-export/dist/auth.js --out "$EXPORT"

etape "Export Firestore : profils, titres, clés d'API, liens Discord"
node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
  --collection users --collection titles --collection apiKeys --collection discordLinks \
  --out "$EXPORT"

etape "Export Firestore : amitiés et demandes d'ami (sous-collections)"
node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
  --collection friendships --collection requests --recursive --out "$EXPORT"

etape "Configuration d'identity"
node tools/firebase-export/dist/configurer-identity.js "$EXPORT/hash-config.json"

etape "Import dans la base"
node --env-file=backend/identity/.env backend/identity/dist/import/cli.js \
  --auth "$EXPORT/comptes.json" --profils "$EXPORT/users.ndjson" \
  --titres "$EXPORT/titles.ndjson" \
  --amis "$EXPORT/friendships.ndjson" --demandes "$EXPORT/requests.ndjson" \
  --cles "$EXPORT/apiKeys.ndjson" --discord "$EXPORT/discordLinks.ndjson"

etape "Terminé — relance pnpm dev pour qu'identity lise les paramètres de hachage"
