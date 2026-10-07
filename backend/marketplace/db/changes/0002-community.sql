--liquibase formatted sql

--changeset marketplace:0002-acquisitions
--comment: Bibliothèque : un pack acquis par un compte (gratuit, acheté, offert). Une révocation (remboursement, contestation) garde la ligne ; un nouvel achat la réactive.
CREATE TABLE acquisitions (
  user_id        uuid        NOT NULL,
  listing_id     uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  source         text        NOT NULL,
  sale_id        uuid,
  acquired_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoke_reason  text,
  PRIMARY KEY (user_id, listing_id),
  CONSTRAINT acquisitions_source CHECK (source IN ('free', 'purchase', 'gift')),
  CONSTRAINT acquisitions_sale CHECK (source <> 'purchase' OR sale_id IS NOT NULL),
  CONSTRAINT acquisitions_revoked CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT acquisitions_revoke_reason CHECK (revoke_reason IS NULL OR revoke_reason IN ('refund', 'dispute'))
);
CREATE INDEX acquisitions_listing ON acquisitions (listing_id);
CREATE UNIQUE INDEX acquisitions_sale ON acquisitions (sale_id) WHERE sale_id IS NOT NULL;
--rollback DROP TABLE acquisitions;

--changeset marketplace:0002-installs
--comment: Installation d'une version dans une campagne, appliquée par le navigateur (docs/marketplace.md § 4.3) ; created : comptes des éléments créés.
CREATE TABLE installs (
  id            uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL,
  listing_id    uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  version_id    uuid        NOT NULL REFERENCES listing_versions (id) ON DELETE CASCADE,
  campaign_id   uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'started',
  created       jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CONSTRAINT installs_status CHECK (status IN ('started', 'done')),
  CONSTRAINT installs_done CHECK ((status = 'done') = (completed_at IS NOT NULL AND created IS NOT NULL))
);
CREATE INDEX installs_user ON installs (user_id, listing_id, started_at DESC);
CREATE INDEX installs_campaign ON installs (campaign_id);
--rollback DROP TABLE installs;

--changeset marketplace:0002-reviews
--comment: Avis d'un acquéreur (un par compte et par fiche) ; les compteurs de la fiche sont tenus dans la même transaction.
CREATE TABLE reviews (
  listing_id  uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  rating      smallint    NOT NULL,
  comment     text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id),
  CONSTRAINT reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_comment CHECK (char_length(comment) <= 1000)
);
CREATE INDEX reviews_user ON reviews (user_id);
CREATE INDEX reviews_recent ON reviews (listing_id, updated_at DESC);
--rollback DROP TABLE reviews;

--changeset marketplace:0002-reports
--comment: Signalement d'une fiche ; un seul ouvert par compte et par fiche. reporter_id effacé à la suppression du compte (le signalement reste).
CREATE TABLE reports (
  id           uuid        PRIMARY KEY,
  listing_id   uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  reporter_id  uuid,
  reason       text        NOT NULL,
  details      text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'open',
  outcome      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  uuid,
  CONSTRAINT reports_reason CHECK (reason IN ('copyright', 'adult', 'hateful', 'broken', 'misleading', 'other')),
  CONSTRAINT reports_details CHECK (char_length(details) <= 1000),
  CONSTRAINT reports_status CHECK (status IN ('open', 'resolved', 'dismissed')),
  CONSTRAINT reports_outcome CHECK (outcome IS NULL OR outcome IN ('removed', 'kept')),
  CONSTRAINT reports_resolved CHECK ((status = 'open') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX reports_open ON reports (listing_id, reporter_id) WHERE status = 'open';
CREATE INDEX reports_queue ON reports (created_at) WHERE status = 'open';
CREATE INDEX reports_reporter ON reports (reporter_id, created_at DESC);
--rollback DROP TABLE reports;
