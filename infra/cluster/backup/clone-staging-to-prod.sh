#!/usr/bin/env bash
# Clonage UNIQUE des données du staging vers la production (docs/deploiement.md,
# « Production », étape 5) : pg_dump complet de la base `vtt` du cluster vtt-pg (superutilisateur
# local du pod), restauré dans vtt-pg-prod. Les rôles portent les mêmes noms des deux côtés
# (mots de passe différents) : propriétaires, droits et journaux Liquibase sont repris tels quels,
# les migrations de la prod repartent donc d'où en est le staging.
#
#   infra/cluster/backup/clone-staging-to-prod.sh            # vérifie, ne touche à rien
#   infra/cluster/backup/clone-staging-to-prod.sh --cloner   # clone pour de bon
#
# À lancer AVANT le premier démarrage des services de prod (ApplicationSet sans prod) : la base
# de prod doit être vide. Refuse si elle contient déjà des comptes (identity.users).
set -euo pipefail

cloner=0
[ "${1:-}" = --cloner ] && cloner=1
ns=data
src_cluster=vtt-pg
dst_cluster=vtt-pg-prod

primaire() {
  kubectl -n "$ns" get cluster "$1" -o jsonpath='{.status.currentPrimary}'
}
psql_in() { kubectl -n "$ns" exec -i "$1" -c postgres -- psql -v ON_ERROR_STOP=1 -tA -d vtt "${@:2}"; }

src=$(primaire $src_cluster)
dst=$(primaire $dst_cluster)
[ -n "$src" ] || { echo "Primaire de $src_cluster introuvable" >&2; exit 1; }
[ -n "$dst" ] || { echo "Primaire de $dst_cluster introuvable (la base de prod existe-t-elle ?)" >&2; exit 1; }
echo "Source : $src_cluster ($src) → destination : $dst_cluster ($dst)"

# Services de prod arrêtés : personne n'écrit pendant le clonage
if kubectl get ns vtt-prod >/dev/null 2>&1 &&
  [ -n "$(kubectl -n vtt-prod get deploy -o name 2>/dev/null)" ]; then
  echo "Des services tournent déjà dans vtt-prod : arrêtez-les avant de cloner." >&2
  exit 1
fi

# Base de prod vide (aucun compte)
comptes=$(psql_in "$dst" -c "select count(*) from information_schema.tables where table_schema = 'identity' and table_name = 'users'")
if [ "$comptes" != 0 ]; then
  n=$(psql_in "$dst" -c 'select count(*) from identity.users')
  [ "$n" = 0 ] || { echo "La base de prod contient déjà $n comptes : clonage refusé." >&2; exit 1; }
fi

compter() {
  psql_in "$1" -c "select schemaname || '.' || relname || ' ' || n_live_tup from pg_stat_user_tables order by 1"
}

if [ $cloner = 0 ]; then
  echo "Vérifications faites ; relancer avec --cloner pour copier les données."
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Dump du staging…"
kubectl -n "$ns" exec "$src" -c postgres -- \
  pg_dump --format=custom --no-subscriptions --no-publications -d vtt >"$tmp/vtt.dump"
ls -lh "$tmp/vtt.dump"
echo "Restauration dans la prod…"
kubectl -n "$ns" exec -i "$dst" -c postgres -- \
  pg_restore --clean --if-exists --no-subscriptions --no-publications --single-transaction \
  --exit-on-error -d vtt <"$tmp/vtt.dump"
psql_in "$dst" -c 'analyze' >/dev/null

echo "Comparaison des lignes (estimations après ANALYZE)…"
psql_in "$src" -c 'analyze' >/dev/null
diff <(compter "$src") <(compter "$dst") && echo "Identiques : clonage terminé."
