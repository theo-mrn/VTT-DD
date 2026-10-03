--liquibase formatted sql

-- Corbeille (docs/nettoyage.md) : un modèle de PNJ ou d'objet supprimé est d'abord marqué, comme
-- un personnage, restaurable 7 jours, puis purgé. Index partiels : la purge ne lit que les lignes
-- marquées.

--changeset character:0012-trash
--comment: Corbeille des modèles ; index de purge des personnages et des modèles marqués.
ALTER TABLE npc_templates ADD COLUMN deleted_at timestamptz;
ALTER TABLE object_templates ADD COLUMN deleted_at timestamptz;
CREATE INDEX characters_deleted_at_idx ON characters (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX npc_templates_deleted_at_idx ON npc_templates (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX object_templates_deleted_at_idx ON object_templates (deleted_at) WHERE deleted_at IS NOT NULL;
--rollback DROP INDEX object_templates_deleted_at_idx;
--rollback DROP INDEX npc_templates_deleted_at_idx;
--rollback DROP INDEX characters_deleted_at_idx;
--rollback ALTER TABLE object_templates DROP COLUMN deleted_at;
--rollback ALTER TABLE npc_templates DROP COLUMN deleted_at;
