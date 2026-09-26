#!/usr/bin/env bash
# Vérifie le schéma campaign (service campaign) APRÈS les migrations Liquibase :
#  - le rôle du service (campaign_svc) lit et écrit les données ;
#  - les contraintes protègent salles, membres, invitations et combats ;
#  - campaign_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${CAMPAIGN_SVC_PASSWORD:-campaign-dev}" \
    psql -U campaign_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

salle=$(uuid)
mj=$(uuid)
perso=$(uuid)

echo "== campaign_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO rooms (id, nom, system_id, system_version, owner_id)
         VALUES ('$salle', 'Test', 'dnd-classic', '1.0.0', '$mj');
         INSERT INTO room_members (room_id, user_id, role) VALUES ('$salle', '$mj', 'mj');
         INSERT INTO room_characters (room_id, character_id, owner_id, camp, ajoute_par)
         VALUES ('$salle', '$perso', '$mj', 'adversaires', '$mj');
         SELECT count(*) FROM room_members WHERE room_id = '$salle';") \
  && echo "  salle, membre, personnage engagé : $r" || ko "insert salle : $r"
r=$(svc "INSERT INTO combats (room_id, id, mode, demarre_par) VALUES ('$salle', gen_random_uuid(), 'individuel', '$mj');
         INSERT INTO combat_participants (room_id, character_id, rang, camp) VALUES ('$salle', '$perso', 0, 'adversaires');
         UPDATE combats SET round = round + 1 WHERE room_id = '$salle';
         INSERT INTO legacy_ids VALUES ('test', 'x-$salle', '$salle'); SELECT 'ok';") \
  && echo "  combat, participant, legacy_ids : $r" || ko "combat : $r"

echo "== contraintes =="
r=$(svc "UPDATE rooms SET nom = '' WHERE id = '$salle';")
echo "$r" | grep -q rooms_nom_longueur && echo "  nom obligatoire" || ko "nom vide : $r"
r=$(svc "UPDATE room_members SET role = 'roi' WHERE room_id = '$salle';")
echo "$r" | grep -q room_members_role && echo "  rôle connu" || ko "rôle : $r"
r=$(svc "UPDATE room_characters SET camp = 'neutres' WHERE room_id = '$salle';")
echo "$r" | grep -q room_characters_camp && echo "  camp connu" || ko "camp : $r"
r=$(svc "INSERT INTO invitations (id, room_id, code_hash, cree_par, expire_le, utilisations_max)
         VALUES (gen_random_uuid(), '$salle', 'code-en-clair', '$mj', now(), 1);")
echo "$r" | grep -q invitations_code_hash && echo "  invitation : empreinte seulement" || ko "code_hash : $r"
r=$(svc "INSERT INTO invitations (id, room_id, code_hash, cree_par, expire_le, utilisations_max, utilisations)
         VALUES (gen_random_uuid(), '$salle', repeat('a', 64), '$mj', now(), 1, 2);")
echo "$r" | grep -q invitations_utilisations && echo "  invitation : utilisations bornées" || ko "utilisations : $r"
r=$(svc "UPDATE combats SET creneaux = '[\"joueurs\"]' WHERE room_id = '$salle';")
echo "$r" | grep -q combats_creneaux && echo "  créneaux seulement en mode creneaux" || ko "créneaux : $r"
r=$(svc "INSERT INTO combats (room_id, id, mode, demarre_par) VALUES ('$salle', gen_random_uuid(), 'individuel', '$mj');")
echo "$r" | grep -q combats_pkey && echo "  un seul combat par salle" || ko "combat unique : $r"
r=$(svc "INSERT INTO combat_participants (room_id, character_id, rang, camp) VALUES ('$salle', gen_random_uuid(), 1, 'joueurs');")
echo "$r" | grep -q combat_participants_room_id_character_id_fkey && echo "  participant forcément engagé" \
  || ko "participant non engagé : $r"
r=$(svc "DELETE FROM room_characters WHERE room_id = '$salle'; SELECT count(*) FROM combat_participants WHERE room_id = '$salle';")
[ "$r" = 0 ] && echo "  retrait de la salle : sorti du combat" || ko "cascade participant : $r"

echo "== outbox : notification sur le canal campaign_outbox =="
r=$(PGPASSWORD="${CAMPAIGN_SVC_PASSWORD:-campaign-dev}" psql -U campaign_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN campaign_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt._.room.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "campaign_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== campaign_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE rooms" \
  "ALTER TABLE rooms ADD COLUMN x int" \
  "TRUNCATE rooms" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users" \
  "SELECT * FROM characters.characters"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

# La suppression de la salle emporte membres, engagements et combat (ON DELETE CASCADE)
svc "DELETE FROM outbox WHERE subject = 'vtt._.room.test'; DELETE FROM rooms WHERE id = '$salle';" >/dev/null
r=$(svc "SELECT count(*) FROM room_members WHERE room_id = '$salle';")
[ "$r" = 0 ] || ko "cascade à la suppression : $r membre(s) restant(s)"

[ $echec -eq 0 ] && echo "campaign : droits et contraintes OK" || echo "campaign : des vérifications ont échoué"
exit $echec
