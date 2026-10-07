--liquibase formatted sql

--changeset marketplace:0001-creators
--comment: Profil public d'un créateur (un par compte). payouts_ready et payouts_version suivent billing.connect_account_updated (dernière version appliquée).
CREATE TABLE creators (
  user_id          uuid        PRIMARY KEY,
  slug             text        NOT NULL,
  display_name     text        NOT NULL,
  bio              text        NOT NULL DEFAULT '',
  payouts_ready    boolean     NOT NULL DEFAULT false,
  payouts_version  bigint      NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          int         NOT NULL DEFAULT 1,
  CONSTRAINT creators_slug_unique UNIQUE (slug),
  CONSTRAINT creators_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT creators_display_name CHECK (char_length(display_name) BETWEEN 2 AND 40),
  CONSTRAINT creators_bio CHECK (char_length(bio) <= 1000),
  CONSTRAINT creators_version CHECK (version >= 1)
);
--rollback DROP TABLE creators;

--changeset marketplace:0001-listings
--comment: Fiche produit. creator_id sans clé étrangère : un compte supprimé emporte son profil, ses fiches restent pour les acquéreurs. search : texte sans accents tenu par le service (titre, résumé, étiquettes, créateur).
CREATE TABLE listings (
  id                  uuid        PRIMARY KEY,
  creator_id          uuid        NOT NULL,
  slug                text        NOT NULL,
  title               text        NOT NULL,
  summary             text        NOT NULL DEFAULT '',
  description         text        NOT NULL DEFAULT '',
  system_id           text,
  license             text        NOT NULL DEFAULT 'personal',
  attribution         text        NOT NULL DEFAULT '',
  price_cents         int         NOT NULL DEFAULT 0,
  currency            text        NOT NULL DEFAULT 'eur',
  tags                text[]      NOT NULL DEFAULT '{}',
  content_warnings    text[]      NOT NULL DEFAULT '{}',
  cover_url           text,
  gallery             text[]      NOT NULL DEFAULT '{}',
  status              text        NOT NULL DEFAULT 'draft',
  kinds               text[]      NOT NULL DEFAULT '{}',
  current_version_id  uuid,
  acquisitions_count  int         NOT NULL DEFAULT 0,
  rating_count        int         NOT NULL DEFAULT 0,
  rating_sum          int         NOT NULL DEFAULT 0,
  search_text         text        NOT NULL DEFAULT '',
  search              tsvector    GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  needs_recheck       boolean     NOT NULL DEFAULT false,
  removed_reason      text,
  removed_at          timestamptz,
  published_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             int         NOT NULL DEFAULT 1,
  CONSTRAINT listings_slug_unique UNIQUE (slug),
  CONSTRAINT listings_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT listings_title CHECK (char_length(title) BETWEEN 3 AND 80),
  CONSTRAINT listings_summary CHECK (char_length(summary) <= 160),
  CONSTRAINT listings_description CHECK (char_length(description) <= 5000),
  CONSTRAINT listings_attribution CHECK (char_length(attribution) <= 500),
  CONSTRAINT listings_license CHECK (license IN ('personal', 'cc-by-4.0', 'cc-by-sa-4.0', 'cc-by-nc-4.0', 'cc0-1.0', 'ogl-1.0a', 'orc')),
  CONSTRAINT listings_price CHECK (price_cents = 0 OR price_cents BETWEEN 200 AND 20000),
  CONSTRAINT listings_currency CHECK (currency = 'eur'),
  CONSTRAINT listings_tags CHECK (cardinality(tags) <= 5),
  CONSTRAINT listings_warnings CHECK (content_warnings <@ ARRAY['violence', 'horror', 'gore', 'drugs', 'phobias']),
  CONSTRAINT listings_gallery CHECK (cardinality(gallery) <= 8),
  CONSTRAINT listings_status CHECK (status IN ('draft', 'published', 'unlisted', 'removed')),
  CONSTRAINT listings_kinds CHECK (kinds <@ ARRAY['scenes', 'npcs', 'objects']),
  CONSTRAINT listings_counters CHECK (acquisitions_count >= 0 AND rating_count >= 0 AND rating_sum >= 0),
  CONSTRAINT listings_published CHECK (status = 'draft' OR published_at IS NOT NULL OR status = 'removed'),
  CONSTRAINT listings_removed CHECK ((status = 'removed') = (removed_at IS NOT NULL)),
  CONSTRAINT listings_removed_reason CHECK (status <> 'removed' OR removed_reason IS NOT NULL),
  CONSTRAINT listings_version CHECK (version >= 1)
);
CREATE INDEX listings_search ON listings USING gin (search);
CREATE INDEX listings_catalog ON listings (published_at DESC) WHERE status = 'published';
CREATE INDEX listings_creator ON listings (creator_id, updated_at DESC);
CREATE INDEX listings_recheck ON listings (updated_at) WHERE needs_recheck;
--rollback DROP TABLE listings;

--changeset marketplace:0001-versions
--comment: Version d'un pack. Le contenu (JSON) est rangé sur R2 (content_key) ; une version soumise est immuable. Une seule version en cours (brouillon ou en revue) par fiche.
CREATE TABLE listing_versions (
  id                  uuid        PRIMARY KEY,
  listing_id          uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  number              text        NOT NULL,
  notes               text        NOT NULL DEFAULT '',
  status              text        NOT NULL DEFAULT 'draft',
  content_key         text,
  content_sha256      text,
  content_bytes       int,
  counts              jsonb,
  system_id           text,
  rights_attested_at  timestamptz,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid,
  review_reason       text,
  review_note         text,
  published_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_versions_number_unique UNIQUE (listing_id, number),
  CONSTRAINT listing_versions_number CHECK (number ~ '^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$'),
  CONSTRAINT listing_versions_notes CHECK (char_length(notes) <= 2000),
  CONSTRAINT listing_versions_status CHECK (status IN ('draft', 'in_review', 'published', 'rejected')),
  CONSTRAINT listing_versions_content CHECK ((content_key IS NULL) = (content_sha256 IS NULL) AND (content_key IS NULL) = (content_bytes IS NULL) AND (content_key IS NULL) = (counts IS NULL)),
  CONSTRAINT listing_versions_submitted CHECK (status = 'draft' OR (submitted_at IS NOT NULL AND content_key IS NOT NULL AND rights_attested_at IS NOT NULL)),
  CONSTRAINT listing_versions_reviewed CHECK (status NOT IN ('published', 'rejected') OR reviewed_at IS NOT NULL),
  CONSTRAINT listing_versions_rejected CHECK (status <> 'rejected' OR review_reason IS NOT NULL),
  CONSTRAINT listing_versions_reason CHECK (review_reason IS NULL OR review_reason IN ('rights', 'adult', 'hateful', 'quality', 'broken', 'misleading', 'other')),
  CONSTRAINT listing_versions_note CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  CONSTRAINT listing_versions_published CHECK ((status = 'published') = (published_at IS NOT NULL))
);
CREATE UNIQUE INDEX listing_versions_open ON listing_versions (listing_id) WHERE status IN ('draft', 'in_review');
CREATE INDEX listing_versions_review ON listing_versions (submitted_at) WHERE status = 'in_review';
CREATE INDEX listing_versions_listing ON listing_versions (listing_id, created_at DESC);
--rollback DROP TABLE listing_versions;

--changeset marketplace:0001-assets
--comment: Fichiers copiés pour une fiche (R2 → R2), un par source : une nouvelle version réutilise les copies existantes.
CREATE TABLE listing_assets (
  listing_id    uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  source_key    text        NOT NULL,
  key           text        NOT NULL,
  bytes         bigint      NOT NULL,
  content_type  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, source_key),
  CONSTRAINT listing_assets_key_unique UNIQUE (key),
  CONSTRAINT listing_assets_key CHECK (key LIKE 'marketplace/%'),
  CONSTRAINT listing_assets_bytes CHECK (bytes >= 0)
);
--rollback DROP TABLE listing_assets;
