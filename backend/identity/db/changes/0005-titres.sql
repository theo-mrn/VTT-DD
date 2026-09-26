--liquibase formatted sql

--changeset identity:0005-titres
--comment: Catalogue des titres (ancienne collection Firestore titles) et titres débloqués par joueur (ancien champ users.titles).
CREATE TABLE titles (
  slug             text        PRIMARY KEY,
  label            text        NOT NULL,
  description      text,
  -- Condition de déblocage, ex. {"type": "time", "minutes": 600} ; null = manuel
  condition        jsonb,
  default_unlocked boolean     NOT NULL DEFAULT false,
  sort_order       int         NOT NULL DEFAULT 0,
  CONSTRAINT titles_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$')
);

CREATE TABLE user_titles (
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug        text        NOT NULL REFERENCES titles (slug) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slug)
);
--rollback DROP TABLE user_titles;
--rollback DROP TABLE titles;
