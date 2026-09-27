--liquibase formatted sql

-- Carte (phase 6) : scènes et couches en PostGIS, SRID 0, coordonnées en pixels de l'image
-- de fond. Index GiST (map_id, géométrie) grâce à btree_gist. Modèle : docs/map.md.
-- Chaque élément référence sa carte par (map_id, campaign_id) : jamais la carte d'une
-- autre campagne. Les droits DML de campaign_svc viennent des privilèges par défaut.

--changeset campaign:0008-map-groups
--comment: Dossiers de scènes (legacy cartes/{r}/groups).
CREATE TABLE map_groups (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  sort_order  bigint      NOT NULL DEFAULT 0,
  version     int         NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_groups_campaign_unique UNIQUE (id, campaign_id),
  CONSTRAINT map_groups_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT map_groups_version_positive CHECK (version >= 1)
);
CREATE INDEX map_groups_campaign ON map_groups (campaign_id);
--rollback DROP TABLE map_groups;

--changeset campaign:0008-maps
--comment: Scènes (legacy cartes/{r}/cities). is_default : le fond global (aucune scène), un par campagne.
CREATE TABLE maps (
  id                 uuid        PRIMARY KEY,
  campaign_id        uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  group_id           uuid,
  name               text        NOT NULL,
  description        text        NOT NULL DEFAULT '',
  background_url     text,
  is_default         boolean     NOT NULL DEFAULT false,
  visible_to_players boolean     NOT NULL DEFAULT true,
  spawn              geometry(Point, 0),
  width              int,                               -- taille de l'image de fond, en pixels
  height             int,
  weather            jsonb,                             -- { type, intensity }
  layers             jsonb       NOT NULL DEFAULT '{}', -- calque → affiché (réglage MJ)
  version            int         NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maps_campaign_unique UNIQUE (id, campaign_id),
  CONSTRAINT maps_group FOREIGN KEY (group_id, campaign_id)
    REFERENCES map_groups (id, campaign_id) ON DELETE SET NULL (group_id),
  CONSTRAINT maps_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT maps_description_length CHECK (char_length(description) <= 2000),
  CONSTRAINT maps_background_url_length CHECK (char_length(background_url) <= 2048),
  CONSTRAINT maps_size CHECK (
    (width IS NULL AND height IS NULL) OR (width BETWEEN 1 AND 100000 AND height BETWEEN 1 AND 100000)
  ),
  CONSTRAINT maps_weather CHECK (weather IS NULL OR jsonb_typeof(weather) = 'object'),
  CONSTRAINT maps_layers CHECK (jsonb_typeof(layers) = 'object'),
  CONSTRAINT maps_version_positive CHECK (version >= 1)
);
CREATE INDEX maps_campaign ON maps (campaign_id);
CREATE UNIQUE INDEX maps_default ON maps (campaign_id) WHERE is_default;
--rollback DROP TABLE maps;

--changeset campaign:0008-map-settings
--comment: Réglages de carte d'une campagne (legacy settings/general et RTDB rooms/{r}/music).
CREATE TABLE map_settings (
  campaign_id     uuid        PRIMARY KEY REFERENCES campaigns (id) ON DELETE CASCADE,
  party_map_id    uuid,                                -- scène où se trouve le groupe (currentCityId)
  token_scale     real        NOT NULL DEFAULT 1,
  pixels_per_unit real        NOT NULL DEFAULT 50,
  unit_name       text        NOT NULL DEFAULT 'm',
  shadow_opacity  real        NOT NULL DEFAULT 1,
  dungeon_mode    boolean     NOT NULL DEFAULT false,
  music           jsonb,                               -- musique d'ambiance en cours
  version         int         NOT NULL DEFAULT 1,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_settings_party_map FOREIGN KEY (party_map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE SET NULL (party_map_id),
  CONSTRAINT map_settings_token_scale CHECK (token_scale > 0 AND token_scale <= 100),
  CONSTRAINT map_settings_pixels_per_unit CHECK (pixels_per_unit > 0 AND pixels_per_unit <= 100000),
  CONSTRAINT map_settings_unit_name CHECK (char_length(unit_name) BETWEEN 1 AND 20),
  CONSTRAINT map_settings_shadow_opacity CHECK (shadow_opacity BETWEEN 0 AND 1),
  CONSTRAINT map_settings_music CHECK (music IS NULL OR jsonb_typeof(music) = 'object'),
  CONSTRAINT map_settings_version_positive CHECK (version >= 1)
);
--rollback DROP TABLE map_settings;

--changeset campaign:0008-map-fog
--comment: Brouillard d'une carte : full_map (tout couvert) et cases « cx,cy » (taille de case : docs/map.md).
CREATE TABLE map_fog (
  map_id      uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL,
  full_map    boolean     NOT NULL DEFAULT false,
  cells       text[]      NOT NULL DEFAULT '{}',
  version     int         NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_fog_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_fog_cells CHECK (cardinality(cells) <= 100000),
  CONSTRAINT map_fog_version_positive CHECK (version >= 1)
);
--rollback DROP TABLE map_fog;

--changeset campaign:0008-map-tokens
--comment: Personnages engagés posés sur une carte. present : la carte où se trouve le personnage (une seule) ; les autres lignes gardent sa dernière position sur chaque scène.
CREATE TABLE map_tokens (
  id            uuid               PRIMARY KEY,
  campaign_id   uuid               NOT NULL,
  map_id        uuid               NOT NULL,
  character_id  uuid               NOT NULL,
  pos           geometry(Point, 0) NOT NULL,
  present       boolean            NOT NULL DEFAULT true,
  scale         real               NOT NULL DEFAULT 1,
  shape         text               NOT NULL DEFAULT 'circle',
  image_url     text,                                   -- image du token, sinon l'avatar du personnage
  visibility    text               NOT NULL DEFAULT 'visible',
  visible_to    uuid[]             NOT NULL DEFAULT '{}', -- personnages qui le voient (visibility = custom)
  vision_radius real               NOT NULL DEFAULT 100,  -- pixels
  vision_boost  boolean            NOT NULL DEFAULT false,
  notes         text,
  audio         jsonb,                                  -- { url, radius, volume, loop, name }
  interactions  jsonb,                                  -- marchand, jeu, butin
  version       int                NOT NULL DEFAULT 1,
  created_at    timestamptz        NOT NULL DEFAULT now(),
  updated_at    timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT map_tokens_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_tokens_character FOREIGN KEY (campaign_id, character_id)
    REFERENCES campaign_characters (campaign_id, character_id) ON DELETE CASCADE,
  CONSTRAINT map_tokens_map_character UNIQUE (map_id, character_id),
  CONSTRAINT map_tokens_shape CHECK (shape IN ('circle', 'square')),
  CONSTRAINT map_tokens_visibility CHECK (visibility IN ('visible', 'hidden', 'ally', 'custom', 'invisible')),
  CONSTRAINT map_tokens_scale CHECK (scale > 0 AND scale <= 100),
  CONSTRAINT map_tokens_vision_radius CHECK (vision_radius >= 0 AND vision_radius <= 100000),
  CONSTRAINT map_tokens_image_url_length CHECK (char_length(image_url) <= 2048),
  CONSTRAINT map_tokens_notes_length CHECK (char_length(notes) <= 10000),
  CONSTRAINT map_tokens_audio CHECK (audio IS NULL OR jsonb_typeof(audio) = 'object'),
  CONSTRAINT map_tokens_interactions CHECK (interactions IS NULL OR jsonb_typeof(interactions) = 'array'),
  CONSTRAINT map_tokens_version_positive CHECK (version >= 1)
);
CREATE INDEX map_tokens_map_pos ON map_tokens USING gist (map_id, pos);
CREATE UNIQUE INDEX map_tokens_present ON map_tokens (campaign_id, character_id) WHERE present;
--rollback DROP TABLE map_tokens;

--changeset campaign:0008-map-objects
--comment: Objets et décors (legacy cartes/{r}/objects) ; pos = coin haut gauche.
CREATE TABLE map_objects (
  id              uuid               PRIMARY KEY,
  campaign_id     uuid               NOT NULL,
  map_id          uuid               NOT NULL,
  name            text               NOT NULL DEFAULT '',
  kind            text               NOT NULL DEFAULT 'decor',
  image_url       text               NOT NULL DEFAULT '',
  pos             geometry(Point, 0) NOT NULL,
  width           real               NOT NULL DEFAULT 100,
  height          real               NOT NULL DEFAULT 100,
  rotation        real               NOT NULL DEFAULT 0,
  is_background   boolean            NOT NULL DEFAULT false,
  is_locked       boolean            NOT NULL DEFAULT false,
  visibility      text               NOT NULL DEFAULT 'visible',
  visible_to      uuid[]             NOT NULL DEFAULT '{}',
  notes           text,
  items           jsonb              NOT NULL DEFAULT '[]', -- contenu d'un coffre
  linked_id       text,                                    -- inventaire partagé (legacy)
  group_entity_id text,                                    -- entité de groupe (legacy, non migrée)
  version         int                NOT NULL DEFAULT 1,
  created_at      timestamptz        NOT NULL DEFAULT now(),
  updated_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT map_objects_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_objects_kind CHECK (kind IN ('decor', 'weapon', 'item')),
  CONSTRAINT map_objects_visibility CHECK (visibility IN ('visible', 'hidden', 'custom')),
  CONSTRAINT map_objects_name_length CHECK (char_length(name) <= 200),
  CONSTRAINT map_objects_image_url_length CHECK (char_length(image_url) <= 2048),
  CONSTRAINT map_objects_size CHECK (width > 0 AND height > 0),
  CONSTRAINT map_objects_items CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT map_objects_version_positive CHECK (version >= 1)
);
CREATE INDEX map_objects_map_pos ON map_objects USING gist (map_id, pos);
--rollback DROP TABLE map_objects;

--changeset campaign:0008-map-lights
--comment: Lumières ; radius en unités de la carte (× map_settings.pixels_per_unit).
CREATE TABLE map_lights (
  id          uuid               PRIMARY KEY,
  campaign_id uuid               NOT NULL,
  map_id      uuid               NOT NULL,
  name        text               NOT NULL DEFAULT '',
  pos         geometry(Point, 0) NOT NULL,
  radius      real               NOT NULL DEFAULT 10,
  visible     boolean            NOT NULL DEFAULT true,
  version     int                NOT NULL DEFAULT 1,
  created_at  timestamptz        NOT NULL DEFAULT now(),
  updated_at  timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT map_lights_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_lights_radius CHECK (radius >= 0),
  CONSTRAINT map_lights_name_length CHECK (char_length(name) <= 200),
  CONSTRAINT map_lights_version_positive CHECK (version >= 1)
);
CREATE INDEX map_lights_map_pos ON map_lights USING gist (map_id, pos);
--rollback DROP TABLE map_lights;

--changeset campaign:0008-map-obstacles
--comment: Murs, murs à sens unique, portes et fenêtres : des segments qui bloquent la vue.
CREATE TABLE map_obstacles (
  id          uuid                    PRIMARY KEY,
  campaign_id uuid                    NOT NULL,
  map_id      uuid                    NOT NULL,
  kind        text                    NOT NULL DEFAULT 'wall',
  geom        geometry(LineString, 0) NOT NULL,
  direction   text,                             -- côté bloquant d'un mur à sens unique
  is_open     boolean                 NOT NULL DEFAULT false,
  is_locked   boolean                 NOT NULL DEFAULT false,
  color       text,
  opacity     real,
  room_mode   text,
  version     int                     NOT NULL DEFAULT 1,
  created_at  timestamptz             NOT NULL DEFAULT now(),
  updated_at  timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT map_obstacles_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_obstacles_kind CHECK (kind IN ('wall', 'one_way_wall', 'door', 'window')),
  CONSTRAINT map_obstacles_direction CHECK (direction IN ('north', 'south', 'east', 'west')),
  CONSTRAINT map_obstacles_room_mode CHECK (room_mode IN ('room', 'individual')),
  CONSTRAINT map_obstacles_opacity CHECK (opacity BETWEEN 0 AND 1),
  CONSTRAINT map_obstacles_version_positive CHECK (version >= 1)
);
CREATE INDEX map_obstacles_map_geom ON map_obstacles USING gist (map_id, geom);
--rollback DROP TABLE map_obstacles;

--changeset campaign:0008-map-drawings
--comment: Dessins (main levée, lignes, formes) ; created_by : l'auteur peut les effacer.
CREATE TABLE map_drawings (
  id          uuid                    PRIMARY KEY,
  campaign_id uuid                    NOT NULL,
  map_id      uuid                    NOT NULL,
  created_by  uuid                    NOT NULL,
  tool        text                    NOT NULL DEFAULT 'pen',
  geom        geometry(LineString, 0) NOT NULL,
  color       text                    NOT NULL DEFAULT '#000000',
  width       real                    NOT NULL DEFAULT 5,
  fill        text,
  closed      boolean                 NOT NULL DEFAULT false,
  smooth      boolean                 NOT NULL DEFAULT false,
  version     int                     NOT NULL DEFAULT 1,
  created_at  timestamptz             NOT NULL DEFAULT now(),
  updated_at  timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT map_drawings_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_drawings_tool CHECK (tool IN ('pen', 'brush', 'eraser', 'line', 'rectangle', 'circle')),
  CONSTRAINT map_drawings_width CHECK (width > 0 AND width <= 1000),
  CONSTRAINT map_drawings_points CHECK (ST_NPoints(geom) <= 20000),
  CONSTRAINT map_drawings_version_positive CHECK (version >= 1)
);
CREATE INDEX map_drawings_map_geom ON map_drawings USING gist (map_id, geom);
--rollback DROP TABLE map_drawings;

--changeset campaign:0008-map-notes
--comment: Textes posés sur la carte (legacy RTDB rooms/{r}/notes, ex-cartes/{r}/text).
CREATE TABLE map_notes (
  id          uuid               PRIMARY KEY,
  campaign_id uuid               NOT NULL,
  map_id      uuid               NOT NULL,
  created_by  uuid               NOT NULL,
  text        text               NOT NULL,
  pos         geometry(Point, 0) NOT NULL,
  color       text               NOT NULL DEFAULT 'yellow',
  font_size   real               NOT NULL DEFAULT 16,
  font_family text,
  version     int                NOT NULL DEFAULT 1,
  created_at  timestamptz        NOT NULL DEFAULT now(),
  updated_at  timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT map_notes_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_notes_text_length CHECK (char_length(text) <= 5000),
  CONSTRAINT map_notes_font_size CHECK (font_size > 0 AND font_size <= 1000),
  CONSTRAINT map_notes_version_positive CHECK (version >= 1)
);
CREATE INDEX map_notes_map_pos ON map_notes USING gist (map_id, pos);
--rollback DROP TABLE map_notes;

--changeset campaign:0008-map-music-zones
--comment: Zones sonores (cercle pos + radius en pixels) ; url : fichier audio ou id YouTube.
CREATE TABLE map_music_zones (
  id          uuid               PRIMARY KEY,
  campaign_id uuid               NOT NULL,
  map_id      uuid               NOT NULL,
  name        text               NOT NULL DEFAULT '',
  pos         geometry(Point, 0) NOT NULL,
  radius      real               NOT NULL DEFAULT 100,
  url         text,
  volume      real               NOT NULL DEFAULT 0.5,
  color       text,
  version     int                NOT NULL DEFAULT 1,
  created_at  timestamptz        NOT NULL DEFAULT now(),
  updated_at  timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT map_music_zones_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_music_zones_radius CHECK (radius >= 0),
  CONSTRAINT map_music_zones_volume CHECK (volume BETWEEN 0 AND 1),
  CONSTRAINT map_music_zones_url_length CHECK (char_length(url) <= 2048),
  CONSTRAINT map_music_zones_version_positive CHECK (version >= 1)
);
CREATE INDEX map_music_zones_map_pos ON map_music_zones USING gist (map_id, pos);
--rollback DROP TABLE map_music_zones;

--changeset campaign:0008-map-portals
--comment: Portails : changement de scène (target_map_id) ou téléportation sur la même carte (target).
CREATE TABLE map_portals (
  id            uuid               PRIMARY KEY,
  campaign_id   uuid               NOT NULL,
  map_id        uuid               NOT NULL,
  name          text               NOT NULL DEFAULT '',
  pos           geometry(Point, 0) NOT NULL,
  radius        real               NOT NULL DEFAULT 50,
  kind          text               NOT NULL DEFAULT 'scene_change',
  target_map_id uuid,
  target        geometry(Point, 0),
  icon          text,
  color         text,
  visible       boolean            NOT NULL DEFAULT true,
  version       int                NOT NULL DEFAULT 1,
  created_at    timestamptz        NOT NULL DEFAULT now(),
  updated_at    timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT map_portals_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_portals_target_map FOREIGN KEY (target_map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE SET NULL (target_map_id),
  CONSTRAINT map_portals_kind CHECK (kind IN ('scene_change', 'same_map')),
  CONSTRAINT map_portals_icon CHECK (icon IN ('stairs', 'door', 'portal', 'ladder')),
  CONSTRAINT map_portals_radius CHECK (radius >= 0),
  CONSTRAINT map_portals_version_positive CHECK (version >= 1)
);
CREATE INDEX map_portals_map_pos ON map_portals USING gist (map_id, pos);
--rollback DROP TABLE map_portals;

--changeset campaign:0008-map-measurements
--comment: Gabarits permanents (les mesures éphémères passent par realtime) ; geom : origine → extrémité.
CREATE TABLE map_measurements (
  id          uuid                    PRIMARY KEY,
  campaign_id uuid                    NOT NULL,
  map_id      uuid                    NOT NULL,
  created_by  uuid                    NOT NULL,
  shape       text                    NOT NULL,
  geom        geometry(LineString, 0) NOT NULL,
  color       text                    NOT NULL DEFAULT '#ffffff',
  skin        text,
  options     jsonb                   NOT NULL DEFAULT '{}', -- cône : largeur, angle, forme…
  version     int                     NOT NULL DEFAULT 1,
  created_at  timestamptz             NOT NULL DEFAULT now(),
  updated_at  timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT map_measurements_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_measurements_shape CHECK (shape IN ('line', 'cone', 'circle', 'cube')),
  CONSTRAINT map_measurements_points CHECK (ST_NPoints(geom) = 2),
  CONSTRAINT map_measurements_options CHECK (jsonb_typeof(options) = 'object'),
  CONSTRAINT map_measurements_version_positive CHECK (version >= 1)
);
CREATE INDEX map_measurements_map_geom ON map_measurements USING gist (map_id, geom);
--rollback DROP TABLE map_measurements;
