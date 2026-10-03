--liquibase formatted sql

-- Objets de l'inventaire Firebase (Inventaire/{salle}/{personnage}/{id}) repris pour un
-- personnage : la reprise de l'import ne reprend jamais deux fois le même objet. Par
-- personnage : deux personnages legacy de même nom dans une salle partageaient leur
-- inventaire.

--changeset character:0008-legacy-items
--comment: Objets legacy repris par personnage (reprise idempotente de l'import).
CREATE TABLE legacy_items (
  character_id  uuid        NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  legacy_id     text        NOT NULL,   -- chemin du document Firestore de l'objet
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, legacy_id)
);
--rollback DROP TABLE legacy_items;
