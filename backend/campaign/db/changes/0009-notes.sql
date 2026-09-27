--liquibase formatted sql

-- Notes de campagne (le « Grimoire » de l'ancienne app) : notes privées (legacy
-- Notes/{r}/{perso}/{id}) et partagées (legacy SharedNotes/{r}/notes/{id}) dans une même table.
-- Une note appartient à un utilisateur (owner_user_id). Privée : lui seul la lit. Partagée :
-- tous les membres (shared_with NULL, legacy « all ») ou les joueurs des personnages de
-- shared_with. Droits et événements : docs/api-notes.md. Les droits DML de campaign_svc
-- viennent des privilèges par défaut.

--changeset campaign:0009-notes
--comment: Notes privées et partagées. character_id : personnage incarné par l'auteur quand il l'a écrite (legacy : clé du chemin ou createdBy).
CREATE TABLE notes (
  id            uuid        PRIMARY KEY,
  campaign_id   uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  owner_user_id uuid        NOT NULL,
  character_id  uuid,
  shared        boolean     NOT NULL DEFAULT false,
  shared_with   uuid[],                                -- personnages destinataires ; NULL : tous
  title         text        NOT NULL DEFAULT '',
  content       text        NOT NULL DEFAULT '',       -- HTML de l'éditeur
  type          text        NOT NULL DEFAULT 'other',
  tags          jsonb       NOT NULL DEFAULT '[]',     -- [{ id, label }]
  image_url     text,                                  -- image d'en-tête de la carte
  race          text,                                  -- type character
  class         text,                                  -- type character
  region        text,                                  -- type location
  item_type     text,                                  -- type item
  quest_type    text,
  quest_status  text,
  sub_quests    jsonb       NOT NULL DEFAULT '[]',     -- étapes : [{ id, title, description, status }]
  version       int         NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notes_character FOREIGN KEY (campaign_id, character_id)
    REFERENCES campaign_characters (campaign_id, character_id) ON DELETE SET NULL (character_id),
  CONSTRAINT notes_shared_with CHECK (shared OR shared_with IS NULL),
  CONSTRAINT notes_shared_with_size CHECK (cardinality(shared_with) <= 100),
  CONSTRAINT notes_type CHECK (type IN ('character', 'location', 'item', 'quest', 'journal', 'other')),
  CONSTRAINT notes_quest_type CHECK (quest_type IN ('main', 'side')),
  CONSTRAINT notes_quest_status CHECK (quest_status IN ('not_started', 'in_progress', 'completed')),
  CONSTRAINT notes_title_length CHECK (char_length(title) <= 200),
  CONSTRAINT notes_content_length CHECK (char_length(content) <= 200000),
  CONSTRAINT notes_image_url_length CHECK (char_length(image_url) <= 2048),
  CONSTRAINT notes_race_length CHECK (char_length(race) <= 200),
  CONSTRAINT notes_class_length CHECK (char_length(class) <= 200),
  CONSTRAINT notes_region_length CHECK (char_length(region) <= 200),
  CONSTRAINT notes_item_type_length CHECK (char_length(item_type) <= 200),
  CONSTRAINT notes_tags CHECK (jsonb_typeof(tags) = 'array'),
  CONSTRAINT notes_sub_quests CHECK (jsonb_typeof(sub_quests) = 'array'),
  CONSTRAINT notes_version_positive CHECK (version >= 1)
);
CREATE INDEX notes_owner ON notes (campaign_id, owner_user_id);
CREATE INDEX notes_shared ON notes (campaign_id) WHERE shared;
--rollback DROP TABLE notes;
