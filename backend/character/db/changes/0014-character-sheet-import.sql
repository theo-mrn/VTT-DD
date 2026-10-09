--liquibase formatted sql

-- Personnage importé d'une fiche (docs/import-fiche.md § 5.2) : quand, d'où, et ses écarts aux
-- règles de création, montrés au MJ. NULL : personnage créé dans l'app.

--changeset character:0014-character-sheet-import
--comment: Marque d'import d'une fiche (date, source, écarts aux règles).
ALTER TABLE characters ADD COLUMN sheet_import jsonb;
--rollback ALTER TABLE characters DROP COLUMN sheet_import;
