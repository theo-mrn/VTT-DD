--liquibase formatted sql

-- Zones sonores (docs/carte.md § 10, Zones sonores) : le son vient de la bibliothèque du service
-- audio (`asset_id`, sans clé étrangère : autre service) ; `url` reste le repli des zones importées
-- de l'ancienne carte. Une zone arrêtée n'est pas envoyée aux joueurs.

--changeset campaign:0027-music-zones-asset
--comment: Son de la bibliothèque (service audio) joué par la zone.
ALTER TABLE map_music_zones ADD COLUMN asset_id uuid;
--rollback ALTER TABLE map_music_zones DROP COLUMN asset_id;

--changeset campaign:0027-music-zones-active
--comment: Zone lancée ou arrêtée par le MJ.
ALTER TABLE map_music_zones ADD COLUMN active boolean NOT NULL DEFAULT true;
--rollback ALTER TABLE map_music_zones DROP COLUMN active;
