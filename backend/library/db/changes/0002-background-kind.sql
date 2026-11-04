--liquibase formatted sql

-- Deux usages d'un fond (docs/bibliotheque.md) : le plan de carte, vu du dessus, où l'on pose
-- les jetons ; l'illustration, un décor vu de face, pour l'ambiance. L'import le déclare selon
-- sa source (dossier « Illustration » de l'ancien catalogue, export DndBackdrop).

--changeset library:0002-background-kind
--comment: Usage d'un fond : plan de carte ou illustration ; filtre et ordre par usage.
ALTER TABLE backgrounds ADD COLUMN kind text NOT NULL DEFAULT 'map';
ALTER TABLE backgrounds ADD CONSTRAINT backgrounds_kind CHECK (kind IN ('map', 'illustration'));
CREATE INDEX backgrounds_kind_order ON backgrounds (kind, collection, title_fr, id);
--rollback DROP INDEX backgrounds_kind_order;
--rollback ALTER TABLE backgrounds DROP CONSTRAINT backgrounds_kind;
--rollback ALTER TABLE backgrounds DROP COLUMN kind;
