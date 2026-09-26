--liquibase formatted sql

--changeset identity:0003-outbox
--comment: Outbox transactionnelle et dédoublonnage (gabarit infra/postgres/templates/outbox.sql).
CREATE TABLE outbox (
  id            uuid        PRIMARY KEY,           -- = id de l'événement (UUIDv7)
  subject       text        NOT NULL,              -- vtt.<roomId>.<domaine>.<action>
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

--changeset identity:0003-outbox-notify splitStatements:false
--comment: NOTIFY sert de sonnette au relais du service (canal identity_outbox).
CREATE FUNCTION outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(TG_TABLE_SCHEMA || '_outbox', NEW.id::text);
  RETURN NEW;
END $$;
CREATE TRIGGER outbox_notify AFTER INSERT ON outbox
  FOR EACH ROW EXECUTE FUNCTION outbox_notify();
--rollback DROP TRIGGER outbox_notify ON outbox;
--rollback DROP FUNCTION outbox_notify();
