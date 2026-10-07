#!/usr/bin/env bash
# Vérifie le schéma marketplace (service marketplace) APRÈS les migrations Liquibase :
#  - le rôle du service (marketplace_svc) lit et écrit les données ;
#  - les contraintes protègent créateurs, fiches, versions, acquisitions, avis et signalements ;
#  - la recherche plein texte (colonne générée) et la notification de l'outbox fonctionnent ;
#  - marketplace_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase,
#    ni lire les schémas des autres services.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${MARKETPLACE_SVC_PASSWORD:-marketplace-dev}" \
    psql -U marketplace_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

createur=$(uuid)
acheteur=$(uuid)
fiche=$(uuid)
version=$(uuid)
suffixe=$(uuid | tr -d '-' | cut -c1-12)

echo "== marketplace_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO creators (user_id, slug, display_name) VALUES ('$createur', 'test-$suffixe', 'Testeur');
         INSERT INTO listings (id, creator_id, slug, title, search_text)
         VALUES ('$fiche', '$createur', 'pack-$suffixe', 'Cryptes de sel', 'cryptes de sel testeur');
         INSERT INTO listing_versions (id, listing_id, number, content_key, content_sha256, content_bytes, counts)
         VALUES ('$version', '$fiche', '1.0.0', 'marketplace/$fiche/versions/$version.json', 'abc', 10, '{}');
         UPDATE listing_versions SET status = 'in_review', submitted_at = now(), rights_attested_at = now() WHERE id = '$version';
         UPDATE listing_versions SET status = 'published', reviewed_at = now(), published_at = now() WHERE id = '$version';
         UPDATE listings SET status = 'published', published_at = now(), current_version_id = '$version' WHERE id = '$fiche';
         INSERT INTO listing_assets (listing_id, source_key, key, bytes, content_type)
         VALUES ('$fiche', 'campaigns/x/a.webp', 'marketplace/$fiche/assets/a.webp', 10, 'image/webp');
         INSERT INTO acquisitions (user_id, listing_id, source) VALUES ('$acheteur', '$fiche', 'free');
         INSERT INTO reviews (listing_id, user_id, rating) VALUES ('$fiche', '$acheteur', 5);
         INSERT INTO reports (id, listing_id, reporter_id, reason) VALUES (gen_random_uuid(), '$fiche', '$acheteur', 'broken');
         SELECT count(*) FROM listings WHERE search @@ to_tsquery('simple', 'crypt:* & sel:*');") \
  && [ "$r" = 1 ] && echo "  créateur, fiche, version, copie, acquisition, avis, signalement, recherche : OK" \
  || ko "insert ou recherche : $r"

echo "== contraintes =="
r=$(svc "INSERT INTO listings (id, creator_id, slug, title) VALUES (gen_random_uuid(), '$createur', 'Pas Une Adresse', 'Titre');")
echo "$r" | grep -q listings_slug && echo "  adresse lisible" || ko "slug : $r"
r=$(svc "INSERT INTO listings (id, creator_id, slug, title, price_cents) VALUES (gen_random_uuid(), '$createur', 'p-$suffixe', 'Titre', 150);")
echo "$r" | grep -q listings_price && echo "  prix : 0 ou de 2 € à 200 €" || ko "prix : $r"
r=$(svc "INSERT INTO listings (id, creator_id, slug, title, content_warnings) VALUES (gen_random_uuid(), '$createur', 'w-$suffixe', 'Titre', '{sexe}');")
echo "$r" | grep -q listings_warnings && echo "  avertissements connus" || ko "avertissements : $r"
r=$(svc "UPDATE listings SET status = 'removed' WHERE id = '$fiche';")
echo "$r" | grep -q listings_removed && echo "  retrait : date et motif" || ko "retrait : $r"
r=$(svc "INSERT INTO listing_versions (id, listing_id, number) VALUES (gen_random_uuid(), '$fiche', '1.0');")
echo "$r" | grep -q listing_versions_number && echo "  numéro x.y.z" || ko "numéro : $r"
r=$(svc "INSERT INTO listing_versions (id, listing_id, number) VALUES (gen_random_uuid(), '$fiche', '1.0.0');")
echo "$r" | grep -qi "unique\|duplicate" && echo "  un numéro par fiche" || ko "numéro unique : $r"
r=$(svc "INSERT INTO listing_versions (id, listing_id, number) VALUES (gen_random_uuid(), '$fiche', '1.1.0');
         INSERT INTO listing_versions (id, listing_id, number) VALUES (gen_random_uuid(), '$fiche', '1.2.0');")
echo "$r" | grep -qi "listing_versions_open" && echo "  une seule version en cours" || ko "version en cours : $r"
r=$(svc "INSERT INTO listing_versions (id, listing_id, number, status) VALUES (gen_random_uuid(), '$fiche', '2.0.0', 'in_review');")
echo "$r" | grep -q listing_versions_submitted && echo "  soumise : contenu et attestation" || ko "soumission : $r"
r=$(svc "INSERT INTO acquisitions (user_id, listing_id, source) VALUES (gen_random_uuid(), '$fiche', 'purchase');")
echo "$r" | grep -q acquisitions_sale && echo "  achat : vente liée" || ko "achat : $r"
r=$(svc "INSERT INTO reviews (listing_id, user_id, rating) VALUES ('$fiche', gen_random_uuid(), 6);")
echo "$r" | grep -q reviews_rating && echo "  note de 1 à 5" || ko "note : $r"
r=$(svc "INSERT INTO reports (id, listing_id, reporter_id, reason) VALUES (gen_random_uuid(), '$fiche', '$acheteur', 'other');")
echo "$r" | grep -qi "reports_open" && echo "  un signalement ouvert par compte" || ko "signalement : $r"

echo "== outbox : notification sur le canal marketplace_outbox =="
r=$(PGPASSWORD="${MARKETPLACE_SVC_PASSWORD:-marketplace-dev}" psql -U marketplace_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN marketplace_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt.global.marketplace.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "marketplace_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== marketplace_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE listings" \
  "ALTER TABLE listings ADD COLUMN x int" \
  "TRUNCATE reviews" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users" \
  "SELECT * FROM billing.purchases" \
  "SELECT * FROM campaign.campaigns"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

svc "DELETE FROM outbox WHERE subject = 'vtt.global.marketplace.test';
     DELETE FROM listings WHERE creator_id = '$createur';
     DELETE FROM creators WHERE user_id = '$createur';" >/dev/null

[ $echec -eq 0 ] && echo "marketplace : droits et contraintes OK" || echo "marketplace : des vérifications ont échoué"
exit $echec
