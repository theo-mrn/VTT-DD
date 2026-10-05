--liquibase formatted sql

--changeset dice:0007-billing-rights
--comment: Dernière version des droits reçue de billing (billing.entitlements_changed) par utilisateur : une version plus ancienne ou égale est ignorée.
CREATE TABLE billing_rights (
  user_id    uuid        PRIMARY KEY,
  version    bigint      NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_rights_positive CHECK (version > 0)
);
--rollback DROP TABLE billing_rights;
