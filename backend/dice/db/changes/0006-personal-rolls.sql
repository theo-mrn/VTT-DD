--liquibase formatted sql

--changeset dice:0006-personal-rolls
--comment: Jets personnels (sans campagne) d'un auteur : historique de la table de dés et vidage par l'auteur, sans parcourir tous ses jets de campagne.
CREATE INDEX rolls_personal ON rolls (author_id, id) WHERE campaign_id IS NULL;
--rollback DROP INDEX rolls_personal;
