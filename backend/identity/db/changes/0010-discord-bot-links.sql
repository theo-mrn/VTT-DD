--liquibase formatted sql

--changeset identity:0010-discord-bot-links
--comment: Lien du bot de dés Discord (docs/discord.md), distinct de la connexion Discord du site : /link le pose sur le compte connecté, /unlink le retire (user_id NULL : le bot n'agit plus pour cet identifiant), sans jamais toucher aux moyens de connexion. Sans ligne, le bot suit le compte connecté avec Discord (oauth_accounts).
CREATE TABLE discord_bot_links (
  discord_user_id text        PRIMARY KEY,
  user_id         uuid        REFERENCES users (id) ON DELETE CASCADE,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discord_bot_links_id_format CHECK (discord_user_id ~ '^[0-9]{1,32}$')
);
CREATE INDEX discord_bot_links_user ON discord_bot_links (user_id);
--rollback DROP TABLE discord_bot_links;
