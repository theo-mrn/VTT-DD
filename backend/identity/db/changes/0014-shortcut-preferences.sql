--liquibase formatted sql

--changeset identity:0014-shortcut-preferences
--comment: Raccourcis clavier de l'utilisateur (docs/raccourcis.md § 4) : écarts aux touches par défaut et raccourcis créés, version optimiste. Supprimés avec le compte.
CREATE TABLE shortcut_preferences (
  user_id     uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  preferences jsonb       NOT NULL,
  version     bigint      NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shortcut_preferences_positive CHECK (version > 0)
);
--rollback DROP TABLE shortcut_preferences;
