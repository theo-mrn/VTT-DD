#!/usr/bin/env bash
# Vérifie le schéma archive (service archive) APRÈS les migrations Liquibase :
#  - le rôle du service (archive_svc) lit et écrit les tâches ;
#  - les contraintes protègent les sortes, les statuts, la source d'un export et l'unicité
#    d'un export en cours par campagne ;
#  - archive_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase,
#    ni lire les schémas des autres services.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${ARCHIVE_SVC_PASSWORD:-archive-dev}" \
    psql -U archive_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

compte=$(uuid)
campagne=$(uuid)

echo "== archive_svc : lecture et écriture des tâches =="
r=$(svc "INSERT INTO jobs (id, kind, user_id, source_campaign_id, keep_progress, status)
         VALUES ('$(uuid)', 'export', '$compte', '$campagne', true, 'pending');
         SELECT count(*) FROM jobs WHERE user_id = '$compte';") \
  && [ "$(echo "$r" | tail -1)" = 1 ] && echo "  écriture et lecture" || ko "écriture : $r"

echo "== contraintes =="
r=$(svc "INSERT INTO jobs (id, kind, user_id, source_campaign_id, keep_progress, status) VALUES ('$(uuid)', 'export', '$compte', '$campagne', true, 'pending');")
echo "$r" | grep -q jobs_one_per_campaign && echo "  un export en cours par campagne" || ko "unicité : $r"
r=$(svc "INSERT INTO jobs (id, kind, user_id, keep_progress, status) VALUES ('$(uuid)', 'backup', '$compte', true, 'pending');")
echo "$r" | grep -q jobs_kind && echo "  sorte connue" || ko "sorte : $r"
r=$(svc "INSERT INTO jobs (id, kind, user_id, keep_progress, status) VALUES ('$(uuid)', 'import', '$compte', true, 'done');")
echo "$r" | grep -q jobs_status && echo "  statut connu" || ko "statut : $r"
r=$(svc "INSERT INTO jobs (id, kind, user_id, keep_progress, status) VALUES ('$(uuid)', 'export', '$compte', true, 'pending');")
echo "$r" | grep -q jobs_source && echo "  un export a sa campagne source" || ko "source : $r"
r=$(svc "INSERT INTO jobs (id, kind, user_id, keep_progress, status, progress) VALUES ('$(uuid)', 'import', '$compte', true, 'pending', 2);")
echo "$r" | grep -q jobs_progress && echo "  avancement entre 0 et 1" || ko "avancement : $r"

echo "== archive_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE jobs" \
  "ALTER TABLE jobs ADD COLUMN x int" \
  "TRUNCATE jobs" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users" \
  "SELECT * FROM campaign.campaigns"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done
svc "DELETE FROM jobs WHERE user_id = '$compte';" >/dev/null
[ $echec -eq 0 ] && echo "archive : droits et contraintes OK" || echo "archive : des vérifications ont échoué"
exit $echec
