--liquibase formatted sql

-- Réglages de campagne décidés par le MJ pour toute la table (lanceur de dés : attributs retirés).
-- Un document jsonb validé par le service (Zod), versionné à part de la campagne : modifier un
-- réglage n'entre pas en conflit avec une modification du titre. Les droits DML de campaign_svc
-- viennent des privilèges par défaut.

--changeset campaign:0015-campaign-settings
--comment: Réglages de table d'une campagne (document jsonb, version propre).
CREATE TABLE campaign_settings (
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  settings    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  version     integer     NOT NULL DEFAULT 1,
  updated_by  uuid        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_settings_pkey PRIMARY KEY (campaign_id),
  CONSTRAINT campaign_settings_object CHECK (jsonb_typeof(settings) = 'object')
);
--rollback DROP TABLE campaign_settings;
