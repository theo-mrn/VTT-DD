--liquibase formatted sql

-- Mémoire de l'exploration (docs/exploration.md) : ce que les observateurs du groupe ont déjà vu
-- d'une scène reste montré, grisé. Un masque raster par scène (bits tassés), calculé par le
-- service après chaque changement de vue, à partir d'une file remplie dans la transaction de
-- l'écriture.

--changeset campaign:0031-map-exploration-mode
--comment: Exploration par scène : coupée (off) ou partagée par le groupe (party). Les scènes existantes restent coupées, les nouvelles naissent avec.
ALTER TABLE maps ADD COLUMN exploration text NOT NULL DEFAULT 'off';
ALTER TABLE maps ADD CONSTRAINT maps_exploration CHECK (exploration IN ('off', 'party'));
ALTER TABLE maps ALTER COLUMN exploration SET DEFAULT 'party';
--rollback ALTER TABLE maps DROP COLUMN exploration;

--changeset campaign:0031-map-explorations
--comment: Masque d'exploration d'une scène (un par portée : party), cols × rows cases, 8 par octet.
CREATE TABLE map_explorations (
  map_id      uuid        NOT NULL,
  scope       text        NOT NULL DEFAULT 'party',
  campaign_id uuid        NOT NULL,
  cols        int         NOT NULL,
  rows        int         NOT NULL,
  cells       bytea       NOT NULL,
  version     int         NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, scope),
  CONSTRAINT map_explorations_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_explorations_scope CHECK (scope IN ('party')),
  CONSTRAINT map_explorations_grid CHECK (cols BETWEEN 1 AND 512 AND rows BETWEEN 1 AND 512),
  CONSTRAINT map_explorations_cells CHECK (octet_length(cells) = (cols * rows + 7) / 8),
  CONSTRAINT map_explorations_version_positive CHECK (version >= 1)
);
--rollback DROP TABLE map_explorations;

--changeset campaign:0031-map-exploration-queue
--comment: Scènes à explorer : une ligne par scène, visible au COMMIT de l'écriture, prise par un seul réplica (SKIP LOCKED).
CREATE TABLE map_exploration_queue (
  map_id      uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL,
  queued_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_exploration_queue_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE
);
CREATE INDEX map_exploration_queue_order ON map_exploration_queue (queued_at);
--rollback DROP TABLE map_exploration_queue;
