--liquibase formatted sql

-- Invitations nominatives : le MJ invite un utilisateur précis (un ami), qui voit l'invitation
-- et rejoint la campagne sans code, même privée ; il peut aussi la décliner. Distinctes des
-- liens d'invitation (campaign_invitations), qui valent pour qui détient le code. Les droits
-- DML de campaign_svc viennent des privilèges par défaut.

--changeset campaign:0011-campaign-invitees
--comment: Invitations nominatives en attente (une par campagne et par utilisateur invité).
CREATE TABLE campaign_invitees (
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  invited_by  uuid        NOT NULL,
  invited_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_invitees_pkey PRIMARY KEY (campaign_id, user_id)
);
-- Invitations reçues par un utilisateur, les plus récentes d'abord
CREATE INDEX campaign_invitees_user ON campaign_invitees (user_id, invited_at DESC);
--rollback DROP TABLE campaign_invitees;
