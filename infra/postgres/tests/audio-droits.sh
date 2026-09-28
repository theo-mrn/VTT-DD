#!/usr/bin/env bash
# Vérifie le schéma audio (service audio) APRÈS les migrations Liquibase :
#  - le rôle du service (audio_svc) lit et écrit les données ;
#  - les contraintes protègent assets, canaux, effets, mixeur et jobs ;
#  - les notifications de l'outbox (audio_outbox) et du worker (audio_jobs) partent ;
#  - audio_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase,
#    ni lire les schémas des autres services.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${AUDIO_SVC_PASSWORD:-audio-dev}" \
    psql -U audio_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

campagne=$(uuid)
asset=$(uuid)
asset2=$(uuid)
liste=$(uuid)
mj=$(uuid)
colonnes="id, campaign_id, kind, name, source, status"

echo "== audio_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO assets ($colonnes, original_key, size_bytes)
         VALUES ('$asset', '$campagne', 'music', 'Taverne', 'upload', 'processing',
                 'audio/incoming/$campagne/$asset', 1000);
         INSERT INTO assets ($colonnes, youtube_id)
         VALUES ('$asset2', '$campagne', 'music', 'Épique', 'youtube', 'ready', 'dQw4w9WgXcQ');
         INSERT INTO playlists (id, campaign_id, name) VALUES ('$liste', '$campagne', 'Combat');
         INSERT INTO playlist_items VALUES ('$liste', '$asset', 0), ('$liste', '$asset2', 1);
         INSERT INTO channels (campaign_id, channel, asset_id, queue, queue_index, status)
         VALUES ('$campagne', 'music', '$asset', ARRAY['$asset', '$asset2']::uuid[], 0, 'playing');
         INSERT INTO cues (id, campaign_id, asset_id, started_by, start_at)
         VALUES (gen_random_uuid(), '$campagne', '$asset', '$mj', now());
         INSERT INTO mixer_preferences (user_id, volumes) VALUES ('$mj', '{\"music\": 0.5}');
         INSERT INTO jobs (id, asset_id, kind) VALUES (gen_random_uuid(), '$asset', 'analyze');
         INSERT INTO legacy_ids VALUES ('test', 'sound_templates/x/templates/y', 'asset', '$asset');
         SELECT count(*) FROM playlist_items WHERE playlist_id = '$liste';") \
  && echo "  assets, playlist, canal, effet, mixeur, job, legacy_ids : $r" || ko "insert : $r"

echo "== contraintes =="
insert() { svc "INSERT INTO assets ($colonnes$1) VALUES (gen_random_uuid(), '$campagne', $2);"; }
r=$(insert ", youtube_id" "'music', 'A', 'youtube', 'ready', 'pas-un-id'")
echo "$r" | grep -q assets_youtube_id && echo "  id YouTube de 11 caractères" || ko "youtube : $r"
r=$(insert "" "'music', 'A', 'youtube', 'ready'")
echo "$r" | grep -q assets_source_fields && echo "  champs selon la source" || ko "source : $r"
r=$(insert ", catalog_id" "'voix', 'A', 'catalog', 'ready', 'x'")
echo "$r" | grep -q assets_kind && echo "  sorte connue" || ko "kind : $r"
r=$(insert ", catalog_id" "'sfx', '', 'catalog', 'ready', 'x'")
echo "$r" | grep -q assets_name && echo "  nom non vide" || ko "nom : $r"
r=$(insert ", catalog_id, gain_db" "'sfx', 'A', 'catalog', 'ready', 'x', 40")
echo "$r" | grep -q assets_gain && echo "  gain borné" || ko "gain : $r"
r=$(insert ", catalog_id, playback_url" "'sfx', 'A', 'catalog', 'ready', 'x', 'javascript:alert(1)'")
echo "$r" | grep -q assets_playback_url && echo "  URL servie absolue (http/https)" || ko "url : $r"
r=$(svc "UPDATE channels SET status = 'rewinding' WHERE campaign_id = '$campagne';")
echo "$r" | grep -q channels_status && echo "  état de canal connu" || ko "canal : $r"
r=$(svc "UPDATE channels SET crossfade_ms = 20000 WHERE campaign_id = '$campagne';")
echo "$r" | grep -q channels_crossfade && echo "  fondu borné" || ko "fondu : $r"
r=$(svc "INSERT INTO channels (campaign_id, channel) VALUES ('$campagne', 'voix');")
echo "$r" | grep -q channels_channel && echo "  canaux musique et ambiance seulement" || ko "canal : $r"
r=$(svc "INSERT INTO mixer_preferences (user_id, volumes) VALUES (gen_random_uuid(), '[1]');")
echo "$r" | grep -q mixer_volumes && echo "  mixeur : objet JSON" || ko "mixeur : $r"
r=$(svc "INSERT INTO jobs (id, kind) VALUES (gen_random_uuid(), 'miner');")
echo "$r" | grep -q jobs_kind && echo "  job : sorte connue" || ko "job : $r"
r=$(svc "INSERT INTO playlist_items VALUES ('$liste', gen_random_uuid(), 5);")
echo "$r" | grep -qi "foreign key" && echo "  playlist : asset existant" || ko "playlist : $r"
r=$(svc "BEGIN; UPDATE playlist_items SET position = 1 - position WHERE playlist_id = '$liste'; COMMIT;
         SELECT position FROM playlist_items WHERE asset_id = '$asset';")
[ "$r" = 1 ] && echo "  réordonner une playlist (unicité différée)" || ko "ordre : $r"

echo "== notifications : audio_outbox et audio_jobs =="
r=$(PGPASSWORD="${AUDIO_SVC_PASSWORD:-audio-dev}" psql -U audio_svc -tA -v ON_ERROR_STOP=1 2>&1 <<SQL
LISTEN audio_outbox;
LISTEN audio_jobs;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt._.audio.test', '{}');
INSERT INTO jobs (id, asset_id, kind) VALUES (gen_random_uuid(), '$asset', 'purge');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "audio_outbox"' && echo "  outbox : notification reçue" || ko "notify outbox : $r"
echo "$r" | grep -q 'notification "audio_jobs"' && echo "  jobs : notification reçue" || ko "notify jobs : $r"

echo "== audio_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE assets" \
  "ALTER TABLE assets ADD COLUMN x int" \
  "TRUNCATE assets" \
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

svc "DELETE FROM outbox WHERE subject = 'vtt._.audio.test';
     DELETE FROM cues WHERE campaign_id = '$campagne';
     DELETE FROM channels WHERE campaign_id = '$campagne';
     DELETE FROM playlists WHERE campaign_id = '$campagne';
     DELETE FROM legacy_ids WHERE target_id = '$asset';
     DELETE FROM assets WHERE campaign_id = '$campagne';
     DELETE FROM mixer_preferences WHERE user_id = '$mj';" >/dev/null

[ $echec -eq 0 ] && echo "audio : droits et contraintes OK" || echo "audio : des vérifications ont échoué"
exit $echec
