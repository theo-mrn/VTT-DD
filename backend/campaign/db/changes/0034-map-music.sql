--liquibase formatted sql

-- Musique d'une scène : une playlist ou une piste de la bibliothèque audio, lancée quand la
-- scène devient celle du groupe ; absente, la musique en cours continue.

--changeset campaign:0034-map-music
--comment: Musique par scène, aucune par défaut.
ALTER TABLE maps ADD COLUMN music jsonb;
ALTER TABLE maps ADD CONSTRAINT maps_music CHECK (music IS NULL OR jsonb_typeof(music) = 'object');
--rollback ALTER TABLE maps DROP COLUMN music;
