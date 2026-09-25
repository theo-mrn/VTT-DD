-- Exécuté par CNPG à l'initialisation (postInitApplicationSQL, base vtt).
-- Garder aligné avec deploy/postgres/init/ (dev local).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Les rôles sont créés ici sans mot de passe ; CNPG (managed.roles) les adopte
-- ensuite et leur applique LOGIN + le mot de passe de leur Secret.
DO $$
DECLARE svc text;
BEGIN
  FOREACH svc IN ARRAY ARRAY['identity','billing','campaign','characters','history'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = svc || '_svc') THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', svc || '_svc');
    END IF;
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', svc, svc || '_svc');
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', svc || '_svc', svc);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', svc);
  END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
