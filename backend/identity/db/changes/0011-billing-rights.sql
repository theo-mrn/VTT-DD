--liquibase formatted sql

--changeset identity:0011-billing-rights
--comment: Dernière version des droits reçue de billing (billing.entitlements_changed) par compte : une version plus ancienne ou égale est ignorée. Remplace la route interne PUT /internal/users/:userId/premium.
CREATE TABLE billing_rights (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  version    bigint      NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_rights_positive CHECK (version > 0)
);
--rollback DROP TABLE billing_rights;
