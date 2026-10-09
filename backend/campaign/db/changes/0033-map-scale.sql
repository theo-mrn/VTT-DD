--liquibase formatted sql

-- Case, distance et quadrillage (docs/carte.md § 4, refonte du 2026-10-09) : distance par case et
-- décompte des diagonales de la campagne, distance propre à une scène, un seul quadrillage par
-- scène. Les portées restent stockées en cases : aucune donnée ne change d'unité.

--changeset campaign:0033-map-settings-scale
--comment: « 1 case = 1,5 m » par défaut ; diagonales comptées pour une case, comme l'ancien réglage par défaut des joueurs.
ALTER TABLE map_settings ADD COLUMN units_per_cell real NOT NULL DEFAULT 1.5;
ALTER TABLE map_settings ADD CONSTRAINT map_settings_units_per_cell CHECK (units_per_cell > 0);
ALTER TABLE map_settings ADD COLUMN diagonals text NOT NULL DEFAULT 'chebyshev';
ALTER TABLE map_settings ADD CONSTRAINT map_settings_diagonals
  CHECK (diagonals IN ('chebyshev', 'alternating', 'manhattan', 'off'));
--rollback ALTER TABLE map_settings DROP COLUMN diagonals; ALTER TABLE map_settings DROP COLUMN units_per_cell;

--changeset campaign:0033-map-scale
--comment: Distance par case propre à une scène ({ unitsPerCell, unitName }) ; null : celle de la campagne.
ALTER TABLE maps ADD COLUMN scale jsonb;
--rollback ALTER TABLE maps DROP COLUMN scale;

--changeset campaign:0033-map-single-grid
--comment: Un seul quadrillage par scène : la grille de jeu reste, les quadrillages décoratifs partent. Sans grille de jeu, la case de la scène ne dépendait d'aucun quadrillage : l'échelle ne change pas.
UPDATE maps
SET grids = COALESCE(
  (SELECT jsonb_agg(g) FROM jsonb_array_elements(grids) AS g WHERE (g->>'primary')::boolean),
  '[]'::jsonb
)
WHERE jsonb_array_length(grids) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(grids) AS g WHERE NOT COALESCE((g->>'primary')::boolean, false)
  );
--rollback SELECT 1;
