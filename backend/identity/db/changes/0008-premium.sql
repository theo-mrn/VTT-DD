--liquibase formatted sql

--changeset identity:0008-premium
--comment: Abonnement premium (ancien users/{uid}.premium), posé par le service billing (PUT /internal/users/:userId/premium) : badge et bordures du profil public. billing reste la source de vérité de l'abonnement.
ALTER TABLE profiles ADD COLUMN premium boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE profiles DROP COLUMN premium;
