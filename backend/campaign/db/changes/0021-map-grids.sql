--liquibase formatted sql

-- Quadrillages des scènes (docs/carte.md § 4) : une liste par scène, en pixels du monde (du
-- fond), au plus quatre, dont une grille de jeu qui donne la case de la scène (taille des
-- tokens, rayons en unités, aimantation). Sans grille de jeu, la case reste celle de la
-- campagne (`map_settings.pixels_per_unit`). Contrat : `MapGrid` (@vtt/contracts).

--changeset campaign:0021-map-grids
--comment: Quadrillages des scènes (liste jsonb, grille de jeu comprise).
ALTER TABLE maps ADD COLUMN grids jsonb NOT NULL DEFAULT '[]'::jsonb;
--rollback ALTER TABLE maps DROP COLUMN grids;
