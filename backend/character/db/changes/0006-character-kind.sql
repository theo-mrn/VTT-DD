--liquibase formatted sql

-- Joueur ou PNJ : « mes personnages » ne liste que les personnages joueurs. Les PNJ de
-- l'ancienne app (hors type « joueurs », attribués au créateur de la salle faute de joueur) sont
-- reclassés par un rejeu de l'import des personnages, qui connaît cette origine. Un personnage
-- créé dans la nouvelle app est un personnage joueur.

--changeset character:0006-character-kind
--comment: kind = pc (personnage joueur) ou npc (PNJ).
ALTER TABLE characters ADD COLUMN kind text NOT NULL DEFAULT 'pc';
ALTER TABLE characters ADD CONSTRAINT characters_kind_check CHECK (kind IN ('pc', 'npc'));
--rollback ALTER TABLE characters DROP COLUMN kind;
