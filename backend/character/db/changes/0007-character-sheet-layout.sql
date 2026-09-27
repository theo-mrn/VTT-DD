--liquibase formatted sql

-- Mise en page de la fiche d'un personnage, choisie par son propriétaire ou le MJ de sa
-- campagne : blocs affichés (widgets de la présentation du système, avec leurs paramètres)
-- et leur position dans la grille, par largeur d'écran. NULL : disposition par défaut,
-- déduite de la présentation du système. Forme validée par le service (schéma Zod strict,
-- taille bornée) ; la base garantit seulement un objet JSON.

--changeset character:0007-character-sheet-layout
--comment: sheet_layout = { format, blocks, layouts } ou NULL (disposition par défaut).
ALTER TABLE characters ADD COLUMN sheet_layout jsonb;
ALTER TABLE characters ADD CONSTRAINT characters_sheet_layout_object
  CHECK (sheet_layout IS NULL OR jsonb_typeof(sheet_layout) = 'object');
--rollback ALTER TABLE characters DROP COLUMN sheet_layout;
