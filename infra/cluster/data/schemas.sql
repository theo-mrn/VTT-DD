-- Exécuté par CNPG à l'initialisation (postInitApplicationSQL, base vtt).
-- Garder aligné avec infra/postgres/init/ (dev local).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Deux rôles par service (voir infra/postgres/init/10-schemas-and-roles.sql) :
--   <service>_owner : propriétaire du schéma, utilisé uniquement par le Job Liquibase ;
--   <service>_svc   : rôle du service, limité aux données.
-- Créés ici sans mot de passe ; CNPG (managed.roles) les adopte ensuite et leur
-- applique LOGIN + le mot de passe de leur Secret.
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
      EXECUTE format('CREATE ROLE %I NOLOGIN', proprietaire);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = service) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', service);
    END IF;
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', svc, proprietaire);
    EXECUTE format('ALTER SCHEMA %I OWNER TO %I', svc, proprietaire);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', svc);
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I', svc, service);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', svc, service);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', proprietaire, svc, service);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I', proprietaire, svc, service);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', proprietaire, svc, service);
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', proprietaire, svc);
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', service, svc);
  END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
