--liquibase formatted sql

--changeset audio:0002-channels
--comment: État de lecture qui fait autorité, un par canal (musique, ambiance) et par campagne : machine à états de docs/audio.md § 3.5. La position vaut position_ms à anchor_at (horloge du serveur).
CREATE TABLE channels (
  campaign_id  uuid        NOT NULL,
  channel      text        NOT NULL,
  version      bigint      NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'stopped',
  asset_id     uuid        REFERENCES assets (id) ON DELETE SET NULL,
  playlist_id  uuid        REFERENCES playlists (id) ON DELETE SET NULL,
  queue        uuid[]      NOT NULL DEFAULT '{}',
  queue_index  int,
  repeat       text        NOT NULL DEFAULT 'all',
  shuffle      boolean     NOT NULL DEFAULT false,
  position_ms  bigint      NOT NULL DEFAULT 0,
  anchor_at    timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz,
  volume       real        NOT NULL DEFAULT 1,
  crossfade_ms int         NOT NULL DEFAULT 1500,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (campaign_id, channel),
  CONSTRAINT channels_channel CHECK (channel IN ('music', 'ambience')),
  CONSTRAINT channels_status CHECK (status IN ('stopped', 'playing', 'paused')),
  CONSTRAINT channels_repeat CHECK (repeat IN ('off', 'track', 'all')),
  CONSTRAINT channels_position CHECK (position_ms >= 0),
  CONSTRAINT channels_volume CHECK (volume BETWEEN 0 AND 1),
  CONSTRAINT channels_crossfade CHECK (crossfade_ms BETWEEN 0 AND 10000),
  CONSTRAINT channels_queue_index CHECK (queue_index IS NULL OR queue_index >= 0)
);
-- Planificateur : pistes à enchaîner (SKIP LOCKED toutes les 500 ms)
CREATE INDEX channels_due ON channels (ends_at) WHERE status = 'playing' AND ends_at IS NOT NULL;
--rollback DROP TABLE channels;

--changeset audio:0002-cues
--comment: Effets ponctuels lancés (MJ seul) : arrêt, débit par utilisateur, audit court (purgés après 24 h). L'id est choisi par le client (clé d'idempotence).
CREATE TABLE cues (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL,
  asset_id    uuid        NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  volume      real        NOT NULL DEFAULT 1,
  started_by  uuid        NOT NULL,
  start_at    timestamptz NOT NULL,
  stopped_at  timestamptz,
  CONSTRAINT cues_volume CHECK (volume BETWEEN 0 AND 1)
);
CREATE INDEX cues_user_recent ON cues (started_by, start_at DESC);
CREATE INDEX cues_campaign_active ON cues (campaign_id, start_at DESC) WHERE stopped_at IS NULL;
--rollback DROP TABLE cues;

--changeset audio:0002-mixer
--comment: Mixeur personnel d'un utilisateur, partagé entre ses appareils (décision Q3). Sans ligne : tout à 1, rien de coupé.
CREATE TABLE mixer_preferences (
  user_id    uuid        PRIMARY KEY,
  volumes    jsonb       NOT NULL,
  muted      jsonb       NOT NULL DEFAULT '{}',
  version    int         NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mixer_volumes CHECK (jsonb_typeof(volumes) = 'object'),
  CONSTRAINT mixer_muted CHECK (jsonb_typeof(muted) = 'object')
);
--rollback DROP TABLE mixer_preferences;
