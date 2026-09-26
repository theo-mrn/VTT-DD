--liquibase formatted sql

--changeset identity:0002-sessions
--comment: Refresh tokens opaques à rotation. Seul le SHA-256 du jeton est stocké. Un jeton déjà utilisé qui revient révoque toute sa famille (vol probable).
CREATE TABLE sessions (
  id          uuid        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id   uuid        NOT NULL,         -- chaîne de rotation issue d'une même connexion
  token_hash  bytea       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  rotated_at  timestamptz,                  -- remplacé par un nouveau jeton
  revoked_at  timestamptz,                  -- déconnexion ou réutilisation détectée
  user_agent  text,
  ip          inet,
  CONSTRAINT sessions_token_hash_length CHECK (octet_length(token_hash) = 32)
);
CREATE UNIQUE INDEX sessions_token_hash ON sessions (token_hash);
CREATE INDEX sessions_user ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_family ON sessions (family_id);
--rollback DROP TABLE sessions;
