--liquibase formatted sql

--changeset dice:0005-physical-rolls
--comment: Jets dont l'animation 3D des dés fait foi, comme dans l'ancienne app : source « 3d » (toutes les valeurs lues sur les dés du client, physicalResults) ou « mixed » (valeurs manquantes tirées par le serveur).
ALTER TABLE rolls DROP CONSTRAINT rolls_source;
ALTER TABLE rolls ADD CONSTRAINT rolls_source CHECK (source IN ('free', 'action', 'api', 'import', '3d', 'mixed'));
--rollback ALTER TABLE rolls DROP CONSTRAINT rolls_source;
--rollback ALTER TABLE rolls ADD CONSTRAINT rolls_source CHECK (source IN ('free', 'action', 'api', 'import'));
