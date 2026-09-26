-- Couches spatiales de la carte (schéma campaign), en PostGIS.
-- Coordonnées en pixels de la carte : SRID 0 (plan cartésien, pas de géographie).
-- Remplace les sous-collections Firestore cartes/{id}/objects, fog, lights,
-- obstacles, portals, cities, musicZones et le calcul client dans visibility.ts.

CREATE TABLE maps (
  id        uuid PRIMARY KEY,
  room_id   uuid NOT NULL,
  name      text NOT NULL,
  width     int  NOT NULL,
  height    int  NOT NULL,
  grid_size int  NOT NULL DEFAULT 50,
  bounds    geometry(Polygon, 0) GENERATED ALWAYS AS
            (ST_MakeEnvelope(0, 0, width, height, 0)) STORED
);

-- Tokens (persos, PNJ) : un point
CREATE TABLE tokens (
  id           uuid PRIMARY KEY,
  map_id       uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  character_id uuid,
  pos          geometry(Point, 0) NOT NULL,
  vision_radius real NOT NULL DEFAULT 0,
  hidden       boolean NOT NULL DEFAULT false,
  version      bigint  NOT NULL DEFAULT 0   -- verrou optimiste pour les drags concurrents
);
CREATE INDEX tokens_map_pos ON tokens USING gist (map_id, pos);

-- Murs, portes, fenêtres : des lignes qui bloquent la vue
CREATE TABLE obstacles (
  id        uuid PRIMARY KEY,
  map_id    uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('wall','door','window','terrain')),
  is_open   boolean NOT NULL DEFAULT false,
  geom      geometry(LineString, 0) NOT NULL
);
CREATE INDEX obstacles_map_geom ON obstacles USING gist (map_id, geom);

-- Lumières, zones musicales, zones de brouillard, villes : polygones ou cercles
CREATE TABLE zones (
  id       uuid PRIMARY KEY,
  map_id   uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  kind     text NOT NULL CHECK (kind IN ('light','music','fog_reveal','city','portal','spawn')),
  geom     geometry(Geometry, 0) NOT NULL,
  props    jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX zones_map_geom ON zones USING gist (map_id, geom);

-- Exemples de requêtes que PostGIS rend immédiates :
-- 1. Ce qu'un token voit dans son rayon (filtre spatial indexé)
--    SELECT t.* FROM tokens t JOIN tokens me ON me.id = $1
--    WHERE t.map_id = me.map_id AND ST_DWithin(t.pos, me.pos, me.vision_radius);
-- 2. Ligne de vue bloquée par un mur fermé ?
--    SELECT EXISTS (SELECT 1 FROM obstacles o
--      WHERE o.map_id = $map AND NOT o.is_open
--        AND ST_Intersects(o.geom, ST_MakeLine($from::geometry, $to::geometry)));
-- 3. Zone musicale sous le token après un déplacement
--    SELECT z.* FROM zones z WHERE z.map_id = $map AND z.kind = 'music' AND ST_Contains(z.geom, $pos);
-- 4. Ne charger que la partie visible de la carte (viewport)
--    ... WHERE map_id = $map AND geom && ST_MakeEnvelope($x1,$y1,$x2,$y2,0);
