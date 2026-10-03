--liquibase formatted sql

-- Studio du portrait (docs/portraits.md) : le token d'un personnage (image carrée fabriquée dans
-- le navigateur : cadrage, cadre, arrondi, marge) et les réglages du Studio, pour le rouvrir.

--changeset character:0011-portrait-studio
--comment: Token du personnage et réglages du Studio du portrait.
ALTER TABLE characters ADD COLUMN token_url text;
ALTER TABLE characters ADD COLUMN portrait_studio jsonb;
--rollback ALTER TABLE characters DROP COLUMN portrait_studio;
--rollback ALTER TABLE characters DROP COLUMN token_url;
