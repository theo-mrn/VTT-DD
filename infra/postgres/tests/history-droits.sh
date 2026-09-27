#!/usr/bin/env bash
# Vérifie le schéma history (service history) APRÈS les migrations Liquibase :
#  - le rôle du service (history_svc) ajoute et lit le journal, chaîne comprise ;
#  - les contraintes protègent les événements ;
#  - le journal est en ajout seul : ni history_svc ni même history_owner ne modifient,
#    suppriment ou vident un événement ; une altération faite en contournant les
#    triggers est détectée par history.verify_chain ;
#  - history_svc crée les partitions mensuelles (ensure_partitions) sans droit CREATE,
#    ne lit les partitions qu'à travers history.events, ne modifie pas son schéma, ni le
#    journal de Liquibase, ni les schémas des autres services.
# Chaque essai tourne dans une transaction annulée : rien ne reste dans le journal.
# Connexion : PGHOST, PGPORT, PGDATABASE ; superutilisateur PGUSER/PGPASSWORD (défaut vtt/vtt)
# pour le seul essai d'altération ; mots de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
# SQL lu sur l'entrée standard : chaque instruction affiche son résultat, quelle que
# soit la version de psql ; à la première erreur, psql s'arrête et la transaction est annulée
svc() {
  PGPASSWORD="${HISTORY_SVC_PASSWORD:-history-dev}" \
    psql -U history_svc -tAq -v ON_ERROR_STOP=1 -f - <<<"$1" 2>&1
}
owner() {
  PGPASSWORD="${HISTORY_OWNER_PASSWORD:-history-owner-dev}" \
    psql -U history_owner -tAq -v ON_ERROR_STOP=1 -f - <<<"$1" 2>&1
}
su() {
  PGPASSWORD="${PGPASSWORD:-vtt}" psql -U "${PGUSER:-vtt}" -tAq -v ON_ERROR_STOP=1 -f - <<<"$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

campagne=$(uuid)
colonnes="id, occurred_at, campaign_id, seq, type, version, actor_role, aggregate_type, aggregate_id, payload, correlation_id"
# Ajout comme le consommateur : inbox, tête verrouillée, seq + prev_hash, tête mise à jour
ajout() {
  cat <<SQL
INSERT INTO inbox (event_id, consumer) VALUES ('$1', 'test');
INSERT INTO campaign_heads VALUES ('$campagne', 0, NULL)
  ON CONFLICT (campaign_id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id;
INSERT INTO events ($colonnes, prev_hash)
  SELECT '$1', now(), '$campagne', h.last_seq + 1, 'character.hp_changed', 1, 'gm', 'character',
         'c1', '{"hp": $2}', 'test', h.last_hash
  FROM campaign_heads h WHERE h.campaign_id = '$campagne';
UPDATE campaign_heads h SET last_seq = e.seq, last_hash = e.hash
  FROM events e WHERE e.id = '$1' AND h.campaign_id = e.campaign_id;
SQL
}
e1=$(uuid); e2=$(uuid); e3=$(uuid)
chaine="$(ajout "$e1" 1) $(ajout "$e2" 2) $(ajout "$e3" 3)"

echo "== history_svc : ajout et lecture du journal, chaîne de hash =="
r=$(svc "BEGIN; $chaine
         SELECT count(*) || ' événements, seq ' || string_agg(seq::text, ',' ORDER BY seq)
           FROM events WHERE campaign_id = '$campagne';
         SELECT 'maillons cassés : ' || count(*) FROM verify_chain('$campagne');
         ROLLBACK;")
echo "$r" | grep -q "3 événements, seq 1,2,3" && echo "$r" | grep -q "maillons cassés : 0" \
  && echo "  3 événements chaînés, chaîne intacte" || ko "chaîne : $r"
r=$(svc "BEGIN; INSERT INTO events ($colonnes, hash) VALUES (gen_random_uuid(), now(), NULL, NULL,
           'user.profile_updated', 1, 'user', 'user', 'u1', '{}', 'test', sha256('faux'::bytea))
         RETURNING hash <> sha256('faux'::bytea); ROLLBACK;")
echo "$r" | grep -qx t && echo "  hash toujours recalculé par Postgres (événement global, sans chaîne)" \
  || ko "hash imposé : $r"

echo "== contraintes =="
insert() {
  svc "INSERT INTO events ($colonnes) VALUES (gen_random_uuid(), now(), $1);"
}
r=$(insert "'$campagne', 1, 'Pas Un Type', 1, 'gm', 'character', 'c1', '{}', 'c'")
echo "$r" | grep -q events_type && echo "  type : domaine.action" || ko "type : $r"
r=$(insert "'$campagne', 1, 'a.b', 1, 'pirate', 'character', 'c1', '{}', 'c'")
echo "$r" | grep -q events_actor_role && echo "  rôle de l'auteur connu" || ko "rôle : $r"
r=$(svc "INSERT INTO events ($colonnes, visibility) VALUES (gen_random_uuid(), now(), '$campagne', 1,
         'a.b', 1, 'gm', 'character', 'c1', '{}', 'c', 'secret');")
echo "$r" | grep -q events_visibility && echo "  visibilité connue" || ko "visibilité : $r"
r=$(insert "'$campagne', NULL, 'a.b', 1, 'gm', 'character', 'c1', '{}', 'c'")
echo "$r" | grep -q events_chain && echo "  campagne : seq obligatoire" || ko "seq : $r"
r=$(insert "NULL, 3, 'a.b', 1, 'gm', 'character', 'c1', '{}', 'c'")
echo "$r" | grep -q events_chain && echo "  global : sans seq" || ko "global : $r"
r=$(insert "'$campagne', 1, 'a.b', 1, 'gm', 'character', 'c1', '[1]', 'c'")
echo "$r" | grep -q events_payload_object && echo "  charge utile : objet JSON" || ko "payload : $r"
r=$(svc "BEGIN; $(ajout "$e1" 1) INSERT INTO inbox (event_id, consumer) VALUES ('$e1', 'test'); ROLLBACK;")
echo "$r" | grep -q inbox_pkey && echo "  un événement n'est reçu qu'une fois (inbox)" || ko "inbox : $r"

echo "== ajout seul =="
for q in \
  "UPDATE events SET payload = '{}' WHERE campaign_id = '$campagne'" \
  "DELETE FROM events WHERE campaign_id = '$campagne'" \
  "TRUNCATE events" \
  "UPDATE inbox SET consumer = 'x' WHERE event_id = '$e1'" \
  "DELETE FROM inbox WHERE event_id = '$e1'" \
  "DELETE FROM campaign_heads WHERE campaign_id = '$campagne'" \
  "SELECT count(*) FROM events_default"; do
  r=$(svc "BEGIN; $chaine $q; ROLLBACK;")
  if echo "$r" | grep -qiE "permission denied"; then
    echo "  history_svc refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done
for q in \
  "UPDATE events SET payload = '{}' WHERE id = '$e1'" \
  "DELETE FROM events WHERE id = '$e1'" \
  "TRUNCATE events"; do
  r=$(owner "BEGIN; $(ajout "$e1" 1) $q; ROLLBACK;")
  echo "$r" | grep -q "ajout seul" && echo "  même history_owner refusé : $q" || ko "owner : $q -> $r"
done

echo "== altération contournant les triggers : détectée =="
r=$(su "BEGIN; SET search_path = history, public; $chaine
        SET LOCAL session_replication_role = replica;
        UPDATE events SET payload = '{\"hp\": 999}' WHERE id = '$e2';
        SET LOCAL session_replication_role = origin;
        SELECT string_agg(seq || ':' || reason, ',') FROM verify_chain('$campagne');
        ROLLBACK;")
echo "$r" | grep -q "2:hash" && echo "  maillon 2 signalé ($r)" || ko "altération non détectée : $r"
r=$(su "BEGIN; SET search_path = history, public; $chaine
        SET LOCAL session_replication_role = replica;
        DELETE FROM events WHERE id = '$e3';
        SET LOCAL session_replication_role = origin;
        SELECT string_agg(seq || ':' || reason, ',') FROM verify_chain('$campagne');
        ROLLBACK;")
echo "$r" | grep -q "3:head" && echo "  fin de chaîne retirée signalée ($r)" || ko "suppression non détectée : $r"

echo "== partitions =="
r=$(svc "BEGIN; SELECT ensure_partitions('2001-01-15', 2);
         SELECT string_agg(c.relname, ',' ORDER BY c.relname) FROM pg_class c
           JOIN pg_inherits i ON i.inhrelid = c.oid
          WHERE i.inhparent = 'history.events'::regclass AND c.relname LIKE 'events_2001_%';
         INSERT INTO events ($colonnes) VALUES (gen_random_uuid(), '2001-01-20', NULL, NULL,
           'a.b', 1, 'system', 'x', 'y', '{}', 'c');
         SELECT count(*) FROM events WHERE occurred_at < '2001-02-01';
         ROLLBACK;")
echo "$r" | tr '\n' ' ' | grep -q "^2 events_2001_01,events_2001_02 1" \
  && echo "  ensure_partitions : 2 mois créés, ajout et lecture à travers events" \
  || ko "partitions : $r"
r=$(svc "BEGIN; SELECT ensure_partitions('2001-01-15', 1); SELECT * FROM events_2001_01; ROLLBACK;")
echo "$r" | grep -qi "permission denied" && echo "  partition créée : illisible en direct" \
  || ko "partition lisible : $r"
r=$(svc "SELECT ensure_partitions(current_date, 1)")
[ "$r" = 0 ] && echo "  mois courant déjà partitionné" || ko "mois courant : $r"

echo "== history_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "CREATE TABLE events_2099_01 PARTITION OF events FOR VALUES FROM ('2099-01-01') TO ('2099-02-01')" \
  "DROP TABLE events" \
  "ALTER TABLE events DISABLE TRIGGER events_no_update" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users" \
  "SELECT * FROM campaign.campaigns" \
  "SELECT * FROM dice.rolls"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

[ $echec -eq 0 ] && echo "history : droits, ajout seul et chaîne OK" || echo "history : des vérifications ont échoué"
exit $echec
