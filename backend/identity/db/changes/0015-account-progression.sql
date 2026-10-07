--liquibase formatted sql

--changeset identity:0015-inbox-per-consumer
--comment: L'inbox dédoublonne par consommateur : deux consommateurs d'identity (identity-titles, identity-progression) doivent pouvoir enregistrer le même événement (docs/progression.md § 2).
ALTER TABLE inbox DROP CONSTRAINT inbox_pkey;
ALTER TABLE inbox ADD PRIMARY KEY (consumer, event_id);
--rollback ALTER TABLE inbox DROP CONSTRAINT inbox_pkey;
--rollback ALTER TABLE inbox ADD PRIMARY KEY (event_id);

--changeset identity:0015-account-progression
--comment: Progression du compte (docs/progression.md) : XP et niveau, détail par jour et par activité (plafonds, défis du jour et de la semaine, conservé 90 jours), compteurs à vie, clés d'unicité et défis accomplis. Tenue par le consommateur identity-progression ; supprimée avec le compte.
CREATE TABLE account_progress (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  xp         bigint      NOT NULL DEFAULT 0,
  level      integer     NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_progress_xp_positive CHECK (xp >= 0),
  CONSTRAINT account_progress_level_positive CHECK (level >= 1)
);

CREATE TABLE progression_daily (
  user_id  uuid    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Jour de Paris de l'activité
  day      date    NOT NULL,
  activity text    NOT NULL,
  units    integer NOT NULL DEFAULT 0,
  xp       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, activity),
  CONSTRAINT progression_daily_activity_format CHECK (activity ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT progression_daily_positive CHECK (units >= 0 AND xp >= 0)
);
-- Purge du détail de plus de 90 jours
CREATE INDEX progression_daily_day ON progression_daily (day);

CREATE TABLE progression_counters (
  user_id  uuid   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity text   NOT NULL,
  total    bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, activity),
  CONSTRAINT progression_counters_activity_format CHECK (activity ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT progression_counters_positive CHECK (total >= 0)
);

-- Une activité déjà vue avec la même clé (campagne rejointe, ami, séance d'un jour) est ignorée
CREATE TABLE progression_keys (
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity   text        NOT NULL,
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity, key),
  CONSTRAINT progression_keys_key_length CHECK (char_length(key) BETWEEN 1 AND 100)
);

CREATE TABLE progression_challenges (
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  challenge_id text        NOT NULL,
  -- AAAA-MM-JJ (quotidien), AAAA-Www (hebdomadaire), « permanent »
  period       text        NOT NULL,
  xp           integer     NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_id, period),
  CONSTRAINT progression_challenges_id_format CHECK (challenge_id ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT progression_challenges_xp_positive CHECK (xp >= 0)
);
--rollback DROP TABLE progression_challenges;
--rollback DROP TABLE progression_keys;
--rollback DROP TABLE progression_counters;
--rollback DROP TABLE progression_daily;
--rollback DROP TABLE account_progress;
