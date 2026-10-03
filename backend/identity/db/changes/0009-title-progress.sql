--liquibase formatted sql

--changeset identity:0009-title-progress
--comment: Compteurs par joueur des titres à paliers (jets de dés, critiques, messages : ancienne sous-collection users/{uid}/challenge_progress), tenus par le consommateur identity-titles à partir des événements du bus.
CREATE TABLE title_progress (
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Compteur, ex. dice_rolls, critical_fails, chat_messages
  counter    text        NOT NULL,
  value      bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, counter),
  CONSTRAINT title_progress_counter_format CHECK (counter ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT title_progress_value_positive CHECK (value >= 0)
);
--rollback DROP TABLE title_progress;
