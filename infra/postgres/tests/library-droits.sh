#!/usr/bin/env bash
# Vérifie le schéma library (service library) APRÈS les migrations Liquibase :
#  - le rôle du service (library_svc) lit et écrit les fonds et leurs variantes ;
#  - les contraintes protègent les facettes, les textes et l'unicité des sources et des URL ;
#  - la recherche plein texte (colonnes générées, français et anglais) fonctionne ;
#  - library_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase,
#    ni lire les schémas des autres services.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${LIBRARY_SVC_PASSWORD:-library-dev}" \
    psql -U library_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

fond=$(uuid)
source="test-$(uuid | cut -c1-8)"

echo "== library_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO backgrounds (id, source, source_key, title_fr, title_en, search_head_fr, search_body_en, place, setting, time_of_day, moods)
         VALUES ('$fond', '$source', 'k1', 'Grotte aux cristaux', 'Crystal cave', 'grotte aux cristaux caverne', 'an underground cave lit by crystals',
                 'cave', 'underground', 'unknown', ARRAY['magical']);
         INSERT INTO background_variants (id, background_id, position, url, kind)
         VALUES (gen_random_uuid(), '$fond', 0, 'https://assets.test/$source/0.webp', 'image');
         SELECT count(*) FROM backgrounds
          WHERE search_fr @@ (to_tsquery('french', 'grottes:*') || to_tsquery('simple', 'grottes:*'))
            AND search_en @@ to_tsquery('english', 'caves:*');") \
  && [ "$(echo "$r" | tail -1)" = 1 ] && echo "  écriture et recherche (fr, en)" || ko "écriture ou recherche : $r"

echo "== contraintes =="
r=$(svc "INSERT INTO backgrounds (id, source, source_key, title_fr, title_en) VALUES (gen_random_uuid(), '$source', 'k1', 'x', 'x');")
echo "$r" | grep -q backgrounds_source_key && echo "  une clé par source" || ko "clé unique : $r"
r=$(svc "INSERT INTO backgrounds (id, source, source_key, title_fr, title_en, place) VALUES (gen_random_uuid(), '$source', 'k2', 'x', 'x', 'moon');")
echo "$r" | grep -q backgrounds_place && echo "  lieu connu" || ko "lieu : $r"
r=$(svc "INSERT INTO backgrounds (id, source, source_key, title_fr, title_en, moods) VALUES (gen_random_uuid(), '$source', 'k3', 'x', 'x', ARRAY['happy']);")
echo "$r" | grep -q backgrounds_moods && echo "  ambiances connues" || ko "ambiance : $r"
r=$(svc "INSERT INTO background_variants (id, background_id, position, url, kind) VALUES (gen_random_uuid(), '$fond', 1, 'https://assets.test/$source/0.webp', 'image');")
echo "$r" | grep -q background_variants_url && echo "  une URL par variante" || ko "URL unique : $r"
r=$(svc "INSERT INTO background_variants (id, background_id, position, url, kind) VALUES (gen_random_uuid(), '$fond', 2, 'https://assets.test/$source/2.webp', 'sound');")
echo "$r" | grep -q background_variants_kind && echo "  image ou vidéo" || ko "type : $r"

echo "== library_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE backgrounds" \
  "ALTER TABLE backgrounds ADD COLUMN x int" \
  "TRUNCATE background_variants" \
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
svc "DELETE FROM backgrounds WHERE source = '$source';" >/dev/null
[ $echec -eq 0 ] && echo "library : droits et contraintes OK" || echo "library : des vérifications ont échoué"
exit $echec
