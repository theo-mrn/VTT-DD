--liquibase formatted sql

-- Voix à la table (docs/voix.md § 4) : par scène, tout le monde s'entend (table) ou selon la
-- distance et les murs (proximity), portées en cases de la scène.

--changeset campaign:0032-map-voice
--comment: Réglage de la voix par scène ; toutes les scènes, existantes ou neuves, en mode table.
ALTER TABLE maps ADD COLUMN voice jsonb NOT NULL
  DEFAULT '{"mode": "table", "clearRange": 6, "maxRange": 24}'::jsonb;
ALTER TABLE maps ADD CONSTRAINT maps_voice_mode CHECK (voice->>'mode' IN ('table', 'proximity'));
--rollback ALTER TABLE maps DROP COLUMN voice;
