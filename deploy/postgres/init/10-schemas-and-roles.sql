-- Un schéma et un rôle par service. Aucun service ne lit le schéma d'un autre :
-- il passe par l'API ou par les événements.
-- Mots de passe de DEV uniquement ; en prod, CNPG génère les secrets.
-- Le service character utilise le schéma « characters » (CHARACTER est un mot réservé SQL).
DO $$
DECLARE svc text;
BEGIN
  FOREACH svc IN ARRAY ARRAY['identity','billing','campaign','characters','history'] LOOP
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', svc || '_svc', svc || '-dev');
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', svc, svc || '_svc');
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', svc || '_svc', svc);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', svc);
  END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Rôle de sauvegarde logique (pg_dump) : lecture seule sur tout
CREATE ROLE backup_ro LOGIN PASSWORD 'backup-dev';
GRANT pg_read_all_data TO backup_ro;
