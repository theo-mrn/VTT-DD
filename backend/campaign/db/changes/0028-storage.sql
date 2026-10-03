--liquibase formatted sql

-- Stockage d'une campagne (docs/stockage.md) : inventaire de ses fichiers sur R2 (campaigns/,
-- characters/ de ses personnages, audio/), réservations des envois en cours, quota.

--changeset campaign:0028-storage-files
--comment: Fichiers d'une campagne : réservés à l'envoi (pending), puis vus par l'inventaire (stored).
CREATE TABLE campaign_storage_files (
  key          text        PRIMARY KEY,
  campaign_id  uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  size         bigint      NOT NULL,
  content_type text,
  -- Usage réservé (map-background, portrait, sound…) ; null : découvert par l'inventaire
  usage        text,
  state        text        NOT NULL DEFAULT 'pending',
  -- Tables qui citent le fichier (tous services) ; vide : inutilisé
  used_by      text[]      NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  seen_at      timestamptz,
  CONSTRAINT campaign_storage_files_size CHECK (size >= 0),
  CONSTRAINT campaign_storage_files_state CHECK (state IN ('pending', 'stored')),
  CONSTRAINT campaign_storage_files_key_length CHECK (char_length(key) <= 512)
);
CREATE INDEX campaign_storage_files_campaign ON campaign_storage_files (campaign_id);
--rollback DROP TABLE campaign_storage_files;

--changeset campaign:0028-storage-inventories
--comment: Dernier inventaire d'une campagne (l'écran le refait au-delà de 10 minutes).
CREATE TABLE campaign_storage_inventories (
  campaign_id    uuid        PRIMARY KEY REFERENCES campaigns (id) ON DELETE CASCADE,
  inventoried_at timestamptz NOT NULL
);
--rollback DROP TABLE campaign_storage_inventories;
