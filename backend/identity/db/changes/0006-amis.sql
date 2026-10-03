--liquibase formatted sql

--changeset identity:0006-amis
--comment: Demandes d'ami en attente et amitiés (anciennes collections requests/* et friendships/*).
CREATE TABLE friend_requests (
  from_user  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_user, to_user),
  CONSTRAINT friend_requests_pas_soi CHECK (from_user <> to_user)
);
CREATE INDEX friend_requests_to ON friend_requests (to_user);

-- Une ligne par amitié, paire ordonnée (user_a < user_b) : pas de doublon A-B / B-A
CREATE TABLE friendships (
  user_a     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT friendships_ordre CHECK (user_a < user_b)
);
CREATE INDEX friendships_b ON friendships (user_b);
--rollback DROP TABLE friendships;
--rollback DROP TABLE friend_requests;
