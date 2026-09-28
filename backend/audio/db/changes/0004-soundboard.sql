--liquibase formatted sql

--changeset audio:0004-soundboards
--comment: Table d'effets du MJ, une par campagne : les sons qu'il a choisis (toute source, tout type), dans son ordre. Sans ligne : table vide.
CREATE TABLE soundboards (
  campaign_id uuid        PRIMARY KEY,
  asset_ids   uuid[]      NOT NULL DEFAULT '{}',
  version     int         NOT NULL DEFAULT 1,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT soundboards_size CHECK (cardinality(asset_ids) <= 60)
);
--rollback DROP TABLE soundboards;
