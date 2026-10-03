#!/usr/bin/env bash
# Vérifie le schéma identity APRÈS les migrations Liquibase :
#  - le rôle du service (identity_svc) lit et écrit les données ;
#  - les contraintes protègent les comptes ;
#  - identity_svc ne peut NI modifier le schéma NI toucher au journal de Liquibase.
# Connexion : PGHOST, PGPORT, PGDATABASE ; mot de passe de dev par défaut.
set -uo pipefail

export PGDATABASE="${PGDATABASE:-vtt}"
echec=0
ko() { echo "  ÉCHEC : $1"; echec=1; }
svc() {
  PGPASSWORD="${IDENTITY_SVC_PASSWORD:-identity-dev}" \
    psql -U identity_svc -tAq -v ON_ERROR_STOP=1 -c "$1" 2>&1
}

echo "== identity_svc : lecture et écriture des données =="
r=$(svc "INSERT INTO users (id, email) VALUES (gen_random_uuid(), 'Theo@Exemple.fr'); SELECT count(*) FROM users;") \
  && echo "  insert + select : $r" || ko "insert users : $r"
r=$(svc "UPDATE users SET email_verified = true; DELETE FROM users WHERE false; SELECT 'ok';") \
  && echo "  update + delete : $r" || ko "update/delete : $r"

echo "== contraintes =="
r=$(svc "INSERT INTO users (id, email) VALUES (gen_random_uuid(), 'theo@exemple.fr');")
echo "$r" | grep -q users_email_unique && echo "  e-mail unique sans tenir compte de la casse" || ko "unicité e-mail : $r"
r=$(svc "INSERT INTO users (id, email) VALUES (gen_random_uuid(), 'pas un email');")
echo "$r" | grep -q users_email_format && echo "  format d'e-mail vérifié" || ko "format e-mail : $r"
r=$(svc "INSERT INTO credentials VALUES ((SELECT id FROM users LIMIT 1), 'firebase-scrypt', 'h', NULL);")
echo "$r" | grep -q credentials_salt && echo "  sel obligatoire pour un hash Firebase" || ko "sel firebase : $r"
r=$(svc "INSERT INTO credentials VALUES ((SELECT id FROM users LIMIT 1), 'md5', 'h', NULL);")
echo "$r" | grep -q credentials_algorithm && echo "  algorithme inconnu refusé" || ko "algorithme : $r"

echo "== outbox : notification sur le canal identity_outbox =="
r=$(PGPASSWORD="${IDENTITY_SVC_PASSWORD:-identity-dev}" psql -U identity_svc -tA -v ON_ERROR_STOP=1 2>&1 <<'SQL'
LISTEN identity_outbox;
INSERT INTO outbox (id, subject, envelope) VALUES (gen_random_uuid(), 'vtt._.identity.test', '{}');
SELECT 1;
SQL
)
echo "$r" | grep -q 'notification "identity_outbox"' && echo "  notification reçue" || ko "notify : $r"

echo "== identity_svc : opérations qui doivent être refusées =="
for q in \
  "CREATE TABLE pirate (x int)" \
  "DROP TABLE users" \
  "ALTER TABLE users ADD COLUMN x int" \
  "TRUNCATE users" \
  "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'select 1'" \
  "SELECT * FROM databasechangelog" \
  "DELETE FROM databasechangelog" \
  "UPDATE databasechangeloglock SET locked = false"; do
  r=$(svc "$q")
  if echo "$r" | grep -qiE "permission denied|must be owner"; then
    echo "  refusé : $q"
  else
    ko "AUTORISÉ : $q -> $r"
  fi
done

[ $echec -eq 0 ] && echo "identity : droits et contraintes OK" || echo "identity : des vérifications ont échoué"
exit $echec
