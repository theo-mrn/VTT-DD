--liquibase formatted sql

--changeset character:0003-npc-template-categories
--comment: Catégories de la bibliothèque de PNJ du MJ (ancien npc_templates/{salle}/categories), par campagne.
CREATE TABLE npc_template_categories (
  id           uuid        PRIMARY KEY,           -- UUIDv7 (API) ou UUIDv5 du chemin legacy (import)
  campaign_id  uuid        NOT NULL,              -- campagne (service campaign)
  name         text        NOT NULL,
  color        text,                              -- couleur d'affichage choisie par le MJ (#rrggbb)
  created_by   uuid,                              -- auteur (identity) ; null pour un import
  version      int         NOT NULL DEFAULT 1,    -- concurrence optimiste
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT npc_template_categories_name_longueur CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT npc_template_categories_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{3,8}$'),
  CONSTRAINT npc_template_categories_version_positive CHECK (version >= 1),
  -- Cible de la clé étrangère composite des modèles : une catégorie d'une autre campagne est refusée
  CONSTRAINT npc_template_categories_campaign_id UNIQUE (campaign_id, id)
);
CREATE INDEX npc_template_categories_campaign ON npc_template_categories (campaign_id, created_at, id);
--rollback DROP TABLE npc_template_categories;

--changeset character:0003-npc-templates
--comment: Modèles de PNJ du MJ (ancien npc_templates/{salle}/templates). Les statistiques sont un EtatEntite du système de la campagne, comme un personnage ; instancier un modèle crée un vrai personnage.
CREATE TABLE npc_templates (
  id             uuid        PRIMARY KEY,         -- UUIDv7 (API) ou UUIDv5 du chemin legacy (import)
  campaign_id    uuid        NOT NULL,
  category_id    uuid,
  name           text        NOT NULL,            -- legacy Nomperso
  image_url      text,                            -- legacy imageURL : image de base (portrait)
  token_url      text,                            -- legacy imageURL2 : jeton affiché sur la carte
  system_id      text        NOT NULL,            -- = etat.systeme.id
  system_version text        NOT NULL,            -- = etat.systeme.version
  type           text        NOT NULL,            -- = etat.type
  etat           jsonb       NOT NULL,            -- EtatEntite de @vtt/rules
  actions        jsonb       NOT NULL DEFAULT '[]', -- legacy Actions : [{ name, description, toHit }]
  created_by     uuid,
  version        int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT npc_templates_name_longueur CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT npc_templates_image_longueur CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  CONSTRAINT npc_templates_token_longueur CHECK (token_url IS NULL OR char_length(token_url) <= 2048),
  CONSTRAINT npc_templates_version_positive CHECK (version >= 1),
  CONSTRAINT npc_templates_actions_tableau CHECK (jsonb_typeof(actions) = 'array'),
  CONSTRAINT npc_templates_etat_objet CHECK (jsonb_typeof(etat) = 'object'),
  CONSTRAINT npc_templates_etat_coherent CHECK (
    etat->>'type' = type
    AND etat->'systeme'->>'id' = system_id
    AND etat->'systeme'->>'version' = system_version
  ),
  -- Catégorie de la même campagne ; sa suppression range le modèle « sans catégorie »
  CONSTRAINT npc_templates_category FOREIGN KEY (campaign_id, category_id)
    REFERENCES npc_template_categories (campaign_id, id) ON DELETE SET NULL (category_id)
);
CREATE INDEX npc_templates_campaign ON npc_templates (campaign_id, created_at, id);
CREATE INDEX npc_templates_category ON npc_templates (category_id) WHERE category_id IS NOT NULL;
--rollback DROP TABLE npc_templates;

--changeset character:0003-object-templates
--comment: Modèles d'objets du MJ (ancien object_templates/{salle}/templates) : décors à poser sur la carte (nom, image, catégorie), sans règles de jeu.
CREATE TABLE object_templates (
  id           uuid        PRIMARY KEY,
  campaign_id  uuid        NOT NULL,
  name         text        NOT NULL,
  image_url    text,                              -- legacy imageUrl
  category     text,                              -- legacy category (« custom » pour un objet créé par le MJ)
  created_by   uuid,
  version      int         NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_templates_name_longueur CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT object_templates_image_longueur CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  CONSTRAINT object_templates_category_longueur CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 50),
  CONSTRAINT object_templates_version_positive CHECK (version >= 1)
);
CREATE INDEX object_templates_campaign ON object_templates (campaign_id, created_at, id);
--rollback DROP TABLE object_templates;
