--liquibase formatted sql

--changeset identity:0013-map-toolbar-layouts
--comment: Disposition de la barre d'outils de la carte, par compte (docs/carte.md § 6, Personnalisation) : ordre voulu et entrées masquées, version optimiste. Supprimée avec le compte.
CREATE TABLE map_toolbar_layouts (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  layout     jsonb       NOT NULL,
  version    bigint      NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_toolbar_layouts_positive CHECK (version > 0)
);
--rollback DROP TABLE map_toolbar_layouts;
