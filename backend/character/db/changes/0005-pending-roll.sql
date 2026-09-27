--liquibase formatted sql

-- Tirage de création en attente de répartition : une étape « tirer » en attribution libre
-- (plusieurs attributs) montre d'abord les valeurs tirées par le serveur, puis le joueur les
-- répartit. Le tirage est gardé ici entre les deux requêtes, et rejoué à l'identique : le
-- client ne choisit jamais ses dés.

--changeset character:0005-pending-roll
--comment: Tirage de création en attente de répartition ({ etape, des }), null sinon.
ALTER TABLE characters ADD COLUMN pending_roll jsonb;
--rollback ALTER TABLE characters DROP COLUMN pending_roll;
