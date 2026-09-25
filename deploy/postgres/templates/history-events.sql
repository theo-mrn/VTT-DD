-- Journal d'actions append-only (schéma history).
-- Partitionné par mois, chaîné par salle : toute modification a posteriori
-- casse la chaîne et se détecte avec history.verify_chain().

CREATE TABLE events (
  id             uuid        NOT NULL,
  occurred_at    timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  room_id        uuid,
  type           text        NOT NULL,
  version        int         NOT NULL,
  actor_id       uuid,
  actor_role     text        NOT NULL,
  aggregate_type text        NOT NULL,
  aggregate_id   text        NOT NULL,
  visibility     text        NOT NULL DEFAULT 'public',
  payload        jsonb       NOT NULL,
  correlation_id text        NOT NULL,
  trace_id       text,
  seq            bigint      NOT NULL,   -- ordre dans la salle (sert au rattrapage WebSocket)
  prev_hash      bytea,
  hash           bytea       NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX events_room_seq   ON events (room_id, seq DESC);
CREATE INDEX events_room_time  ON events (room_id, occurred_at DESC);
CREATE INDEX events_aggregate  ON events (aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX events_payload    ON events USING gin (payload jsonb_path_ops);

-- Tête de chaîne par salle (NULL = événements globaux)
CREATE TABLE chain_heads (
  room_key  text   PRIMARY KEY,
  seq       bigint NOT NULL,
  hash      bytea  NOT NULL
);

CREATE OR REPLACE FUNCTION events_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k text := coalesce(NEW.room_id::text, 'global');
  head chain_heads%ROWTYPE;
BEGIN
  -- Sérialise les insertions d'une même salle, les autres salles restent parallèles
  PERFORM pg_advisory_xact_lock(hashtextextended('history:' || k, 0));
  SELECT * INTO head FROM chain_heads WHERE room_key = k;
  NEW.seq := coalesce(head.seq, 0) + 1;
  NEW.prev_hash := head.hash;
  NEW.hash := digest(
    coalesce(NEW.prev_hash, ''::bytea) ||
    convert_to(concat_ws('|', NEW.id, NEW.occurred_at, NEW.type, NEW.actor_id,
                         NEW.aggregate_type, NEW.aggregate_id, NEW.payload::text), 'UTF8'),
    'sha256');
  INSERT INTO chain_heads VALUES (k, NEW.seq, NEW.hash)
    ON CONFLICT (room_key) DO UPDATE SET seq = EXCLUDED.seq, hash = EXCLUDED.hash;
  RETURN NEW;
END $$;

CREATE TRIGGER events_chain BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION events_chain();

-- Ceinture et bretelles : même le propriétaire ne peut ni modifier ni supprimer
CREATE OR REPLACE FUNCTION events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history.events est en ajout seul (% refusé)', TG_OP;
END $$;
CREATE TRIGGER events_no_update BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_immutable();

-- Vérification : renvoie les événements dont le hash ne correspond plus
CREATE OR REPLACE FUNCTION verify_chain(p_room uuid)
RETURNS TABLE (seq bigint, id uuid) LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT e.*, lag(e.hash) OVER (ORDER BY e.seq) AS expected_prev
    FROM events e WHERE e.room_id IS NOT DISTINCT FROM p_room
  )
  SELECT o.seq, o.id FROM ordered o
  WHERE o.prev_hash IS DISTINCT FROM o.expected_prev
     OR o.hash <> digest(
          coalesce(o.prev_hash, ''::bytea) ||
          convert_to(concat_ws('|', o.id, o.occurred_at, o.type, o.actor_id,
                               o.aggregate_type, o.aggregate_id, o.payload::text), 'UTF8'),
          'sha256')
  ORDER BY o.seq;
$$;

-- Partitions : créées à l'avance par un CronJob (ou pg_partman) ; exemple :
-- CREATE TABLE events_2026_10 PARTITION OF events
--   FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
