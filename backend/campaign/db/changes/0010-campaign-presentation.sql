--liquibase formatted sql

-- Présentation d'une campagne, vue par sa table et dans les campagnes publiques : une accroche
-- d'une ligne, une couleur d'accent (habille le salon et les cartes) et des genres.

--changeset campaign:0010-campaign-presentation
--comment: Accroche (pitch), couleur d'accent (accent) et genres (tags) des campagnes.
ALTER TABLE campaigns ADD COLUMN pitch text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN accent text NOT NULL DEFAULT 'gold';
ALTER TABLE campaigns ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE campaigns ADD CONSTRAINT campaigns_pitch_length CHECK (char_length(pitch) <= 160);
ALTER TABLE campaigns ADD CONSTRAINT campaigns_accent
  CHECK (accent IN ('gold', 'ember', 'arcane', 'sylvan', 'frost', 'blood'));
ALTER TABLE campaigns ADD CONSTRAINT campaigns_tags_count CHECK (cardinality(tags) <= 10);
--rollback ALTER TABLE campaigns DROP COLUMN tags;
--rollback ALTER TABLE campaigns DROP COLUMN accent;
--rollback ALTER TABLE campaigns DROP COLUMN pitch;
