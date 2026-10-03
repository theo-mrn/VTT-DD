--liquibase formatted sql

-- Rotation des textes de la carte (docs/carte.md § 10, Dessins et textes) : en degrés, autour de
-- `pos` (début de la ligne de base de la première ligne). Les textes existants restent droits.

--changeset campaign:0019-map-note-rotation
--comment: Rotation des textes de la carte (degrés, autour du début de la ligne de base).
ALTER TABLE map_notes ADD COLUMN rotation real NOT NULL DEFAULT 0;
--rollback ALTER TABLE map_notes DROP COLUMN rotation;
