--liquibase formatted sql

-- Projection et documents (docs/projection.md) : bibliothèque de documents du MJ (images,
-- vidéos) et leurs partages, projetés en plein écran ou envoyés, à toute la table ou à certains.

--changeset campaign:0029-handouts
--comment: Documents du MJ : fichier de la campagne (campaigns/<id>/…), nom, type.
CREATE TABLE campaign_handouts (
  id           uuid        PRIMARY KEY,
  campaign_id  uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name         text        NOT NULL,
  url          text        NOT NULL,
  content_type text        NOT NULL,
  created_by   uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_handouts_name_length CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT campaign_handouts_url_length CHECK (char_length(url) <= 2048)
);
CREATE INDEX campaign_handouts_campaign ON campaign_handouts (campaign_id, created_at DESC);
--rollback DROP TABLE campaign_handouts;

--changeset campaign:0029-handout-shares
--comment: Partages d'un document : projeté (show) ou envoyé (send) ; recipients null : toute la table.
CREATE TABLE campaign_handout_shares (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  handout_id  uuid        NOT NULL REFERENCES campaign_handouts (id) ON DELETE CASCADE,
  mode        text        NOT NULL,
  recipients  uuid[],
  shared_by   uuid        NOT NULL,
  shared_at   timestamptz NOT NULL DEFAULT now(),
  starts_at   timestamptz NOT NULL,
  stopped_at  timestamptz,
  CONSTRAINT campaign_handout_shares_mode CHECK (mode IN ('show', 'send'))
);
CREATE INDEX campaign_handout_shares_campaign ON campaign_handout_shares (campaign_id, shared_at DESC);
--rollback DROP TABLE campaign_handout_shares;
