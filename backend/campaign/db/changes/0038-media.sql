--liquibase formatted sql

-- Médiathèque de la campagne (docs/mediatheque.md) : dossiers des images, qui a envoyé un
-- fichier, ce que voient les joueurs.

--changeset campaign:0038-media
--comment: Dossiers de la médiathèque, dossier, auteur et visibilité des fichiers.
CREATE TABLE campaign_media_folders (
  id                 uuid        PRIMARY KEY,
  campaign_id        uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  parent_id          uuid        REFERENCES campaign_media_folders (id),
  name               text        NOT NULL,
  owner_id           uuid        NOT NULL,
  visible_to_players boolean     NOT NULL DEFAULT false,
  version            int         NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_media_folders_name_length CHECK (char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT campaign_media_folders_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX campaign_media_folders_campaign ON campaign_media_folders (campaign_id);

ALTER TABLE campaign_storage_files
  ADD COLUMN folder_id uuid REFERENCES campaign_media_folders (id) ON DELETE SET NULL,
  ADD COLUMN uploaded_by uuid,
  ADD COLUMN visible_to_players boolean NOT NULL DEFAULT false;
CREATE INDEX campaign_storage_files_folder ON campaign_storage_files (campaign_id, folder_id);
--rollback ALTER TABLE campaign_storage_files DROP COLUMN visible_to_players, DROP COLUMN uploaded_by, DROP COLUMN folder_id; DROP TABLE campaign_media_folders;
