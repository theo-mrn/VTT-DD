--liquibase formatted sql

--changeset audio:0001-assets
--comment: Bibliothèque de sons d'une campagne : fichiers envoyés, entrées du catalogue, liens YouTube (docs/audio.md § 3.2). Suppression logique (deleted_at), purge des fichiers 30 jours plus tard.
CREATE TABLE assets (
  id             uuid        PRIMARY KEY,
  campaign_id    uuid        NOT NULL,
  kind           text        NOT NULL,
  name           text        NOT NULL,
  source         text        NOT NULL,
  status         text        NOT NULL,
  catalog_id     text,
  original_key   text,
  youtube_id     text,
  playback_key   text,
  playback_url   text,
  mime_type      text,
  size_bytes     bigint,
  codec          text,
  sample_rate    int,
  channels       smallint,
  bitrate        int,
  duration_ms    int,
  loudness_lufs  real,
  true_peak_dbtp real,
  gain_db        real        NOT NULL DEFAULT 0,
  volume         real        NOT NULL DEFAULT 1,
  reject_reason  text,
  created_by     uuid,
  version        int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT assets_kind CHECK (kind IN ('music', 'ambience', 'sfx')),
  CONSTRAINT assets_name CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT assets_source CHECK (source IN ('upload', 'catalog', 'youtube')),
  CONSTRAINT assets_status CHECK (status IN ('processing', 'ready', 'rejected')),
  CONSTRAINT assets_youtube_id CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  CONSTRAINT assets_duration CHECK (duration_ms > 0),
  CONSTRAINT assets_size CHECK (size_bytes >= 0),
  CONSTRAINT assets_gain CHECK (gain_db BETWEEN -24 AND 12),
  CONSTRAINT assets_volume CHECK (volume BETWEEN 0 AND 1),
  CONSTRAINT assets_version CHECK (version >= 1),
  CONSTRAINT assets_source_fields CHECK (
    (source = 'youtube') = (youtube_id IS NOT NULL) AND
    (source = 'catalog') = (catalog_id IS NOT NULL) AND
    (source = 'upload')  = (original_key IS NOT NULL)),
  -- Une URL servie est absolue (https, ou http en dev)
  CONSTRAINT assets_playback_url CHECK (playback_url ~ '^https?://')
);
CREATE INDEX assets_campaign ON assets (campaign_id, kind, name) WHERE deleted_at IS NULL;
-- Quota : somme des tailles des fichiers vivants d'une campagne
CREATE INDEX assets_campaign_size ON assets (campaign_id) INCLUDE (size_bytes)
  WHERE deleted_at IS NULL AND source = 'upload';
--rollback DROP TABLE assets;

--changeset audio:0001-playlists
--comment: Playlists du MJ. Un asset supprimé en sort dans la même transaction (cascade logique par le service, physique par la clé étrangère).
CREATE TABLE playlists (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL,
  name        text        NOT NULL,
  created_by  uuid,
  version     int         NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playlists_name CHECK (char_length(name) BETWEEN 1 AND 100)
);
CREATE INDEX playlists_campaign ON playlists (campaign_id, name);

CREATE TABLE playlist_items (
  playlist_id uuid NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  position    int  NOT NULL,
  PRIMARY KEY (playlist_id, asset_id),
  CONSTRAINT playlist_items_position UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX playlist_items_asset ON playlist_items (asset_id);
--rollback DROP TABLE playlist_items;
--rollback DROP TABLE playlists;

--changeset audio:0001-legacy-ids
--comment: Correspondance des documents de l'ancienne app (sound_templates, playlists) vers les ids du service : import rejouable.
CREATE TABLE legacy_ids (
  source      text NOT NULL,
  legacy_id   text NOT NULL,
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  PRIMARY KEY (source, legacy_id),
  CONSTRAINT legacy_ids_target_type CHECK (target_type IN ('asset', 'playlist', 'channel'))
);
--rollback DROP TABLE legacy_ids;
