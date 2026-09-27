--liquibase formatted sql

-- Présentation libre d'un personnage, écrite par son joueur : concept (une phrase), apparence
-- et histoire. Rien de calculé : l'état de jeu reste dans `etat`.

--changeset character:0004-character-details
--comment: Concept, apparence et histoire d'un personnage (objet JSON { concept, appearance, backstory }).
ALTER TABLE characters ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE characters ADD CONSTRAINT characters_details_object CHECK (jsonb_typeof(details) = 'object');
--rollback ALTER TABLE characters DROP COLUMN details;
