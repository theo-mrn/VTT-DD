--liquibase formatted sql

-- Refonte de la carte (docs/carte.md § 12) : brouillard en zones, pièces, murs à sens unique
-- relatifs au tracé, transparence des murs, lumières colorées et attachées à un token,
-- objets à fouiller. Les droits DML de campaign_svc viennent des privilèges par défaut
-- (tables et séquences créées par campaign_owner).
--
-- Migration en deux temps (expand/contract) : les anciennes données restent en place
-- (map_fog, map_obstacles.direction), converties ici et ignorées par le service ; une
-- migration ultérieure les supprimera une fois la bascule validée.

--changeset campaign:0017-maps-fog-full
--comment: Toute la carte sous le brouillard au départ (legacy fullMapFog, ex-map_fog.full_map).
ALTER TABLE maps ADD COLUMN fog_full boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE maps DROP COLUMN fog_full;

--changeset campaign:0017-map-fog-zones
--comment: Zones de brouillard (cercle, rectangle, main levée), en mode fog (ajoute) ou clear (retire), appliquées par seq croissant.
CREATE TABLE map_fog_zones (
  id          uuid                 PRIMARY KEY,
  campaign_id uuid                 NOT NULL,
  map_id      uuid                 NOT NULL,
  seq         bigint               GENERATED ALWAYS AS IDENTITY, -- ordre d'application
  shape       text                 NOT NULL,
  mode        text                 NOT NULL DEFAULT 'fog',
  geom        geometry(Polygon, 0) NOT NULL,                    -- cercle : polygone approché (index, bbox)
  center      geometry(Point, 0),                               -- cercle seulement
  radius      double precision,                                 -- cercle seulement, pixels
  created_by  uuid                 NOT NULL,
  version     int                  NOT NULL DEFAULT 1,
  created_at  timestamptz          NOT NULL DEFAULT now(),
  updated_at  timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT map_fog_zones_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_fog_zones_shape CHECK (shape IN ('circle', 'rect', 'polygon')),
  CONSTRAINT map_fog_zones_mode CHECK (mode IN ('fog', 'clear')),
  CONSTRAINT map_fog_zones_circle CHECK (
    (shape = 'circle') = (center IS NOT NULL AND radius IS NOT NULL)
  ),
  CONSTRAINT map_fog_zones_radius CHECK (radius IS NULL OR radius > 0),
  CONSTRAINT map_fog_zones_version_positive CHECK (version >= 1)
);
CREATE INDEX map_fog_zones_map_geom ON map_fog_zones USING gist (map_id, geom);
CREATE INDEX map_fog_zones_map_seq ON map_fog_zones (map_id, seq);
--rollback DROP TABLE map_fog_zones;

--changeset campaign:0017-map-fog-convert
--comment: Cases map_fog.cells converties en zones (union des cases, sans perte) ; full_map devient maps.fog_full.
-- Taille de case de l'ancienne carte : round(min(largeur, hauteur) / 20), 100 px si inconnue.
-- Sans fullMap, les cases listées sont dans le brouillard ; avec fullMap, ce sont les cases
-- découvertes (rendu de l'ancienne carte, shadows.tsx). Chaque polygone de l'union devient une
-- zone, chacun de ses trous une zone du mode inverse posée juste après. Ordre : par aire du
-- contour décroissante (un îlot dans un trou vient après ce trou), puis contour avant trous.
UPDATE maps m SET fog_full = true FROM map_fog f WHERE f.map_id = m.id AND f.full_map;
WITH cells AS (
  SELECT f.map_id, f.campaign_id, f.full_map, c.owner_id,
         greatest(coalesce(round(least(m.width, m.height) / 20.0), 100), 1)::float8 AS size,
         split_part(trim(cell), ',', 1)::bigint AS cx,
         split_part(trim(cell), ',', 2)::bigint AS cy
    FROM map_fog f
    JOIN maps m ON m.id = f.map_id
    JOIN campaigns c ON c.id = f.campaign_id
    CROSS JOIN LATERAL unnest(f.cells) AS cell
   WHERE trim(cell) ~ '^-?[0-9]{1,7},-?[0-9]{1,7}$'
),
merged AS (
  SELECT map_id, campaign_id, full_map, owner_id,
         -- sans les sommets alignés (tolérance nulle : aucune perte)
         ST_SimplifyPreserveTopology(
           ST_Union(ST_MakeEnvelope(cx * size, cy * size, (cx + 1) * size, (cy + 1) * size, 0)),
           0) AS g
    FROM cells
   GROUP BY map_id, campaign_id, full_map, owner_id
),
parts AS (
  SELECT map_id, campaign_id, full_map, owner_id, (ST_Dump(g)).geom AS poly FROM merged
),
rings AS (
  SELECT map_id, campaign_id, owner_id,
         ST_Area(ST_MakePolygon(ST_ExteriorRing(poly))) AS outer_area,
         0 AS ring,
         ST_MakePolygon(ST_ExteriorRing(poly)) AS geom,
         CASE WHEN full_map THEN 'clear' ELSE 'fog' END AS mode
    FROM parts
  UNION ALL
  SELECT map_id, campaign_id, owner_id,
         ST_Area(ST_MakePolygon(ST_ExteriorRing(poly))),
         n,
         ST_MakePolygon(ST_InteriorRingN(poly, n)),
         CASE WHEN full_map THEN 'fog' ELSE 'clear' END
    FROM parts
    CROSS JOIN LATERAL generate_series(1, ST_NumInteriorRings(poly)) AS n
)
INSERT INTO map_fog_zones (id, campaign_id, map_id, shape, mode, geom, created_by)
SELECT gen_random_uuid(), campaign_id, map_id, 'polygon', mode, geom, owner_id
  FROM rings
 ORDER BY map_id, outer_area DESC, ring;
-- Annulation : les zones sont dérivées de map_fog, toujours en place.
--rollback DELETE FROM map_fog_zones;
--rollback UPDATE maps SET fog_full = false;

--changeset campaign:0017-map-rooms
--comment: Pièces : polygones fermés (sans effet de mur), fermées si aucune porte ouverte n'est sur leur contour.
CREATE TABLE map_rooms (
  id          uuid                 PRIMARY KEY,
  campaign_id uuid                 NOT NULL,
  map_id      uuid                 NOT NULL,
  name        text                 NOT NULL DEFAULT '',
  geom        geometry(Polygon, 0) NOT NULL,
  version     int                  NOT NULL DEFAULT 1,
  created_at  timestamptz          NOT NULL DEFAULT now(),
  updated_at  timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT map_rooms_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_rooms_name_length CHECK (char_length(name) <= 200),
  CONSTRAINT map_rooms_points CHECK (ST_NPoints(geom) BETWEEN 4 AND 1001),
  CONSTRAINT map_rooms_version_positive CHECK (version >= 1)
);
CREATE INDEX map_rooms_map_geom ON map_rooms USING gist (map_id, geom);
--rollback DROP TABLE map_rooms;

--changeset campaign:0017-map-obstacles-blocks-from
--comment: Mur à sens unique relatif au tracé (blocks_from left|right, converti depuis direction) ; opacity 1 par défaut.
-- Ancienne règle (legacy lib/visibility.ts) : la normale du premier segment, orientée vers
-- `direction` (nord par défaut), désigne le côté d'où la vue est bloquée. Côté gauche du
-- tracé a→b : cross(b − a, p − a) < 0 (y vers le bas), soit l'opposé de la normale (−dy, dx).
ALTER TABLE map_obstacles ADD COLUMN blocks_from text;
ALTER TABLE map_obstacles
  ADD CONSTRAINT map_obstacles_blocks_from CHECK (blocks_from IN ('left', 'right'));
UPDATE map_obstacles o
   SET blocks_from = CASE
         WHEN (CASE coalesce(o.direction, 'north')
                 WHEN 'north' THEN -(ST_X(ST_PointN(o.geom, 2)) - ST_X(ST_PointN(o.geom, 1)))
                 WHEN 'south' THEN ST_X(ST_PointN(o.geom, 2)) - ST_X(ST_PointN(o.geom, 1))
                 WHEN 'east' THEN -(ST_Y(ST_PointN(o.geom, 2)) - ST_Y(ST_PointN(o.geom, 1)))
                 ELSE ST_Y(ST_PointN(o.geom, 2)) - ST_Y(ST_PointN(o.geom, 1))
               END) >= 0 THEN 'right'
         ELSE 'left'
       END
 WHERE o.kind = 'one_way_wall';
UPDATE map_obstacles SET opacity = 1 WHERE opacity IS NULL;
ALTER TABLE map_obstacles ALTER COLUMN opacity SET DEFAULT 1;
ALTER TABLE map_obstacles ALTER COLUMN opacity SET NOT NULL;
COMMENT ON COLUMN map_obstacles.direction IS 'Obsolète (0017) : remplacée par blocks_from, plus lue ni écrite par le service.';
--rollback ALTER TABLE map_obstacles ALTER COLUMN opacity DROP NOT NULL;
--rollback ALTER TABLE map_obstacles ALTER COLUMN opacity DROP DEFAULT;
--rollback ALTER TABLE map_obstacles DROP COLUMN blocks_from;
--rollback COMMENT ON COLUMN map_obstacles.direction IS NULL;

--changeset campaign:0017-map-lights
--comment: Lumières : couleur, intensité, dégradé, et token suivi (torche) sur la même carte.
ALTER TABLE map_tokens ADD CONSTRAINT map_tokens_id_map UNIQUE (id, map_id);
ALTER TABLE map_lights ADD COLUMN color text NOT NULL DEFAULT '#ffd08a';
ALTER TABLE map_lights ADD COLUMN intensity real NOT NULL DEFAULT 1;
ALTER TABLE map_lights ADD COLUMN falloff real NOT NULL DEFAULT 0.5;
ALTER TABLE map_lights ADD COLUMN attached_token_id uuid;
ALTER TABLE map_lights
  ADD CONSTRAINT map_lights_color_length CHECK (char_length(color) BETWEEN 1 AND 50);
ALTER TABLE map_lights ADD CONSTRAINT map_lights_intensity CHECK (intensity BETWEEN 0 AND 1);
ALTER TABLE map_lights ADD CONSTRAINT map_lights_falloff CHECK (falloff BETWEEN 0 AND 1);
ALTER TABLE map_lights
  ADD CONSTRAINT map_lights_attached_token FOREIGN KEY (attached_token_id, map_id)
  REFERENCES map_tokens (id, map_id) ON DELETE SET NULL (attached_token_id);
CREATE INDEX map_lights_attached_token ON map_lights (attached_token_id)
  WHERE attached_token_id IS NOT NULL;
--rollback DROP INDEX map_lights_attached_token;
--rollback ALTER TABLE map_lights DROP CONSTRAINT map_lights_attached_token;
--rollback ALTER TABLE map_lights DROP COLUMN attached_token_id;
--rollback ALTER TABLE map_lights DROP COLUMN falloff;
--rollback ALTER TABLE map_lights DROP COLUMN intensity;
--rollback ALTER TABLE map_lights DROP COLUMN color;
--rollback ALTER TABLE map_tokens DROP CONSTRAINT map_tokens_id_map;

--changeset campaign:0017-map-objects
--comment: Objets à fouiller (searchable, search_radius en unités), ordre d'affichage, contenu typé.
ALTER TABLE map_objects ADD COLUMN searchable boolean NOT NULL DEFAULT false;
ALTER TABLE map_objects ADD COLUMN search_radius real NOT NULL DEFAULT 1.5;
ALTER TABLE map_objects ADD COLUMN z_index int NOT NULL DEFAULT 0;
ALTER TABLE map_objects
  ADD CONSTRAINT map_objects_search_radius CHECK (search_radius BETWEEN 0 AND 10000);
-- Contenu typé { id, name, quantity, imageUrl?, description?, ref?, legacy? } : l'ancien
-- LootItem (image, poids, dégâts…) garde ses autres champs dans `legacy`.
UPDATE map_objects o
   SET items = (
     SELECT coalesce(jsonb_agg(
              CASE WHEN jsonb_typeof(it) = 'object' THEN
                jsonb_strip_nulls(jsonb_build_object(
                  'id', left(coalesce(nullif(trim(it ->> 'id'), ''), 'item-' || ord), 100),
                  'name', left(coalesce(nullif(trim(it ->> 'name'), ''), 'Objet'), 200),
                  'quantity', CASE
                    WHEN (it ->> 'quantity') ~ '^[0-9]{1,7}(\.[0-9]+)?$'
                      THEN greatest(1, round((it ->> 'quantity')::numeric))::int
                    ELSE 1
                  END,
                  'imageUrl', CASE
                    WHEN (it ->> 'image') ~ '^(https://\S+|/[^/]\S*)$'
                      AND char_length(it ->> 'image') <= 2048 THEN it ->> 'image'
                  END,
                  'description', left(nullif(it ->> 'description', ''), 10000),
                  'legacy', nullif(
                    (it - 'id' - 'name' - 'quantity' - 'description' - 'image')
                      || CASE
                           WHEN (it ->> 'image') ~ '^(https://\S+|/[^/]\S*)$'
                             AND char_length(it ->> 'image') <= 2048 THEN '{}'::jsonb
                           WHEN (it -> 'image') IS NOT NULL
                             THEN jsonb_build_object('image', it -> 'image')
                           ELSE '{}'::jsonb
                         END,
                    '{}'::jsonb)
                ))
              ELSE jsonb_build_object('id', 'item-' || ord, 'name', left(it #>> '{}', 200), 'quantity', 1)
              END ORDER BY ord), '[]'::jsonb)
       FROM jsonb_array_elements(o.items) WITH ORDINALITY AS e(it, ord)
   )
 WHERE o.items <> '[]'::jsonb;
--rollback ALTER TABLE map_objects DROP CONSTRAINT map_objects_search_radius;
--rollback ALTER TABLE map_objects DROP COLUMN z_index;
--rollback ALTER TABLE map_objects DROP COLUMN search_radius;
--rollback ALTER TABLE map_objects DROP COLUMN searchable;

--changeset campaign:0017-map-fog-obsolete
--comment: L'ancien brouillard par cases n'est plus lu ni écrit (remplacé par map_fog_zones et maps.fog_full).
COMMENT ON TABLE map_fog IS 'Obsolète (0017) : convertie en map_fog_zones et maps.fog_full, plus lue ni écrite par le service.';
--rollback COMMENT ON TABLE map_fog IS NULL;
