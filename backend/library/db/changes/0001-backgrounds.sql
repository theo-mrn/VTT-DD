--liquibase formatted sql

-- Fonds de scène partagés (docs/bibliotheque.md). Une ligne par lieu, ses images dans
-- background_variants. Titres, descriptions et mots-clés sont écrits à l'import (description par
-- un modèle Claude). Le service calcule les formes de recherche (minuscules, sans accents ni
-- ligatures, sans extension unaccent) : la tête (titre, mots-clés) pèse plus que le corps
-- (description). Les vecteurs combinent la configuration de la langue (racines) et « simple »
-- (recherche au fil de la frappe), comme les notes de campaign.

--changeset library:0001-backgrounds
--comment: Fonds de scène (un lieu par ligne) et leurs variantes ; recherche plein texte en français et en anglais.
CREATE TABLE backgrounds (
  id             uuid        PRIMARY KEY,
  source         text        NOT NULL,              -- 'dndbackdrop', 'asset-mappings'
  source_key     text        NOT NULL,              -- uuid du prompt Midjourney, ou dossier et nom de la carte
  collection     text,
  title_fr       text        NOT NULL,
  title_en       text        NOT NULL,
  description_fr text        NOT NULL DEFAULT '',
  description_en text        NOT NULL DEFAULT '',
  keywords_fr    text[]      NOT NULL DEFAULT '{}',
  keywords_en    text[]      NOT NULL DEFAULT '{}',
  place          text,
  setting        text,
  time_of_day    text,
  moods          text[]      NOT NULL DEFAULT '{}',
  animated       boolean     NOT NULL DEFAULT false,
  search_head_fr text        NOT NULL DEFAULT '',
  search_body_fr text        NOT NULL DEFAULT '',
  search_head_en text        NOT NULL DEFAULT '',
  search_body_en text        NOT NULL DEFAULT '',
  search_fr      tsvector    GENERATED ALWAYS AS (
    setweight(to_tsvector('french', search_head_fr) || to_tsvector('simple', search_head_fr), 'A')
    || setweight(to_tsvector('french', search_body_fr) || to_tsvector('simple', search_body_fr), 'C')
  ) STORED,
  search_en      tsvector    GENERATED ALWAYS AS (
    setweight(to_tsvector('english', search_head_en) || to_tsvector('simple', search_head_en), 'A')
    || setweight(to_tsvector('english', search_body_en) || to_tsvector('simple', search_body_en), 'C')
  ) STORED,
  described_by   text,                              -- modèle et version du gabarit de description
  described_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backgrounds_source_key UNIQUE (source, source_key),
  CONSTRAINT backgrounds_source CHECK (source ~ '^[a-z0-9-]{1,32}$'),
  CONSTRAINT backgrounds_texts CHECK (
    char_length(source_key) BETWEEN 1 AND 300
    AND char_length(title_fr) BETWEEN 1 AND 200 AND char_length(title_en) BETWEEN 1 AND 200
    AND char_length(description_fr) <= 2000 AND char_length(description_en) <= 2000
    AND cardinality(keywords_fr) <= 60 AND cardinality(keywords_en) <= 60
  ),
  CONSTRAINT backgrounds_place CHECK (place IN (
    'forest', 'mountain', 'cave', 'castle', 'dungeon', 'ruins', 'village', 'city', 'tavern',
    'temple', 'graveyard', 'swamp', 'lake', 'sea', 'desert', 'plains', 'camp', 'farm', 'other')),
  CONSTRAINT backgrounds_setting CHECK (setting IN ('indoor', 'outdoor', 'underground')),
  CONSTRAINT backgrounds_time CHECK (time_of_day IN ('day', 'dusk', 'night', 'unknown')),
  CONSTRAINT backgrounds_moods CHECK (moods <@ ARRAY[
    'peaceful', 'mysterious', 'eerie', 'magical', 'epic', 'grim', 'cozy', 'desolate']::text[])
);
CREATE INDEX backgrounds_search_fr ON backgrounds USING gin (search_fr);
CREATE INDEX backgrounds_search_en ON backgrounds USING gin (search_en);
CREATE INDEX backgrounds_moods ON backgrounds USING gin (moods);
CREATE INDEX backgrounds_facets ON backgrounds (place, setting, time_of_day);
-- Ordre stable sans recherche : collection, puis titre
CREATE INDEX backgrounds_order ON backgrounds (collection, title_fr, id);

CREATE TABLE background_variants (
  id            uuid    PRIMARY KEY,
  background_id uuid    NOT NULL REFERENCES backgrounds (id) ON DELETE CASCADE,
  position      int     NOT NULL,                   -- 0 : variante montrée par défaut
  url           text    NOT NULL,
  thumb_url     text,
  preview_url   text,                               -- aperçu animé (fond vidéo)
  original_key  text,                               -- original sur R2 (jamais servi au front)
  kind          text    NOT NULL,
  grid          boolean NOT NULL DEFAULT false,     -- grille dessinée dans l'image
  width         int,
  height        int,
  bytes         bigint,
  CONSTRAINT background_variants_position UNIQUE (background_id, position),
  CONSTRAINT background_variants_url UNIQUE (url),
  CONSTRAINT background_variants_kind CHECK (kind IN ('image', 'video')),
  CONSTRAINT background_variants_values CHECK (
    position BETWEEN 0 AND 63
    AND char_length(url) BETWEEN 1 AND 1000
    AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
    AND (bytes IS NULL OR bytes >= 0)
  )
);
--rollback DROP TABLE background_variants;
--rollback DROP TABLE backgrounds;
