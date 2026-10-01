--liquibase formatted sql

-- Les modèles de PNJ et d'objets n'ont pas de corbeille (docs/nettoyage.md) : un modèle disparaît
-- seulement quand le MJ le supprime, aussitôt, et rien d'automatique n'y touche. Ceux qui étaient
-- marqués avaient été supprimés par le MJ : ils partent.

--changeset character:0013-templates-without-trash
--comment: Retire la corbeille des modèles ; les modèles déjà marqués sont supprimés.
DELETE FROM npc_templates WHERE deleted_at IS NOT NULL;
DELETE FROM object_templates WHERE deleted_at IS NOT NULL;
DROP INDEX npc_templates_deleted_at_idx;
DROP INDEX object_templates_deleted_at_idx;
ALTER TABLE npc_templates DROP COLUMN deleted_at;
ALTER TABLE object_templates DROP COLUMN deleted_at;
--rollback ALTER TABLE npc_templates ADD COLUMN deleted_at timestamptz;
--rollback ALTER TABLE object_templates ADD COLUMN deleted_at timestamptz;
--rollback CREATE INDEX npc_templates_deleted_at_idx ON npc_templates (deleted_at) WHERE deleted_at IS NOT NULL;
--rollback CREATE INDEX object_templates_deleted_at_idx ON object_templates (deleted_at) WHERE deleted_at IS NOT NULL;
