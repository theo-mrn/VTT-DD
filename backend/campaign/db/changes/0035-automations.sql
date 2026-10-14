--liquibase formatted sql

-- Automatismes (docs/automatismes.md) : réglages complets de la table (son, météo, écran,
-- temps du monde) et leurs déclencheurs. Ils remplacent la musique par scène (0034).

--changeset campaign:0035-automations
--comment: Réglages et déclencheurs du MJ ; la colonne maps.music (0034) est retirée.
CREATE TABLE automations (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  params      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  triggers    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  scene_ids   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sort_order  bigint      NOT NULL DEFAULT 0,
  version     int         NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automations_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT automations_params_object CHECK (jsonb_typeof(params) = 'object'),
  CONSTRAINT automations_triggers_array CHECK (jsonb_typeof(triggers) = 'array'),
  CONSTRAINT automations_scenes_array CHECK (jsonb_typeof(scene_ids) = 'array'),
  CONSTRAINT automations_version_positive CHECK (version >= 1)
);
CREATE INDEX automations_campaign ON automations (campaign_id);
ALTER TABLE maps DROP COLUMN music;
--rollback ALTER TABLE maps ADD COLUMN music jsonb; DROP TABLE automations;
