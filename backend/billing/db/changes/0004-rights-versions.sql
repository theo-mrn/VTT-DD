--liquibase formatted sql

--changeset billing:0004-rights-versions
--comment: Version des droits publiés par utilisateur (billing.entitlements_changed) : dice et identity appliquent la plus récente et ignorent les anciennes.
CREATE TABLE rights_versions (
  user_id    uuid        PRIMARY KEY,
  version    bigint      NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rights_versions_positive CHECK (version > 0)
);
--rollback DROP TABLE rights_versions;
