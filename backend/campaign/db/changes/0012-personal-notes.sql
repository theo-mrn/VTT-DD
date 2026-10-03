--liquibase formatted sql

-- Espace Notes : notes personnelles (sans campagne), icône, partage avec le MJ et épingles.
-- Contrat : docs/api-notes.md. Les droits DML de campaign_svc viennent des privilèges par défaut.

--changeset campaign:0012-personal-notes
--comment: Une note sans campagne est personnelle : son auteur seul la lit, elle ne se partage pas.
ALTER TABLE notes ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE notes ADD CONSTRAINT notes_personal
  CHECK (campaign_id IS NOT NULL OR (NOT shared AND character_id IS NULL));
-- Notes personnelles d'un auteur, les plus récentes d'abord ; notes d'une campagne, idem
CREATE INDEX notes_personal ON notes (owner_user_id, updated_at DESC, id DESC)
  WHERE campaign_id IS NULL;
CREATE INDEX notes_campaign_recent ON notes (campaign_id, updated_at DESC, id DESC)
  WHERE campaign_id IS NOT NULL;
-- Quota par auteur (toutes notes confondues)
CREATE INDEX notes_author ON notes (owner_user_id);
-- Retour arrière : les notes personnelles n'ont pas de place dans l'ancien schéma
--rollback DROP INDEX notes_author; DROP INDEX notes_campaign_recent; DROP INDEX notes_personal;
--rollback ALTER TABLE notes DROP CONSTRAINT notes_personal;
--rollback DELETE FROM notes WHERE campaign_id IS NULL;
--rollback ALTER TABLE notes ALTER COLUMN campaign_id SET NOT NULL;

--changeset campaign:0012-notes-icon-gm-share
--comment: Icône (un emoji) et partage avec les MJ de la campagne. Une note partagée avec des personnages peut l'être aussi avec les MJ ; shared_with vide : avec les MJ seulement.
ALTER TABLE notes ADD COLUMN icon text;
ALTER TABLE notes ADD CONSTRAINT notes_icon_length CHECK (char_length(icon) BETWEEN 1 AND 32);
ALTER TABLE notes ADD COLUMN shared_with_gm boolean NOT NULL DEFAULT false;
ALTER TABLE notes ADD CONSTRAINT notes_shared_with_gm
  CHECK (NOT shared_with_gm OR (shared AND shared_with IS NOT NULL));
ALTER TABLE notes ADD CONSTRAINT notes_share_target
  CHECK (shared_with IS NULL OR cardinality(shared_with) > 0 OR shared_with_gm);
--rollback ALTER TABLE notes DROP CONSTRAINT notes_share_target;
--rollback ALTER TABLE notes DROP CONSTRAINT notes_shared_with_gm;
--rollback ALTER TABLE notes DROP COLUMN shared_with_gm;
--rollback ALTER TABLE notes DROP COLUMN icon;

--changeset campaign:0012-note-pins
--comment: Épingles : une préférence de chaque lecteur (épingler une note partagée ne l'épingle pas pour les autres).
CREATE TABLE note_pins (
  user_id   uuid        NOT NULL,
  note_id   uuid        NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT note_pins_pkey PRIMARY KEY (user_id, note_id)
);
CREATE INDEX note_pins_note ON note_pins (note_id);
--rollback DROP TABLE note_pins;
