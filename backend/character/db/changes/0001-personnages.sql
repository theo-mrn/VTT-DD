--liquibase formatted sql

--changeset character:0001-characters
--comment: Personnages. L'état (etat) ne contient que ce qui est saisi, acheté ou tiré (EtatEntite de @vtt/rules) ; tout le reste est recalculé par le service.
CREATE TABLE characters (
  id             uuid        PRIMARY KEY,               -- UUIDv7 généré par le service
  owner_id       uuid        NOT NULL,                  -- utilisateur propriétaire (identity)
  nom            text        NOT NULL,
  avatar_url     text,
  system_id      text        NOT NULL,                  -- = etat.systeme.id
  system_version text        NOT NULL,                  -- = etat.systeme.version
  type           text        NOT NULL,                  -- = etat.type (personnage, véhicule…)
  etat           jsonb       NOT NULL,
  version        int         NOT NULL DEFAULT 1,        -- concurrence optimiste
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT characters_nom_longueur CHECK (char_length(nom) BETWEEN 1 AND 100),
  CONSTRAINT characters_avatar_longueur CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048),
  CONSTRAINT characters_version_positive CHECK (version >= 1),
  CONSTRAINT characters_etat_objet CHECK (jsonb_typeof(etat) = 'object'),
  CONSTRAINT characters_etat_coherent CHECK (
    etat->>'type' = type
    AND etat->'systeme'->>'id' = system_id
    AND etat->'systeme'->>'version' = system_version
  )
);
-- Liste « mes personnages », les plus récents d'abord, sans les supprimés
CREATE INDEX characters_owner ON characters (owner_id, updated_at DESC) WHERE deleted_at IS NULL;
--rollback DROP TABLE characters;

--changeset character:0001-legacy-ids
--comment: Anciens identifiants Firebase (cartes/*/characters/{id}…) -> personnages, pour rejouer l'import sans doublon.
CREATE TABLE legacy_ids (
  source        text NOT NULL,   -- ex. 'firestore_character'
  legacy_id     text NOT NULL,
  character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  PRIMARY KEY (source, legacy_id)
);
CREATE UNIQUE INDEX legacy_ids_character ON legacy_ids (source, character_id);
--rollback DROP TABLE legacy_ids;
