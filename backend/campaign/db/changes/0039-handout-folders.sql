--liquibase formatted sql

-- Documents du MJ rangés dans les dossiers de la campagne (docs/mediatheque.md) : le même
-- rangement que la médiathèque.

--changeset campaign:0039-handout-folders
--comment: Dossier d'un document (projection) ; null : racine.
ALTER TABLE campaign_handouts
  ADD COLUMN folder_id uuid REFERENCES campaign_media_folders (id) ON DELETE SET NULL;
CREATE INDEX campaign_handouts_folder ON campaign_handouts (campaign_id, folder_id);
--rollback ALTER TABLE campaign_handouts DROP COLUMN folder_id;
