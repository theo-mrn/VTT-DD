--liquibase formatted sql

--changeset identity:0001-users
--comment: Comptes. L'identifiant est un UUIDv7 généré par le service.
CREATE TABLE users (
  id             uuid        PRIMARY KEY,
  email          text,
  email_verified boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  disabled_at    timestamptz,
  CONSTRAINT users_email_format CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);
-- Unicité insensible à la casse ; certains comptes importés (Discord seul) n'ont pas d'e-mail
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;
--rollback DROP TABLE users;

--changeset identity:0001-profiles
--comment: Profil public. Correspondance avec l'ancien document Firestore users/{uid} en commentaire.
CREATE TABLE profiles (
  user_id            uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name               text        NOT NULL,                  -- name
  avatar_url         text,                                  -- pp
  title              text,                                  -- titre (titre affiché)
  bio                text,                                  -- bio
  banner_url         text,                                  -- imageURL
  border_type        text        NOT NULL DEFAULT 'none',   -- borderType
  show_premium_badge boolean     NOT NULL DEFAULT true,     -- showPremiumBadge (affiché par défaut)
  time_spent_minutes bigint      NOT NULL DEFAULT 0,        -- timeSpent (en minutes)
  settings           jsonb       NOT NULL DEFAULT '{}',     -- settings
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_name_length CHECK (char_length(name) BETWEEN 1 AND 64),
  CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 2000),
  CONSTRAINT profiles_time_spent_positive CHECK (time_spent_minutes >= 0)
);
--rollback DROP TABLE profiles;

--changeset identity:0001-credentials
--comment: Mot de passe. argon2id pour les nouveaux ; hash scrypt Firebase pour les comptes importés, remplacé à la première connexion.
CREATE TABLE credentials (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  algorithm  text        NOT NULL,
  hash       text        NOT NULL,
  salt       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credentials_algorithm CHECK (algorithm IN ('argon2id', 'firebase-scrypt')),
  CONSTRAINT credentials_salt CHECK ((algorithm = 'firebase-scrypt') = (salt IS NOT NULL))
);
--rollback DROP TABLE credentials;

--changeset identity:0001-oauth-accounts
--comment: Comptes Google et Discord rattachés.
CREATE TABLE oauth_accounts (
  provider            text        NOT NULL,
  provider_account_id text        NOT NULL,
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_account_id),
  CONSTRAINT oauth_accounts_provider CHECK (provider IN ('google', 'discord'))
);
CREATE INDEX oauth_accounts_user ON oauth_accounts (user_id);
--rollback DROP TABLE oauth_accounts;

--changeset identity:0001-legacy-ids
--comment: Anciens identifiants Firebase -> nouveaux UUID ; les imports des autres services s'en servent pour rattacher persos et salles.
CREATE TABLE legacy_ids (
  kind       text NOT NULL,   -- 'firebase_uid'
  legacy_id  text NOT NULL,
  id         uuid NOT NULL,
  PRIMARY KEY (kind, legacy_id)
);
CREATE UNIQUE INDEX legacy_ids_target ON legacy_ids (kind, id);
--rollback DROP TABLE legacy_ids;
