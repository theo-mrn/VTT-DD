#!/usr/bin/env bash
# Vérifie le schéma characters (service character) APRÈS les migrations Liquibase :
#  - le rôle du service (characters_svc) lit et écrit les données ;
#  - les contraintes protègent les personnages ;
#  - characters_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${CHARACTERS_SVC_PASSWORD:-characters-dev}" \
    psql -U characters_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
etat() { echo "'{\"type\":\"$1\",\"systeme\":{\"id\":\"$2\",\"version\":\"1.0.0\"},\"creation\":true}'"; }

id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
id=$(echo "$id" | tr 'A-Z' 'a-z')

echo "== characters_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO characters (id, owner_id, nom, system_id, system_version, type, etat)
         VALUES ('$id', gen_random_uuid(), 'Test', 'dnd-classic', '1.0.0', 'personnage', $(etat personnage dnd-classic));
         SELECT count(*) FROM characters WHERE id = '$id';") \
  && echo "  insert + select : $r" || ko "insert characters : $r"
r=$(svc "UPDATE characters SET version = version + 1 WHERE id = '$id';
         INSERT INTO legacy_ids VALUES ('test', 'x-$id', '$id'); SELECT 'ok';") \
  && echo "  update + legacy_ids : $r" || ko "update/legacy_ids : $r"

echo "== contraintes =="
r=$(svc "UPDATE characters SET nom = '' WHERE id = '$id';")
echo "$r" | grep -q characters_nom_longueur && echo "  nom obligatoire" || ko "nom vide : $r"
r=$(svc "UPDATE characters SET version = 0 WHERE id = '$id';")
echo "$r" | grep -q characters_version_positive && echo "  version positive" || ko "version : $r"
r=$(svc "UPDATE characters SET etat = '[]' WHERE id = '$id';")
echo "$r" | grep -q characters_etat_objet && echo "  état en objet JSON" || ko "état tableau : $r"
r=$(svc "UPDATE characters SET etat = $(etat vehicule dnd-classic) WHERE id = '$id';")
echo "$r" | grep -q characters_etat_coherent && echo "  état cohérent avec les colonnes" || ko "cohérence : $r"
r=$(svc "INSERT INTO legacy_ids VALUES ('test', 'y-$id', gen_random_uuid());")
echo "$r" | grep -q legacy_ids_character_id_fkey && echo "  legacy_ids vers un personnage existant" || ko "fk legacy_ids : $r"

echo "== outbox : notification sur le canal characters_outbox =="
r=$(PGPASSWORD="${CHARACTERS_SVC_PASSWORD:-characters-dev}" psql -U characters_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN characters_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt._.character.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "characters_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== characters_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE characters" \
  "ALTER TABLE characters ADD COLUMN x int" \
  "TRUNCATE characters" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

svc "DELETE FROM outbox WHERE subject = 'vtt._.character.test'; DELETE FROM characters WHERE id = '$id';" >/dev/null

[ $echec -eq 0 ] && echo "characters : droits et contraintes OK" || echo "characters : des vérifications ont échoué"
exit $echec
