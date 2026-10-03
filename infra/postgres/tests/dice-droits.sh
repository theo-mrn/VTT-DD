#!/usr/bin/env bash
# Vérifie le schéma dice (service dice) APRÈS les migrations Liquibase :
#  - le rôle du service (dice_svc) lit et écrit les données ;
#  - les contraintes protègent jets, préférences et inventaire ;
#  - dice_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase,
#    ni lire les schémas des autres services.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${DICE_SVC_PASSWORD:-dice-dev}" \
    psql -U dice_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

jet=$(uuid)
campagne=$(uuid)
auteur=$(uuid)
colonnes="id, campaign_id, author_id, author_name, source, visibility, outcome"

echo "== dice_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO rolls ($colonnes, dice, dice_count, dice_faces, total, output)
         VALUES ('$jet', '$campagne', '$auteur', 'Aria', 'free', 'public', '{}',
                 '[{\"faces\": 20, \"values\": [{\"value\": 17, \"kept\": true, \"exploded\": false}]}]',
                 1, 20, 17, '1d20 = [17] = 17');
         INSERT INTO legacy_ids VALUES ('test', 'rolls/x/rolls/$jet', '$jet');
         INSERT INTO preferences (user_id, skin_id) VALUES ('$auteur', 'gold');
         INSERT INTO inventory (user_id, skin_id, source) VALUES ('$auteur', 'kyber_or', 'import');
         UPDATE preferences SET sound = false WHERE user_id = '$auteur';
         SELECT count(*) FROM rolls WHERE author_id = '$auteur';") \
  && echo "  jet, legacy_ids, préférences, inventaire : $r" || ko "insert : $r"

echo "== contraintes =="
insert() { svc "INSERT INTO rolls ($colonnes$1) VALUES (gen_random_uuid(), $2);"; }
r=$(insert "" "'$campagne', '$auteur', 'A', 'magie', 'public', '{}'")
echo "$r" | grep -q rolls_source && echo "  source connue" || ko "source : $r"
r=$(insert "" "'$campagne', '$auteur', 'A', 'free', 'secret', '{}'")
echo "$r" | grep -q rolls_visibility && echo "  visibilité connue" || ko "visibilité : $r"
r=$(insert "" "'$campagne', NULL, 'A', 'free', 'public', '{}'")
echo "$r" | grep -q rolls_author && echo "  auteur obligatoire (sauf import)" || ko "auteur : $r"
r=$(insert "" "NULL, '$auteur', 'A', 'free', 'public', '{}'")
echo "$r" | grep -q rolls_personal && echo "  jet sans campagne : personnel (self)" || ko "personnel : $r"
r=$(insert ", notation" "'$campagne', '$auteur', 'A', 'free', 'public', '{}', repeat('1', 501)")
echo "$r" | grep -q rolls_notation_length && echo "  notation : 500 caractères au plus" || ko "notation : $r"
r=$(insert ", dice" "'$campagne', '$auteur', 'A', 'free', 'public', '{}', '{}'")
echo "$r" | grep -q rolls_dice_array && echo "  dés : tableau JSON" || ko "dice : $r"
r=$(insert ", idempotency_key" "'$campagne', '$auteur', 'A', 'free', 'public', '{}', 'court'")
echo "$r" | grep -q rolls_idempotency_key && echo "  clé d'idempotence : forme contrôlée" || ko "clé : $r"
r=$(svc "INSERT INTO rolls ($colonnes, idempotency_key) VALUES (gen_random_uuid(), '$campagne', '$auteur', 'A', 'free', 'public', '{}', 'cle-unique-01');
         INSERT INTO rolls ($colonnes, idempotency_key) VALUES (gen_random_uuid(), '$campagne', '$auteur', 'A', 'free', 'public', '{}', 'cle-unique-01');")
echo "$r" | grep -q rolls_idempotency && echo "  une clé d'idempotence par auteur" || ko "idempotence : $r"
r=$(svc "UPDATE preferences SET skin_id = 'Skin Invalide' WHERE user_id = '$auteur';")
echo "$r" | grep -q preferences_skin_id && echo "  skin : identifiant du catalogue" || ko "skin : $r"
r=$(svc "INSERT INTO inventory (user_id, skin_id, source) VALUES ('$auteur', 'gold', 'vol');")
echo "$r" | grep -q inventory_source && echo "  inventaire : origine connue" || ko "inventaire : $r"
r=$(svc "DELETE FROM rolls WHERE id = '$jet'; SELECT count(*) FROM legacy_ids WHERE roll_id = '$jet';")
[ "$r" = 0 ] && echo "  suppression du jet : legacy_ids suivent" || ko "cascade legacy_ids : $r"

echo "== outbox : notification sur le canal dice_outbox =="
r=$(PGPASSWORD="${DICE_SVC_PASSWORD:-dice-dev}" psql -U dice_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN dice_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt._.dice.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "dice_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== dice_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE rolls" \
  "ALTER TABLE rolls ADD COLUMN x int" \
  "TRUNCATE rolls" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users" \
  "SELECT * FROM campaign.campaigns" \
  "SELECT * FROM characters.characters"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

svc "DELETE FROM outbox WHERE subject = 'vtt._.dice.test';
     DELETE FROM rolls WHERE author_id = '$auteur';
     DELETE FROM preferences WHERE user_id = '$auteur';
     DELETE FROM inventory WHERE user_id = '$auteur';" >/dev/null

[ $echec -eq 0 ] && echo "dice : droits et contraintes OK" || echo "dice : des vérifications ont échoué"
exit $echec
