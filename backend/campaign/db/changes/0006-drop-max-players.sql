--liquibase formatted sql

-- Plus de limite de joueurs par campagne : une campagne accepte autant de joueurs qu'on veut
-- (des campagnes importées en comptaient déjà bien plus que leur ancien maximum).

--changeset campaign:0006-drop-max-players
--comment: Suppression de campaigns.max_players et de sa contrainte campaigns_max_players.
ALTER TABLE campaigns DROP CONSTRAINT campaigns_max_players;
ALTER TABLE campaigns DROP COLUMN max_players;
--rollback ALTER TABLE campaigns ADD COLUMN max_players int NOT NULL DEFAULT 4;
--rollback ALTER TABLE campaigns ADD CONSTRAINT campaigns_max_players CHECK (max_players BETWEEN 1 AND 100);
