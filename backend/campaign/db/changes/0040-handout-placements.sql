--liquibase formatted sql

-- Bibliothèque des joueurs (docs/mediatheque.md) : chaque joueur range les documents qu'il voit
-- (reçus, ou dans un dossier montré par le MJ) dans ses propres dossiers ; rangement personnel.

--changeset campaign:0040-handout-placements
--comment: Rangement personnel d'un document par un membre.
CREATE TABLE campaign_handout_placements (
  campaign_id uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  handout_id  uuid NOT NULL REFERENCES campaign_handouts (id) ON DELETE CASCADE,
  folder_id   uuid REFERENCES campaign_media_folders (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, handout_id)
);
CREATE INDEX campaign_handout_placements_campaign ON campaign_handout_placements (campaign_id, user_id);
--rollback DROP TABLE campaign_handout_placements;
