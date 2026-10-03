--liquibase formatted sql

-- Salle active d'un joueur (docs/discord.md) : la campagne que suivent ses jets Discord et où
-- l'activité le ramène. Liée à son appartenance : quitter la campagne (ou la supprimer) l'efface.

--changeset campaign:0030-active-campaigns
--comment: Une salle active par joueur, parmi les campagnes dont il est membre.
CREATE TABLE active_campaigns (
  user_id     uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_campaigns_member FOREIGN KEY (campaign_id, user_id)
    REFERENCES campaign_members (campaign_id, user_id) ON DELETE CASCADE
);
CREATE INDEX active_campaigns_campaign ON active_campaigns (campaign_id, user_id);
--rollback DROP TABLE active_campaigns;
