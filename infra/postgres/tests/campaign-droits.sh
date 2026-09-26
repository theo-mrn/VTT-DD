#!/usr/bin/env bash
# Vérifie le schéma campaign (service campaign) APRÈS les migrations Liquibase :
#  - le rôle du service (campaign_svc) lit et écrit les données ;
#  - les contraintes protègent campagnes, membres, invitations et combats ;
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

campagne=$(uuid)
mj=$(uuid)
perso=$(uuid)
joueur=$(uuid)
# Code de campagne aléatoire (hexadécimal en majuscules : forme acceptée par campaigns_code_format)
code=$(uuid | tr -d '-' | cut -c1-6 | tr 'a-z' 'A-Z')

echo "== campaign_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO campaigns (id, name, system_id, system_version, owner_id, code)
         VALUES ('$campagne', 'Test', 'dnd-classic', '1.0.0', '$mj', '$code');
         INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ('$campagne', '$mj', 'gm');
         INSERT INTO campaign_characters (campaign_id, character_id, owner_id, side, added_by)
         VALUES ('$campagne', '$perso', '$mj', 'enemies', '$mj');
         SELECT count(*) FROM campaign_members WHERE campaign_id = '$campagne';") \
  && echo "  campagne, membre, personnage engagé : $r" || ko "insert campagne : $r"
r=$(svc "INSERT INTO campaign_combats (campaign_id, id, mode, started_by) VALUES ('$campagne', gen_random_uuid(), 'individual', '$mj');
         INSERT INTO campaign_combat_participants (campaign_id, character_id, turn_order, side) VALUES ('$campagne', '$perso', 0, 'enemies');
         UPDATE campaign_combats SET round = round + 1 WHERE campaign_id = '$campagne';
         INSERT INTO legacy_ids VALUES ('test', 'x-$campagne', '$campagne'); SELECT 'ok';") \
  && echo "  combat, participant, legacy_ids : $r" || ko "combat : $r"
r=$(svc "INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ('$campagne', '$joueur', 'player');
         INSERT INTO campaign_bans (campaign_id, user_id, banned_by) VALUES ('$campagne', gen_random_uuid(), '$mj');
         INSERT INTO campaign_sessions (id, campaign_id, scheduled_at, title, created_by)
         VALUES (gen_random_uuid(), '$campagne', now() + interval '1 day', 'Session 1', '$mj');
         INSERT INTO campaign_messages (id, campaign_id, author_id, body) VALUES (gen_random_uuid(), '$campagne', '$mj', 'Bonjour');
         UPDATE campaign_characters SET played_by = '$joueur' WHERE campaign_id = '$campagne'; SELECT 'ok';") \
  && echo "  bannis, sessions, messages, personnage incarné : $r" || ko "parité : $r"

echo "== contraintes =="
r=$(svc "UPDATE campaigns SET name = '' WHERE id = '$campagne';")
echo "$r" | grep -q campaigns_name_length && echo "  nom obligatoire" || ko "nom vide : $r"
r=$(svc "UPDATE campaign_members SET role = 'roi' WHERE campaign_id = '$campagne';")
echo "$r" | grep -q campaign_members_role && echo "  rôle connu" || ko "rôle : $r"
r=$(svc "UPDATE campaign_characters SET side = 'neutres' WHERE campaign_id = '$campagne';")
echo "$r" | grep -q campaign_characters_side && echo "  camp connu" || ko "camp : $r"
r=$(svc "INSERT INTO campaign_invitations (id, campaign_id, code_hash, created_by, expires_at, max_uses)
         VALUES (gen_random_uuid(), '$campagne', 'code-en-clair', '$mj', now(), 1);")
echo "$r" | grep -q campaign_invitations_code_hash && echo "  invitation : empreinte seulement" || ko "code_hash : $r"
r=$(svc "INSERT INTO campaign_invitations (id, campaign_id, code_hash, created_by, expires_at, max_uses, uses)
         VALUES (gen_random_uuid(), '$campagne', repeat('a', 64), '$mj', now(), 1, 2);")
echo "$r" | grep -q campaign_invitations_uses && echo "  invitation : utilisations bornées" || ko "uses : $r"
r=$(svc "UPDATE campaign_combats SET slots = '[\"players\"]' WHERE campaign_id = '$campagne';")
echo "$r" | grep -q campaign_combats_slots && echo "  créneaux seulement en mode slots" || ko "créneaux : $r"
r=$(svc "INSERT INTO campaign_combats (campaign_id, id, mode, started_by) VALUES ('$campagne', gen_random_uuid(), 'individual', '$mj');")
echo "$r" | grep -q campaign_combats_pkey && echo "  un seul combat par campagne" || ko "combat unique : $r"
r=$(svc "INSERT INTO campaign_combat_participants (campaign_id, character_id, turn_order, side) VALUES ('$campagne', gen_random_uuid(), 1, 'players');")
echo "$r" | grep -q campaign_combat_participants_character_fkey && echo "  participant forcément engagé" \
  || ko "participant non engagé : $r"
r=$(svc "DELETE FROM campaign_characters WHERE campaign_id = '$campagne'; SELECT count(*) FROM campaign_combat_participants WHERE campaign_id = '$campagne';")
[ "$r" = 0 ] && echo "  retrait de la campagne : sorti du combat" || ko "cascade participant : $r"

r=$(svc "INSERT INTO campaigns (id, name, system_id, system_version, owner_id, code)
         VALUES (gen_random_uuid(), 'Doublon', 'dnd-classic', '1.0.0', '$mj', '$code');")
echo "$r" | grep -q campaigns_code_unique && echo "  code de campagne unique" || ko "code unique : $r"
r=$(svc "UPDATE campaigns SET code = 'abc-12' WHERE id = '$campagne';")
echo "$r" | grep -q campaigns_code_format && echo "  code de campagne : 6 majuscules ou chiffres" || ko "forme du code : $r"
r=$(svc "UPDATE campaigns SET max_players = 0 WHERE id = '$campagne';")
echo "$r" | grep -q campaigns_max_players && echo "  joueurs max bornés" || ko "max_players : $r"
r=$(svc "INSERT INTO campaign_messages (id, campaign_id, author_id, body) VALUES (gen_random_uuid(), '$campagne', '$mj', repeat('x', 1001));")
echo "$r" | grep -q campaign_messages_body && echo "  message : 1 000 caractères au plus" || ko "body : $r"
r=$(svc "INSERT INTO campaign_sessions (id, campaign_id, scheduled_at, title, created_by) VALUES (gen_random_uuid(), '$campagne', now(), '', '$mj');")
echo "$r" | grep -q campaign_sessions_title && echo "  session : titre non vide" || ko "title : $r"
# (le personnage engagé plus haut a été retiré avec le combat : on en engage deux)
r=$(svc "INSERT INTO campaign_characters (campaign_id, character_id, owner_id, side, added_by, played_by)
         VALUES ('$campagne', gen_random_uuid(), '$joueur', 'players', '$joueur', '$joueur');
         INSERT INTO campaign_characters (campaign_id, character_id, owner_id, side, added_by, played_by)
         VALUES ('$campagne', gen_random_uuid(), '$joueur', 'players', '$joueur', '$joueur');")
echo "$r" | grep -q campaign_characters_played_by && echo "  un seul personnage incarné par membre" || ko "incarné unique : $r"
r=$(svc "INSERT INTO campaign_characters (campaign_id, character_id, owner_id, side, added_by, played_by)
         VALUES ('$campagne', gen_random_uuid(), '$mj', 'players', '$mj', gen_random_uuid());")
echo "$r" | grep -q campaign_characters_played_by_member && echo "  incarné par un membre seulement" || ko "incarné membre : $r"
r=$(svc "INSERT INTO campaign_characters (campaign_id, character_id, owner_id, side, added_by, played_by)
         VALUES ('$campagne', gen_random_uuid(), '$mj', 'players', '$mj', '$joueur');
         DELETE FROM campaign_members WHERE campaign_id = '$campagne' AND user_id = '$joueur';
         SELECT count(*) FILTER (WHERE played_by IS NULL) || '/' || count(*) FROM campaign_characters WHERE campaign_id = '$campagne';")
[ "$r" = 1/1 ] && echo "  départ du membre : personnage libéré" || ko "libération : $r"

echo "== outbox : notification sur le canal campaign_outbox =="
r=$(PGPASSWORD="${CAMPAIGN_SVC_PASSWORD:-campaign-dev}" psql -U campaign_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN campaign_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt._.campaign.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "campaign_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== campaign_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE campaigns" \
  "ALTER TABLE campaigns ADD COLUMN x int" \
  "TRUNCATE campaigns" \
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

# La suppression de la campagne emporte membres, engagements et combat (ON DELETE CASCADE)
svc "DELETE FROM outbox WHERE subject = 'vtt._.campaign.test'; DELETE FROM campaigns WHERE id = '$campagne';" >/dev/null
r=$(svc "SELECT (SELECT count(*) FROM campaign_members WHERE campaign_id = '$campagne')
                + (SELECT count(*) FROM campaign_bans WHERE campaign_id = '$campagne')
                + (SELECT count(*) FROM campaign_sessions WHERE campaign_id = '$campagne')
                + (SELECT count(*) FROM campaign_messages WHERE campaign_id = '$campagne');")
[ "$r" = 0 ] || ko "cascade à la suppression : $r ligne(s) restante(s)"

[ $echec -eq 0 ] && echo "campaign : droits et contraintes OK" || echo "campaign : des vérifications ont échoué"
exit $echec
