--liquibase formatted sql

--changeset dice:0001-rolls
--comment: Jets de dés tirés par le serveur (ou importés de l'ancienne app rolls/{roomId}/rolls). L'identifiant UUIDv7 donne l'ordre chronologique de l'historique.
CREATE TABLE rolls (
  id                uuid             PRIMARY KEY,
  campaign_id       uuid,                                   -- null : jet personnel (auteur seul)
  author_id         uuid,                                   -- null seulement pour un jet importé sans compte retrouvé
  author_name       text             NOT NULL,              -- nom affiché au moment du jet (ancien userName : personnage, « MJ » ou profil)
  author_avatar_url text,                                   -- ancien userAvatar
  character_id      uuid,                                   -- ancien persoId
  source            text             NOT NULL,
  action_id         text,                                   -- action du système (source = action)
  label             text,
  notation          text,
  system_id         text,                                   -- système des dés à symboles
  visibility        text             NOT NULL DEFAULT 'public',
  dice              jsonb            NOT NULL DEFAULT '[]',
  symbols           jsonb,
  dice_count        int              NOT NULL DEFAULT 0,    -- ancien diceCount : dés du premier groupe
  dice_faces        int              NOT NULL DEFAULT 0,    -- ancien diceFaces : faces du premier groupe
  total             double precision,
  output            text             NOT NULL DEFAULT '',   -- détail lisible (« 1d20+3 = [17]+3 = 20 »)
  symbol_result     text,                                   -- résultat d'un jet à symboles (« 2 Succès + 1 Avantages »)
  legacy_type       text,                                   -- ancien champ type (« Dice Roller »…), jets importés
  outcome           jsonb            NOT NULL DEFAULT '{}',
  explanations      jsonb            NOT NULL DEFAULT '[]',
  idempotency_key   text,                                   -- en-tête Idempotency-Key du jet
  created_at        timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT rolls_source CHECK (source IN ('free', 'action', 'api', 'import')),
  CONSTRAINT rolls_visibility CHECK (visibility IN ('public', 'private', 'gm', 'self')),
  CONSTRAINT rolls_author CHECK (author_id IS NOT NULL OR source = 'import'),
  -- Sans campagne, le jet est personnel : visible par son auteur seul
  CONSTRAINT rolls_personal CHECK (campaign_id IS NOT NULL OR visibility = 'self'),
  CONSTRAINT rolls_label_length CHECK (char_length(label) <= 200),
  CONSTRAINT rolls_author_name_length CHECK (char_length(author_name) <= 200),
  CONSTRAINT rolls_output_length CHECK (char_length(output) <= 5000),
  CONSTRAINT rolls_notation_length CHECK (char_length(notation) <= 500),
  CONSTRAINT rolls_dice_array CHECK (jsonb_typeof(dice) = 'array'),
  CONSTRAINT rolls_explanations_array CHECK (jsonb_typeof(explanations) = 'array'),
  CONSTRAINT rolls_idempotency_key CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$')
);
-- Historique d'une campagne (pagination par identifiant)
CREATE INDEX rolls_campaign ON rolls (campaign_id, id) WHERE campaign_id IS NOT NULL;
-- Statistiques par type de dé (ancien filtre « 1d20 »)
CREATE INDEX rolls_campaign_type ON rolls (campaign_id, dice_faces, dice_count) WHERE campaign_id IS NOT NULL;
-- Jets personnels, statistiques par joueur, limite de débit par auteur
CREATE INDEX rolls_author ON rolls (author_id, id);
-- Une requête rejouée (même clé, même auteur) ne relance jamais les dés
CREATE UNIQUE INDEX rolls_idempotency ON rolls (author_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--rollback DROP TABLE rolls;

--changeset dice:0001-legacy-ids
--comment: Jets Firebase importés (rolls/{roomId}/rolls/{id}) -> jets, pour rejouer l'import sans doublon.
CREATE TABLE legacy_ids (
  source    text NOT NULL,                                  -- 'firebase'
  legacy_id text NOT NULL,                                  -- chemin du document
  roll_id   uuid NOT NULL REFERENCES rolls (id) ON DELETE CASCADE,
  PRIMARY KEY (source, legacy_id)
);
CREATE INDEX legacy_ids_roll ON legacy_ids (roll_id);
--rollback DROP TABLE legacy_ids;
