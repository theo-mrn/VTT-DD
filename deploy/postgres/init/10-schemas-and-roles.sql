-- Un schéma et deux rôles par service. Aucun service ne lit le schéma d'un autre :
-- il passe par l'API ou par les événements.
--
--   <service>_owner : propriétaire du schéma, utilisé UNIQUEMENT par Liquibase (DDL).
--   <service>_svc   : rôle du service en fonctionnement, limité aux données (DML).
-- Un service compromis ne peut donc ni modifier son schéma ni effacer son journal
-- de migrations.
--
-- Mots de passe de DEV uniquement ; en prod, CNPG génère les secrets
-- (voir deploy/platform/data/schemas.sql, à garder aligné).
-- Le service character utilise le schéma « characters » (CHARACTER est un mot réservé SQL).
DO $$
DECLARE
  svc text;
  proprietaire text;
  service text;
BEGIN
  FOREACH svc IN ARRAY ARRAY['identity','billing','campaign','characters','history'] LOOP
    proprietaire := svc || '_owner';
    service := svc || '_svc';

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = proprietaire) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', proprietaire, svc || '-owner-dev');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = service) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', service, svc || '-dev');
    END IF;

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', svc, proprietaire);
    -- Base créée avec l'ancien script (schéma possédé par _svc) : on corrige
    EXECUTE format('ALTER SCHEMA %I OWNER TO %I', svc, proprietaire);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', svc);
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I', svc, service);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', svc, service);

    -- Tout ce que Liquibase crée (en tant que _owner) est accessible en DML au service
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', proprietaire, svc, service);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I', proprietaire, svc, service);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', proprietaire, svc, service);

    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', proprietaire, svc);
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', service, svc);
  END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Rôle de sauvegarde logique (pg_dump) : lecture seule sur tout
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_ro') THEN
    CREATE ROLE backup_ro LOGIN PASSWORD 'backup-dev';
  END IF;
END $$;
GRANT pg_read_all_data TO backup_ro;
