#!/usr/bin/env bash
# Retour dans le temps (PITR) de la base vtt-pg, en une commande (RESTORE.md § A).
#
#   infra/cluster/backup/pitr.sh "2026-10-04 14:59"          heure de Paris
#   infra/cluster/backup/pitr.sh "2026-10-04 14:59" --essai  vérifications et modification
#                                                             montrée, rien de poussé ni supprimé
#   infra/cluster/backup/pitr.sh "2026-10-04 14:59" --apercu ce que la restauration changerait
#                                                             dans les données (base temporaire)
#
# Postgres ne recule pas une base en marche : on la recrée depuis la sauvegarde de base, puis on
# rejoue le WAL jusqu'à l'instant voulu. Étapes :
#   1. vérifie que l'instant est couvert (après la première sauvegarde, avant maintenant) ;
#   2. force l'archivage du WAL en cours, pour que l'instant soit dans R2 ;
#   3. écrit la restauration dans le dépôt (bootstrap.recovery), avec une nouvelle lignée
#      d'archive pour ne jamais écraser l'ancienne, puis pousse ;
#   4. demande confirmation, supprime le cluster : Argo le recrée depuis l'archive ;
#   5. redémarre PgBouncer (nouvelle adresse et nouveaux certificats de la base) et vérifie ;
#   6. lance la première sauvegarde de base de la nouvelle lignée (sinon, pas de PITR avant la nuit).
# Tout ce qui a été écrit après l'instant choisi est perdu ; l'ancienne lignée reste dans R2.
set -euo pipefail
cd "$(dirname "$0")/../../.."

NS=data
CLUSTER=vtt-pg
CLUSTER_FILE=infra/cluster/data/postgres-cluster.yaml
RESTORE_TEST=infra/cluster/backup/restore-test.yaml
ARGO_APP=vtt-data

[ $# -ge 1 ] || { sed -n '2,8p' "$0" >&2; exit 2; }
quand=$1
essai=0
apercu=0
[ "${2:-}" = --essai ] && essai=1
[ "${2:-}" = --apercu ] && apercu=1

etape() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }
echec() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ─── 1. Instant visé, en UTC, et couverture de l'archive ──────────────────────────────────
etape "Instant visé"
cible=$(python3 - "$quand" <<'PY'
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
s = sys.argv[1].strip()
for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
    try:
        local = datetime.strptime(s, fmt).replace(tzinfo=ZoneInfo("Europe/Paris"))
        break
    except ValueError:
        pass
else:
    sys.exit("format attendu : AAAA-MM-JJ HH:MM[:SS] (heure de Paris)")
print(local.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00"))
PY
)
echo "$quand (Paris) = $cible"

lignee=$(kubectl -n $NS get cluster $CLUSTER \
  -o jsonpath='{.spec.plugins[?(@.name=="barman-cloud.cloudnative-pg.io")].parameters.serverName}')
lignee=${lignee:-$CLUSTER}
objet=$(kubectl -n $NS get cluster $CLUSTER \
  -o jsonpath='{.spec.plugins[?(@.name=="barman-cloud.cloudnative-pg.io")].parameters.barmanObjectName}')
premier=$(kubectl -n $NS get objectstore "$objet" \
  -o jsonpath="{.status.serverRecoveryWindow.$lignee.firstRecoverabilityPoint}")
[ -n "$premier" ] || echec "aucune sauvegarde de base terminée pour la lignée $lignee"
echo "lignée actuelle : $lignee · restaurable depuis $premier"
python3 - "$cible" "$premier" <<'PY' || echec "instant hors de la fenêtre restaurable"
import sys
from datetime import datetime, timezone
cible = datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S+00").replace(tzinfo=timezone.utc)
premier = datetime.fromisoformat(sys.argv[2].replace("Z", "+00:00"))
if cible <= premier: sys.exit(f"avant la première sauvegarde ({premier})")
if cible >= datetime.now(timezone.utc): sys.exit("dans le futur")
PY

# ─── 2. WAL archivé au-delà de l'instant visé ─────────────────────────────────────────────
etape "Archivage du WAL"
primaire=$(kubectl -n $NS get pods -l cnpg.io/cluster=$CLUSTER,role=primary -o name | head -1)
[ -n "$primaire" ] || echec "primaire introuvable"
psql_q() { kubectl -n $NS exec "${primaire#pod/}" -c postgres -- psql -d vtt -Atc "$1"; }
psql_q "select pg_switch_wal()" >/dev/null
for _ in $(seq 1 30); do
  archive=$(psql_q "select coalesce(last_archived_time, 'epoch') > '$cible' from pg_stat_archiver")
  [ "$archive" = t ] && break
  sleep 2
done
[ "$archive" = t ] || echec "le WAL de $cible n'est pas encore archivé (réessayer dans une minute)"
echo "WAL archivé au-delà de $cible"

# ─── Aperçu : l'instant visé restauré à part, comparé à la base actuelle ──────────────────
if [ $apercu = 1 ]; then
  etape "Aperçu : restauration temporaire (quelques minutes)"
  APERCU=$CLUSTER-apercu
  image=$(kubectl -n $NS get cluster $CLUSTER -o jsonpath='{.spec.imageName}')
  trap 'kubectl -n $NS delete cluster $APERCU --ignore-not-found --wait=false >/dev/null' EXIT
  kubectl apply -f - >/dev/null <<EOF2
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: $APERCU, namespace: $NS }
spec:
  instances: 1
  imageName: $image
  storage: { size: 5Gi, storageClass: local-path }
  resources:
    requests: { cpu: 100m, memory: 512Mi }
    limits: { memory: 1Gi }
  bootstrap:
    recovery:
      source: origin
      recoveryTarget: { targetTime: '$cible' }
  externalClusters:
    - name: origin
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters: { barmanObjectName: $objet, serverName: $lignee }
EOF2
  for _ in $(seq 1 90); do
    [ "$(kubectl -n $NS get cluster $APERCU -o jsonpath='{.status.phase}' 2>/dev/null)" = "Cluster in healthy state" ] && break
    sleep 10
  done
  [ "$(kubectl -n $NS get cluster $APERCU -o jsonpath='{.status.phase}')" = "Cluster in healthy state" ] ||
    echec "base temporaire pas prête après 15 min : kubectl -n $NS get cluster $APERCU"
  pod_apercu=$(kubectl -n $NS get pods -l cnpg.io/cluster=$APERCU,role=primary -o name | head -1)
  psql_apercu() { kubectl -n $NS exec "${pod_apercu#pod/}" -c postgres -- psql -d vtt -Atc "$1"; }

  etape "Comparaison avec la base actuelle"
  # Tables des services (partitions comprises dans leur table mère), avec leurs horodatages
  tables=$(psql_q "select n.nspname || '.' || c.relname,
      bool_or(a.attname = 'created_at'), bool_or(a.attname = 'updated_at')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname in ('identity','billing','campaign','characters','dice','history','audio')
      and c.relkind in ('r','p') and not c.relispartition and c.relname not like 'databasechangelog%'
    group by 1 order by 1")
  requetes=$(python3 - "$cible" "$tables" <<'PY'
import sys
cible, lignes = sys.argv[1], sys.argv[2].splitlines()
actuel, alors = [], []
for l in lignes:
    t, cree, maj = l.split("|")
    c = f"count(*) filter (where created_at > '{cible}')" if cree == "t" else "null"
    m = f"count(*) filter (where updated_at > '{cible}' and created_at <= '{cible}')" if maj == "t" and cree == "t" else (
        f"count(*) filter (where updated_at > '{cible}')" if maj == "t" else "null")
    actuel.append(f"select '{t}', count(*), {c}, {m} from {t}")
    alors.append(f"select '{t}', count(*) from {t}")
print(" union all ".join(actuel)); print(" union all ".join(alors))
PY
)
  maintenant=$(psql_q "$(echo "$requetes" | sed -n 1p)")
  a_l_instant=$(psql_apercu "$(echo "$requetes" | sed -n 2p)")
  python3 - "$maintenant" "$a_l_instant" "$quand" <<'PY'
import sys
maint = {l.split("|")[0]: l.split("|")[1:] for l in sys.argv[1].splitlines()}
alors = {l.split("|")[0]: int(l.split("|")[1]) for l in sys.argv[2].splitlines()}
lignes = []
for t, (n, cree, maj) in maint.items():
    n = int(n); a = alors.get(t, 0)
    cree = int(cree) if cree else None
    maj = int(maj) if maj else None
    supprimees = a - (n - cree) if cree is not None else (a - n if a > n else 0)
    perdues = cree if cree is not None else (n - a if n > a else 0)
    if n != a or perdues or maj or supprimees > 0:
        lignes.append((t, n, a, perdues, maj or 0, max(supprimees, 0)))
if not lignes:
    print(f"Aucune différence : la base est déjà dans l'état de {sys.argv[3]}.")
    sys.exit()
print(f"{'table':38} {'maintenant':>10} {'après':>8} {'perdues':>8} {'remises':>8} {'reviennent':>10}")
for t, n, a, p, m, s in sorted(lignes):
    print(f"{t:38} {n:>10} {a:>8} {p:>8} {m:>8} {s:>10}")
print()
print("perdues : lignes créées après l'instant visé · remises : modifiées depuis, reviennent à")
print("leur état d'alors · reviennent : supprimées depuis, restaurées")
PY
  echo
  echo "Aperçu seulement : la base actuelle n'a pas été touchée (base temporaire supprimée)."
  exit 0
fi

# ─── 3. Restauration écrite dans le dépôt ─────────────────────────────────────────────────
etape "Dépôt"
case $lignee in
  "$CLUSTER") nouvelle=$CLUSTER-pitr1 ;;
  "$CLUSTER"-pitr*) nouvelle=$CLUSTER-pitr$((${lignee##*-pitr} + 1)) ;;
  *) nouvelle=$lignee-pitr1 ;;
esac
python3 - "$CLUSTER_FILE" "$RESTORE_TEST" "$cible" "$lignee" "$nouvelle" "$objet" <<'PY'
import re, sys
fichier, test, cible, lignee, nouvelle, objet = sys.argv[1:]
s = open(fichier).read()
bloc = f"""  # Création depuis l'archive (PITR vers {cible}, pitr.sh). Ne sert qu'à la création du
  # cluster : sans effet tant qu'il existe. Une base neuve partirait de initdb (database vtt,
  # owner vtt_owner, configmap vtt-pg-init / schemas.sql).
  bootstrap:
    recovery:
      source: origin
      recoveryTarget:
        targetTime: '{cible}'

  # Lignée d'archive lue pour la restauration
  externalClusters:
    - name: origin
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters:
          barmanObjectName: {objet}
          serverName: {lignee}
"""
# Remplace tout ce qui va du commentaire du bootstrap (ou de bootstrap:) jusqu'au bloc suivant
debut = re.search(r"(?m)^  # Création depuis l'archive.*\n|^  bootstrap:\n", s)
fin = re.search(r"(?m)^  # Un rôle par service|^  managed:", s)
if not debut or not fin or fin.start() < debut.start():
    sys.exit("bloc bootstrap introuvable dans " + fichier)
s = s[: debut.start()] + bloc + "\n" + s[fin.start():]
# serverName de l'archivage : seulement dans la section plugins
i = s.index("\n  plugins:\n") + 1
suite = re.compile(r"(?m)^  [A-Za-z#]").search(s, i + len("  plugins:\n"))
j = suite.start() if suite else len(s)
section, n = re.subn(r"(?m)^(\s+serverName: )\S+$", r"\g<1>" + nouvelle, s[i:j])
if n != 1:
    sys.exit("serverName de l'archivage introuvable dans plugins")
s = s[:i] + section + s[j:]
open(fichier, "w").write(s)
t = open(test).read()
t, n = re.subn(r"(?m)^(\s+serverName: )\S+$", r"\g<1>" + nouvelle, t)
if n != 1:
    sys.exit("serverName du test de restauration introuvable")
open(test, "w").write(t)
PY
echo "restauration vers $cible, archive lue : $lignee, nouvelle lignée : $nouvelle"
git --no-pager diff --stat -- "$CLUSTER_FILE" "$RESTORE_TEST"

if [ $essai = 1 ]; then
  git --no-pager diff -- "$CLUSTER_FILE" "$RESTORE_TEST"
  git checkout -q -- "$CLUSTER_FILE" "$RESTORE_TEST"
  echo
  echo "Essai : modifications annulées, rien poussé ni supprimé."
  exit 0
fi

git add "$CLUSTER_FILE" "$RESTORE_TEST"
git commit -q -m "feat(backup): pitr de la base vers $cible [skip ci]"
git pull -q --rebase origin main
git push -q origin main
commit=$(git rev-parse HEAD)
kubectl -n argocd annotate application $ARGO_APP argocd.argoproj.io/refresh=normal --overwrite >/dev/null
for _ in $(seq 1 30); do
  kubectl -n argocd get application $ARGO_APP -o jsonpath='{.status.sync.revisions}' | grep -q "$commit" && break
  sleep 5
done
echo "poussé ($(git rev-parse --short HEAD)) et lu par Argo"

# ─── 4. Confirmation, puis recréation depuis l'archive ────────────────────────────────────
etape "Restauration"
printf 'Tout ce qui a été écrit après %s (Paris) sera perdu. Taper RESTAURER pour continuer : ' "$quand"
read -r reponse
[ "$reponse" = RESTAURER ] || echec "abandon : le dépôt décrit la restauration, mais la base n'a pas été touchée"
kubectl -n $NS delete cluster $CLUSTER --wait=true
for _ in $(seq 1 60); do kubectl -n $NS get cluster $CLUSTER >/dev/null 2>&1 && break; sleep 5; done
echo "recréé par Argo, restauration en cours…"
for _ in $(seq 1 120); do
  [ "$(kubectl -n $NS get cluster $CLUSTER -o jsonpath='{.status.phase}' 2>/dev/null)" = "Cluster in healthy state" ] && break
  sleep 10
done
[ "$(kubectl -n $NS get cluster $CLUSTER -o jsonpath='{.status.phase}')" = "Cluster in healthy state" ] ||
  echec "la base n'est pas prête après 20 min : kubectl -n $NS get cluster $CLUSTER"

# ─── 5. PgBouncer et vérifications ────────────────────────────────────────────────────────
etape "Reconnexion"
kubectl -n $NS rollout restart deploy/$CLUSTER-pooler >/dev/null
kubectl -n $NS rollout status deploy/$CLUSTER-pooler --timeout=180s
primaire=$(kubectl -n $NS get pods -l cnpg.io/cluster=$CLUSTER,role=primary -o name | head -1)
echo "en restauration : $(psql_q 'select pg_is_in_recovery()') · lignée Postgres : $(psql_q 'select timeline_id from pg_control_checkpoint()')"
sleep 30
kubectl -n vtt-staging get pods --no-headers | awk '$2 != "1/1" && $3 != "Completed" { print "  pas prêt : " $1, $3 }'

# ─── 6. Première sauvegarde de base de la nouvelle lignée ─────────────────────────────────
# Sans elle, aucun retour dans le temps n'est possible sur cette lignée avant la nuit suivante
etape "Sauvegarde de base de la lignée $nouvelle"
sauvegarde=$CLUSTER-pitr-$(date -u +%Y%m%d%H%M)
kubectl apply -f - <<EOF2 >/dev/null
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata: { name: $sauvegarde, namespace: $NS }
spec:
  cluster: { name: $CLUSTER }
  method: plugin
  pluginConfiguration: { name: barman-cloud.cloudnative-pg.io }
EOF2
for _ in $(seq 1 60); do
  phase=$(kubectl -n $NS get backup "$sauvegarde" -o jsonpath='{.status.phase}' 2>/dev/null)
  case $phase in completed | failed) break ;; esac
  sleep 10
done
[ "$phase" = completed ] || echec "sauvegarde $sauvegarde : ${phase:-pas terminée} (kubectl -n $NS get backup)"
echo "sauvegarde $sauvegarde terminée"
echo
echo "Base revenue à $quand (Paris). Ancienne lignée conservée dans R2 : $lignee."
