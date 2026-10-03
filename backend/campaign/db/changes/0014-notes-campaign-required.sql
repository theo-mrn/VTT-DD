--liquibase formatted sql

-- Une note n'existe que dans une campagne : plus de notes personnelles (0012-personal-notes.sql
-- les avait permises). Les notes sans campagne (données de test de l'espace Notes, aucune n'a été
-- importée) sont supprimées, avec leurs épingles (ON DELETE CASCADE). Contrat : docs/api-notes.md.

--changeset campaign:0014-notes-campaign-required
--comment: Supprime les notes sans campagne et rend campaign_id obligatoire.
DELETE FROM notes WHERE campaign_id IS NULL;
DROP INDEX notes_personal;
ALTER TABLE notes DROP CONSTRAINT notes_personal;
ALTER TABLE notes ALTER COLUMN campaign_id SET NOT NULL;
-- Retour arrière : la colonne redevient facultative ; les notes supprimées ne reviennent pas
--rollback ALTER TABLE notes ALTER COLUMN campaign_id DROP NOT NULL;
--rollback ALTER TABLE notes ADD CONSTRAINT notes_personal
--rollback   CHECK (campaign_id IS NOT NULL OR (NOT shared AND character_id IS NULL));
--rollback CREATE INDEX notes_personal ON notes (owner_user_id, updated_at DESC, id DESC)
--rollback   WHERE campaign_id IS NULL;
