--liquibase formatted sql

--changeset identity:0004-jetons-par-email
--comment: Jetons à usage unique envoyés par e-mail (réinitialisation du mot de passe, vérification d'adresse). Seul le SHA-256 est stocké.
CREATE TABLE email_tokens (
  token_hash  bytea       PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text        NOT NULL,
  email       text        NOT NULL,          -- adresse visée au moment de l'envoi
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  CONSTRAINT email_tokens_purpose CHECK (purpose IN ('password_reset', 'email_verification')),
  CONSTRAINT email_tokens_hash_length CHECK (octet_length(token_hash) = 32)
);
CREATE INDEX email_tokens_user ON email_tokens (user_id, purpose) WHERE used_at IS NULL;
--rollback DROP TABLE email_tokens;

--changeset identity:0004-preferences
--comment: Préférences de notification (ancien champ emailNotifications, activé par défaut).
ALTER TABLE profiles ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;
--rollback ALTER TABLE profiles DROP COLUMN email_notifications;
