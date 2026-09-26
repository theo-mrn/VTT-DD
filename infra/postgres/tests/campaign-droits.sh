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
joueur=$(uuid)
# Code de salle aléatoire (hexadécimal en majuscules : forme acceptée par rooms_code_forme)
code=$(uuid | tr -d '-' | cut -c1-6 | tr 'a-z' 'A-Z')

echo "== campaign_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO rooms (id, nom, system_id, system_version, owner_id, code)
         VALUES ('$salle', 'Test', 'dnd-classic', '1.0.0', '$mj', '$code');
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
r=$(svc "INSERT INTO room_members (room_id, user_id, role) VALUES ('$salle', '$joueur', 'joueur');
         INSERT INTO room_bans (room_id, user_id, banni_par) VALUES ('$salle', gen_random_uuid(), '$mj');
         INSERT INTO room_sessions (id, room_id, prevue_le, titre, cree_par)
         VALUES (gen_random_uuid(), '$salle', now() + interval '1 day', 'Session 1', '$mj');
         INSERT INTO room_messages (id, room_id, auteur_id, texte) VALUES (gen_random_uuid(), '$salle', '$mj', 'Bonjour');
         UPDATE room_characters SET incarne_par = '$joueur' WHERE room_id = '$salle'; SELECT 'ok';") \
  && echo "  bannis, sessions, messages, personnage incarné : $r" || ko "parité : $r"

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

r=$(svc "INSERT INTO rooms (id, nom, system_id, system_version, owner_id, code)
         VALUES (gen_random_uuid(), 'Doublon', 'dnd-classic', '1.0.0', '$mj', '$code');")
echo "$r" | grep -q rooms_code_unique && echo "  code de salle unique" || ko "code unique : $r"
r=$(svc "UPDATE rooms SET code = 'abc-12' WHERE id = '$salle';")
echo "$r" | grep -q rooms_code_forme && echo "  code de salle : 6 majuscules ou chiffres" || ko "forme du code : $r"
r=$(svc "UPDATE rooms SET max_joueurs = 0 WHERE id = '$salle';")
echo "$r" | grep -q rooms_max_joueurs && echo "  joueurs max bornés" || ko "max_joueurs : $r"
r=$(svc "INSERT INTO room_messages (id, room_id, auteur_id, texte) VALUES (gen_random_uuid(), '$salle', '$mj', repeat('x', 1001));")
echo "$r" | grep -q room_messages_texte && echo "  message : 1 000 caractères au plus" || ko "texte : $r"
r=$(svc "INSERT INTO room_sessions (id, room_id, prevue_le, titre, cree_par) VALUES (gen_random_uuid(), '$salle', now(), '', '$mj');")
echo "$r" | grep -q room_sessions_titre && echo "  session : titre non vide" || ko "titre : $r"
# (le personnage engagé plus haut a été retiré avec le combat : on en engage deux)
r=$(svc "INSERT INTO room_characters (room_id, character_id, owner_id, camp, ajoute_par, incarne_par)
         VALUES ('$salle', gen_random_uuid(), '$joueur', 'joueurs', '$joueur', '$joueur');
         INSERT INTO room_characters (room_id, character_id, owner_id, camp, ajoute_par, incarne_par)
         VALUES ('$salle', gen_random_uuid(), '$joueur', 'joueurs', '$joueur', '$joueur');")
echo "$r" | grep -q room_characters_incarne_par && echo "  un seul personnage incarné par membre" || ko "incarné unique : $r"
r=$(svc "INSERT INTO room_characters (room_id, character_id, owner_id, camp, ajoute_par, incarne_par)
         VALUES ('$salle', gen_random_uuid(), '$mj', 'joueurs', '$mj', gen_random_uuid());")
echo "$r" | grep -q room_characters_incarne_par_membre && echo "  incarné par un membre seulement" || ko "incarné membre : $r"
r=$(svc "INSERT INTO room_characters (room_id, character_id, owner_id, camp, ajoute_par, incarne_par)
         VALUES ('$salle', gen_random_uuid(), '$mj', 'joueurs', '$mj', '$joueur');
         DELETE FROM room_members WHERE room_id = '$salle' AND user_id = '$joueur';
         SELECT count(*) FILTER (WHERE incarne_par IS NULL) || '/' || count(*) FROM room_characters WHERE room_id = '$salle';")
[ "$r" = 1/1 ] && echo "  départ du membre : personnage libéré" || ko "libération : $r"

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
r=$(svc "SELECT (SELECT count(*) FROM room_members WHERE room_id = '$salle')
                + (SELECT count(*) FROM room_bans WHERE room_id = '$salle')
                + (SELECT count(*) FROM room_sessions WHERE room_id = '$salle')
                + (SELECT count(*) FROM room_messages WHERE room_id = '$salle');")
[ "$r" = 0 ] || ko "cascade à la suppression : $r ligne(s) restante(s)"

[ $echec -eq 0 ] && echo "campaign : droits et contraintes OK" || echo "campaign : des vérifications ont échoué"
exit $echec
