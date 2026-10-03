--liquibase formatted sql

--changeset audio:0003-jobs
--comment: File du worker ffmpeg (analyse, purge), prise en FOR UPDATE SKIP LOCKED. Un job en cours dont le bail (locked_until) a expiré est repris.
CREATE TABLE jobs (
  id           uuid        PRIMARY KEY,
  asset_id     uuid        REFERENCES assets (id) ON DELETE CASCADE,
  kind         text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  attempts     int         NOT NULL DEFAULT 0,
  run_after    timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_kind CHECK (kind IN ('analyze', 'purge')),
  CONSTRAINT jobs_status CHECK (status IN ('pending', 'running', 'done', 'failed')),
  CONSTRAINT jobs_attempts CHECK (attempts >= 0)
);
CREATE INDEX jobs_due ON jobs (run_after) WHERE status IN ('pending', 'running');
CREATE INDEX jobs_asset ON jobs (asset_id);
--rollback DROP TABLE jobs;

--changeset audio:0003-jobs-notify splitStatements:false
--comment: NOTIFY 'audio_jobs' réveille le worker dès qu'un job est prêt (sinon, relecture périodique).
CREATE FUNCTION jobs_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM pg_notify(TG_TABLE_SCHEMA || '_jobs', NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_notify AFTER INSERT OR UPDATE OF status, run_after ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_notify();
--rollback DROP TRIGGER jobs_notify ON jobs;
--rollback DROP FUNCTION jobs_notify();

--changeset audio:0003-outbox
--comment: Outbox transactionnelle et dédoublonnage (gabarit infra/postgres/templates/outbox.sql).
CREATE TABLE outbox (
  id            uuid        PRIMARY KEY,
  subject       text        NOT NULL,
  envelope      jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  attempts      int         NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX outbox_pending ON outbox (created_at) WHERE published_at IS NULL;

CREATE TABLE inbox (
  event_id     uuid        PRIMARY KEY,
  consumer     text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
--rollback DROP TABLE inbox;
--rollback DROP TABLE outbox;

--changeset audio:0003-outbox-notify splitStatements:false
--comment: NOTIFY sert de sonnette au relais du service (canal audio_outbox).
CREATE FUNCTION outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(TG_TABLE_SCHEMA || '_outbox', NEW.id::text);
  RETURN NEW;
END $$;
CREATE TRIGGER outbox_notify AFTER INSERT ON outbox
  FOR EACH ROW EXECUTE FUNCTION outbox_notify();
--rollback DROP TRIGGER outbox_notify ON outbox;
--rollback DROP FUNCTION outbox_notify();
