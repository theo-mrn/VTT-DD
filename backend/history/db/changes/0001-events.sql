--liquibase formatted sql

--changeset history:0001-events
--comment: Journal d'actions append-only : une ligne par événement du bus (enveloppe @vtt/contracts), partitionné par mois. Chaîné par campagne (seq, prev_hash, hash) ; les événements sans campagne (roomId null) ne sont pas chaînés.
CREATE TABLE events (
  id                 uuid        NOT NULL,                  -- id de l'événement (UUIDv7 ; UUIDv5 pour l'ancien Historique importé)
  occurred_at        timestamptz NOT NULL,                  -- occurredAt de l'enveloppe (clé de partition)
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  campaign_id        uuid,                                  -- roomId de l'enveloppe ; null : événement global (compte, profil…)
  seq                bigint,                                -- rang dans la campagne (1, 2, 3…) ; null pour un événement global
  type               text        NOT NULL,                  -- domaine.action, « legacy.<type> » pour l'ancien Historique
  version            int         NOT NULL,
  actor_id           uuid,
  actor_role         text        NOT NULL,
  actor_character_id uuid,                                  -- actor.characterId : personnage incarné par l'auteur
  aggregate_type     text        NOT NULL,
  aggregate_id       text        NOT NULL,
  -- Personnage concerné (filtre « par personnage ») : l'agrégat s'il s'agit d'un
  -- personnage, sinon le personnage incarné par l'auteur. Dérivé : hors du hash.
  character_id       uuid        GENERATED ALWAYS AS (
    CASE
      WHEN aggregate_type = 'character'
        AND aggregate_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN aggregate_id::uuid
      ELSE actor_character_id
    END
  ) STORED,
  visibility         text        NOT NULL DEFAULT 'public',
  payload            jsonb       NOT NULL,
  correlation_id     text        NOT NULL,
  causation_id       text,
  traceparent        text,
  prev_hash          bytea,                                 -- hash de l'événement précédent de la campagne
  hash               bytea       NOT NULL,                  -- calculé par le trigger events_hash
  PRIMARY KEY (id, occurred_at),
  CONSTRAINT events_type CHECK (type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' AND char_length(type) <= 128),
  CONSTRAINT events_version CHECK (version > 0),
  CONSTRAINT events_actor_role CHECK (actor_role IN ('gm', 'player', 'user', 'system')),
  CONSTRAINT events_visibility CHECK (visibility IN ('public', 'gm_only', 'owner')),
  CONSTRAINT events_aggregate CHECK (char_length(aggregate_type) BETWEEN 1 AND 128 AND char_length(aggregate_id) BETWEEN 1 AND 256),
  CONSTRAINT events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  -- Chaîne par campagne : seq et prev_hash seulement dans une campagne
  CONSTRAINT events_chain CHECK (
    (campaign_id IS NULL) = (seq IS NULL)
    AND (seq IS NULL OR seq > 0)
    AND (campaign_id IS NOT NULL OR prev_hash IS NULL)
  ),
  CONSTRAINT events_hash_length CHECK (
    octet_length(hash) = 32 AND (prev_hash IS NULL OR octet_length(prev_hash) = 32)
  )
) PARTITION BY RANGE (occurred_at);
-- Timeline et rattrapage d'une campagne (realtime : tout ce qui suit un seq)
CREATE INDEX events_campaign_seq ON events (campaign_id, seq) WHERE campaign_id IS NOT NULL;
-- Audit : qui a modifié quoi (tous les événements d'un agrégat)
CREATE INDEX events_aggregate ON events (aggregate_type, aggregate_id, occurred_at DESC);
-- Filtre par personnage dans une campagne
CREATE INDEX events_campaign_character ON events (campaign_id, character_id, seq)
  WHERE character_id IS NOT NULL;
-- Filet : un événement hors des partitions mensuelles n'est jamais refusé
CREATE TABLE events_default PARTITION OF events DEFAULT;
-- Le service ajoute et lit, rien d'autre ; les partitions ne sont lues qu'à travers events
REVOKE UPDATE, DELETE, TRUNCATE ON events FROM history_svc;
REVOKE ALL ON events_default FROM history_svc;
--rollback DROP TABLE events;

--changeset history:0001-heads
--comment: Tête de chaîne de chaque campagne (dernier seq et dernier hash), verrouillée à chaque ajout, et dédoublonnage des événements reçus (livraison au moins une fois).
CREATE TABLE campaign_heads (
  campaign_id uuid        PRIMARY KEY,
  last_seq    bigint      NOT NULL,
  last_hash   bytea,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_heads_seq CHECK (last_seq >= 0),
  CONSTRAINT campaign_heads_hash CHECK ((last_seq = 0) = (last_hash IS NULL))
);
REVOKE DELETE, TRUNCATE ON campaign_heads FROM history_svc;

CREATE TABLE inbox (
  event_id     uuid        PRIMARY KEY,
  consumer     text        NOT NULL,                        -- 'history' (bus) ou 'import' (ancien Historique)
  processed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE, TRUNCATE ON inbox FROM history_svc;
--rollback DROP TABLE inbox;
--rollback DROP TABLE campaign_heads;

--changeset history:0001-chain splitStatements:false
--comment: Hash de chaque événement, sha256(prev_hash || JSON canonique), calculé par Postgres à l'insertion et recalculé par verify_chain() : une seule définition, vérifiable depuis psql (test de restauration). Journal en ajout seul, même pour le propriétaire.
-- JSON canonique d'un événement : l'enveloppe du bus plus son rang, sérialisée
-- par jsonb (clés triées, sans espace superflu), la date en UTC à la microseconde.
-- Liste de champs explicite : ajouter une colonne ne change pas le hash des
-- événements déjà enregistrés.
CREATE FUNCTION event_canonical(
  p_id uuid, p_occurred_at timestamptz, p_campaign_id uuid, p_seq bigint, p_type text,
  p_version int, p_actor_id uuid, p_actor_role text, p_actor_character_id uuid,
  p_aggregate_type text, p_aggregate_id text, p_visibility text, p_payload jsonb,
  p_correlation_id text, p_causation_id text, p_traceparent text
) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', p_id,
    'type', p_type,
    'version', p_version,
    'occurredAt', to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'roomId', p_campaign_id,
    'seq', p_seq,
    'actor', jsonb_build_object(
      'userId', p_actor_id, 'role', p_actor_role, 'characterId', p_actor_character_id),
    'aggregate', jsonb_build_object('type', p_aggregate_type, 'id', p_aggregate_id),
    'visibility', p_visibility,
    'payload', p_payload,
    'correlationId', p_correlation_id,
    'causationId', p_causation_id,
    'traceparent', p_traceparent
  )::text
$$;

CREATE FUNCTION event_hash(p_prev bytea, p_canonical text) RETURNS bytea
LANGUAGE sql STABLE AS $$
  SELECT sha256(coalesce(p_prev, ''::bytea) || convert_to(p_canonical, 'UTF8'))
$$;

CREATE FUNCTION events_hash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Le hash n'est jamais fourni par le service : toujours recalculé ici
  NEW.hash := history.event_hash(NEW.prev_hash, history.event_canonical(
    NEW.id, NEW.occurred_at, NEW.campaign_id, NEW.seq, NEW.type, NEW.version,
    NEW.actor_id, NEW.actor_role, NEW.actor_character_id, NEW.aggregate_type,
    NEW.aggregate_id, NEW.visibility, NEW.payload, NEW.correlation_id,
    NEW.causation_id, NEW.traceparent));
  RETURN NEW;
END $$;
CREATE TRIGGER events_hash BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION events_hash();

-- Ceinture et bretelles : même le propriétaire ne peut ni modifier ni supprimer
CREATE FUNCTION events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history.events est en ajout seul (% refusé)', TG_OP;
END $$;
CREATE TRIGGER events_no_update BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_immutable();
CREATE TRIGGER events_no_truncate BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION events_immutable();

-- Vérification d'une chaîne (p_campaign null : événements globaux, hash seul).
-- Renvoie les maillons cassés : hash recalculé différent, trou dans les seq,
-- prev_hash qui ne suit pas, ou tête de chaîne qui ne correspond plus au
-- dernier événement (événements retirés en fin de chaîne).
CREATE FUNCTION verify_chain(p_campaign uuid)
RETURNS TABLE (seq bigint, id uuid, reason text) LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT e.*,
           lag(e.hash) OVER w AS expected_prev,
           lag(e.seq) OVER w AS previous_seq
    FROM history.events e
    WHERE e.campaign_id IS NOT DISTINCT FROM p_campaign
    WINDOW w AS (ORDER BY e.seq, e.occurred_at, e.id)
  ), checked AS (
    SELECT o.seq, o.id,
      CASE
        WHEN o.hash IS DISTINCT FROM history.event_hash(o.prev_hash, history.event_canonical(
          o.id, o.occurred_at, o.campaign_id, o.seq, o.type, o.version, o.actor_id,
          o.actor_role, o.actor_character_id, o.aggregate_type, o.aggregate_id,
          o.visibility, o.payload, o.correlation_id, o.causation_id, o.traceparent))
          THEN 'hash'
        WHEN p_campaign IS NOT NULL AND o.seq <> coalesce(o.previous_seq, 0) + 1 THEN 'seq'
        WHEN p_campaign IS NOT NULL AND o.prev_hash IS DISTINCT FROM o.expected_prev
          THEN 'prev_hash'
      END AS reason
    FROM ordered o
  )
  SELECT c.seq, c.id, c.reason FROM checked c WHERE c.reason IS NOT NULL
  UNION ALL
  SELECT h.last_seq, NULL::uuid, 'head'
  FROM history.campaign_heads h
  LEFT JOIN LATERAL (
    SELECT e.seq, e.hash FROM history.events e
    WHERE e.campaign_id = h.campaign_id ORDER BY e.seq DESC LIMIT 1
  ) last ON true
  WHERE p_campaign IS NOT NULL AND h.campaign_id = p_campaign
    AND (coalesce(last.seq, 0) <> h.last_seq OR last.hash IS DISTINCT FROM h.last_hash)
  ORDER BY 1
$$;
--rollback DROP FUNCTION verify_chain(uuid);
--rollback DROP TRIGGER events_no_truncate ON events;
--rollback DROP TRIGGER events_no_update ON events;
--rollback DROP FUNCTION events_immutable();
--rollback DROP TRIGGER events_hash ON events;
--rollback DROP FUNCTION events_hash();
--rollback DROP FUNCTION event_hash(bytea, text);
--rollback DROP FUNCTION event_canonical(uuid, timestamptz, uuid, bigint, text, int, uuid, text, uuid, text, text, text, jsonb, text, text, text);

--changeset history:0001-partitions splitStatements:false
--comment: Partitions mensuelles créées à l'avance : au démarrage du service (et chaque jour), et par l'import pour les mois de l'ancien Historique. SECURITY DEFINER : le rôle du service n'a pas le droit CREATE, il ne peut créer que ces partitions.
CREATE FUNCTION ensure_partitions(p_from date, p_months int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET timezone = 'UTC'
AS $$
DECLARE
  first_month timestamptz := date_trunc('month', p_from::timestamptz);
  month_start timestamptz;
  month_end   timestamptz;
  partition   text;
  created     int := 0;
BEGIN
  IF p_from IS NULL OR p_months IS NULL OR p_months < 1 OR p_months > 240 THEN
    RAISE EXCEPTION 'ensure_partitions : paramètres invalides (%, %)', p_from, p_months;
  END IF;
  -- Plusieurs réplicas peuvent démarrer ensemble : une création à la fois
  PERFORM pg_advisory_xact_lock(hashtextextended('history.ensure_partitions', 0));
  FOR i IN 0 .. p_months - 1 LOOP
    month_start := first_month + make_interval(months => i);
    month_end := month_start + interval '1 month';
    partition := 'events_' || to_char(month_start, 'YYYY_MM');
    CONTINUE WHEN to_regclass('history.' || partition) IS NOT NULL;
    -- Des événements de ce mois déjà rangés dans la partition par défaut
    -- empêcheraient la création : ils y restent (le journal ne se déplace pas)
    IF EXISTS (SELECT 1 FROM history.events_default d
               WHERE d.occurred_at >= month_start AND d.occurred_at < month_end) THEN
      RAISE WARNING 'history.% non créée : événements du mois déjà dans events_default', partition;
      CONTINUE;
    END IF;
    EXECUTE format('CREATE TABLE history.%I PARTITION OF history.events FOR VALUES FROM (%L) TO (%L)',
                   partition, month_start, month_end);
    -- Lecture et ajout uniquement à travers history.events
    EXECUTE format('REVOKE ALL ON history.%I FROM history_svc', partition);
    created := created + 1;
  END LOOP;
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION ensure_partitions(date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_partitions(date, int) TO history_svc;
-- Mois courant et deux suivants dès la migration ; le service complète ensuite
SELECT ensure_partitions(current_date, 3);
--rollback DROP FUNCTION ensure_partitions(date, int);
