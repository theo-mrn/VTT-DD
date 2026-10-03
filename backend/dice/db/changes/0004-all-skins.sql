--liquibase formatted sql

--changeset dice:0004-all-skins
--comment: Accès à tous les skins (ancien premium de l'app Firebase : ownsDice = isPremium || dice_inventory). Un skin est possédé s'il est gratuit, dans l'inventaire, ou si all_skins est vrai. Posé par l'import, plus tard par billing (PUT /internal/users/:userId/all-skins).
ALTER TABLE preferences ADD COLUMN all_skins boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE preferences DROP COLUMN all_skins;
