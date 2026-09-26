--liquibase formatted sql

--changeset identity:0007-cles-api
--comment: Clés d'API (CLI, bots). La clé n'est affichée qu'à la création ; seul son SHA-256 est stocké.
CREATE TABLE api_keys (
  id           uuid        PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         text        NOT NULL,
  prefix       text        NOT NULL,          -- début de la clé, pour la reconnaître dans la liste
  key_hash     bytea       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  CONSTRAINT api_keys_name_length CHECK (char_length(name) BETWEEN 1 AND 64),
  CONSTRAINT api_keys_hash_length CHECK (octet_length(key_hash) = 32)
);
CREATE UNIQUE INDEX api_keys_hash ON api_keys (key_hash);
CREATE INDEX api_keys_user ON api_keys (user_id) WHERE revoked_at IS NULL;
--rollback DROP TABLE api_keys;
