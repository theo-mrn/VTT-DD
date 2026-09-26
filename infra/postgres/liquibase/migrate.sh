#!/usr/bin/env bash
# Applique les migrations Liquibase d'un service avec son rôle propriétaire (<schéma>_owner).
#
#   infra/postgres/liquibase/migrate.sh identity                           # update
#   infra/postgres/liquibase/migrate.sh identity update-testing-rollback   # CI : applique, annule, réapplique
#   infra/postgres/liquibase/migrate.sh identity status --verbose
#
# Connexion : PGHOST, PGPORT, PGDATABASE (défauts : localhost, 5432, vtt).
# Mot de passe du rôle propriétaire : LIQUIBASE_OWNER_PASSWORD (défaut : mot de passe de dev).
# En prod, ce n'est pas ce script qui migre : c'est le Job Liquibase (hook Argo CD PreSync).
set -euo pipefail

# 4.33.0 : dernière version sous licence Apache 2.0 (la 5.x est passée en FSL-1.1).
# Épinglée par digest (index multi-architecture), comme les actions GitHub par SHA.
IMAGE='liquibase/liquibase:4.33.0@sha256:e116c935ba22b59a22165207f65c268e363269de30bb1fedacff3755c2abaa8c'

service="${1:?usage : migrate.sh <service> [commande liquibase…]}"
shift
commande=("$@")
[ ${#commande[@]} -eq 0 ] && commande=(update)

racine="$(cd "$(dirname "$0")/../../.." && pwd)"
dossier="$racine/backend/$service/db"
[ -f "$dossier/changelog.yaml" ] || { echo "Aucun changelog : $dossier/changelog.yaml" >&2; exit 1; }

# Le service character utilise le schéma « characters » (mot réservé SQL)
schema="$service"
[ "$service" = character ] && schema=characters

hote="${PGHOST:-localhost}"
# Depuis un conteneur Docker Desktop (macOS), « localhost » désigne le conteneur lui-même
if [ "$(uname)" = Darwin ] && { [ "$hote" = localhost ] || [ "$hote" = 127.0.0.1 ]; }; then
  hote=host.docker.internal
fi

# Identifiants passés par variables d'environnement : jamais visibles dans la liste des processus
exec docker run --rm --network host \
  -v "$dossier:/liquibase/changelog:ro" \
  -e LIQUIBASE_COMMAND_URL="jdbc:postgresql://$hote:${PGPORT:-5432}/${PGDATABASE:-vtt}" \
  -e LIQUIBASE_COMMAND_USERNAME="${schema}_owner" \
  -e LIQUIBASE_COMMAND_PASSWORD="${LIQUIBASE_OWNER_PASSWORD:-${schema}-owner-dev}" \
  "$IMAGE" \
  --search-path=/liquibase/changelog \
  --changelog-file=changelog.yaml \
  --default-schema-name="$schema" \
  --liquibase-schema-name="$schema" \
  "${commande[@]}"
