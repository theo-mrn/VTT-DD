#!/usr/bin/env bash
# Vérifie le schéma billing (service billing) APRÈS les migrations Liquibase :
#  - le rôle du service (billing_svc) lit et écrit les données ;
#  - les contraintes protègent clients, achats et événements Stripe traités ;
#  - billing_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase,
#    ni lire les schémas des autres services.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${BILLING_SVC_PASSWORD:-billing-dev}" \
    psql -U billing_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}
uuid() { (uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid) | tr 'A-Z' 'a-z'; }

client=$(uuid)
achat=$(uuid)
suffixe=$(uuid | tr -d '-' | cut -c1-12)

echo "== billing_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO customers (user_id, stripe_customer_id, subscription_id, premium, premium_since)
         VALUES ('$client', 'cus_$suffixe', 'sub_$suffixe', true, now());
         INSERT INTO purchases (id, user_id, kind, item_id, amount_cents, stripe_session_id)
         VALUES ('$achat', '$client', 'dice', 'bismuth', 500, 'cs_test_$suffixe');
         UPDATE purchases SET status = 'completed', completed_at = now() WHERE id = '$achat';
         INSERT INTO processed_events (stripe_event_id, type) VALUES ('evt_$suffixe', 'checkout.session.completed');
         SELECT count(*) FROM customers WHERE user_id = '$client';") \
  && echo "  client, achat, événement traité : $r" || ko "insert : $r"

echo "== contraintes =="
r=$(svc "INSERT INTO customers (user_id, stripe_customer_id) VALUES (gen_random_uuid(), 'pas-un-client');")
echo "$r" | grep -q customers_stripe_customer_id && echo "  client Stripe : cus_…" || ko "client : $r"
r=$(svc "INSERT INTO customers (user_id, stripe_customer_id) VALUES (gen_random_uuid(), 'cus_$suffixe');")
echo "$r" | grep -qi "unique\|duplicate" && echo "  un client Stripe par utilisateur" || ko "client unique : $r"
r=$(svc "INSERT INTO customers (user_id, premium, cancel_at_period_end) VALUES (gen_random_uuid(), true, true);")
echo "$r" | grep -q customers_cancel_end && echo "  résiliation : date de fin obligatoire" || ko "résiliation : $r"
achete() { svc "INSERT INTO purchases (id, user_id, kind, item_id, amount_cents, stripe_session_id) VALUES (gen_random_uuid(), '$client', $1);"; }
r=$(achete "'bijou', 'ruby', 250, 'cs_test_a$suffixe'")
echo "$r" | grep -q purchases_kind && echo "  type d'article connu" || ko "kind : $r"
r=$(achete "'dice', 'ruby', 0, 'cs_test_b$suffixe'")
echo "$r" | grep -q purchases_amount && echo "  montant strictement positif" || ko "montant : $r"
r=$(achete "'dice', 'ruby', 250, 'cs_test_$suffixe'")
echo "$r" | grep -qi "unique\|duplicate" && echo "  une session Checkout par achat" || ko "session : $r"
r=$(svc "UPDATE purchases SET status = 'completed', completed_at = NULL WHERE id = '$achat';")
echo "$r" | grep -q purchases_completed && echo "  achat terminé : date de fin" || ko "terminé : $r"
r=$(svc "INSERT INTO processed_events (stripe_event_id, type) VALUES ('evt_$suffixe', 'x');")
echo "$r" | grep -qi "unique\|duplicate" && echo "  un événement Stripe traité une seule fois" || ko "événement : $r"

echo "== outbox : notification sur le canal billing_outbox =="
r=$(PGPASSWORD="${BILLING_SVC_PASSWORD:-billing-dev}" psql -U billing_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN billing_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt.global.billing.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "billing_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== billing_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE customers" \
  "ALTER TABLE purchases ADD COLUMN x int" \
  "TRUNCATE processed_events" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false" \
  "SELECT * FROM identity.users" \
  "SELECT * FROM dice.inventory" \
  "SELECT * FROM campaign.campaigns"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

svc "DELETE FROM outbox WHERE subject = 'vtt.global.billing.test';
     DELETE FROM purchases WHERE user_id = '$client';
     DELETE FROM customers WHERE user_id = '$client';
     DELETE FROM processed_events WHERE stripe_event_id = 'evt_$suffixe';" >/dev/null

[ $echec -eq 0 ] && echo "billing : droits et contraintes OK" || echo "billing : des vérifications ont échoué"
exit $echec
