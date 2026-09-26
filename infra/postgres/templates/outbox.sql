-- Gabarit à copier dans la première migration de chaque service (schéma courant).
-- Outbox transactionnelle + réveil du relais par LISTEN/NOTIFY.
--
-- Pourquoi pas NOTIFY directement vers les WebSockets ?
--  - payload limité à 8 000 octets, aucune relecture après une déconnexion,
--  - une connexion LISTEN par pod realtime, qui ne passe pas par PgBouncer.
-- NOTIFY sert donc seulement de « sonnette » : le relais lit l'outbox, publie sur
-- NATS JetStream (durable, rejouable) et realtime diffuse depuis NATS.

CREATE TABLE IF NOT EXISTS outbox (
  id            uuid        PRIMARY KEY,           -- = id de l'événement (UUIDv7)
  subject       text        NOT NULL,              -- vtt.<roomId>.<domaine>.<action>
  envelope      jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  attempts      int         NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (created_at) WHERE published_at IS NULL;

-- Dédoublonnage côté consommateur (livraison au moins une fois)
CREATE TABLE IF NOT EXISTS inbox (
  event_id     uuid        PRIMARY KEY,
  consumer     text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Canal par schéma : le relais du service n'écoute que le sien
  PERFORM pg_notify(TG_TABLE_SCHEMA || '_outbox', NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS outbox_notify ON outbox;
CREATE TRIGGER outbox_notify AFTER INSERT ON outbox
  FOR EACH ROW EXECUTE FUNCTION outbox_notify();

-- Le relais lit par lots en évitant les doublons entre réplicas :
--   SELECT id, subject, envelope FROM outbox
--   WHERE published_at IS NULL ORDER BY created_at
--   LIMIT 100 FOR UPDATE SKIP LOCKED;
-- Filet de sécurité : relecture toutes les 5 s même sans NOTIFY.
