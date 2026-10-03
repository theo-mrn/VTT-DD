--liquibase formatted sql

--changeset campaign:0002-combats
--comment: Combat actif d'une salle (un seul à la fois). courant : index dans l'ordre (individuel) ou dans les créneaux (creneaux).
CREATE TABLE combats (
  room_id     uuid        PRIMARY KEY REFERENCES rooms (id) ON DELETE CASCADE,
  id          uuid        NOT NULL UNIQUE,
  mode        text        NOT NULL,
  round       int         NOT NULL DEFAULT 1,
  courant     int         NOT NULL DEFAULT 0,
  creneaux    jsonb,                                  -- camps des créneaux, mode creneaux seulement
  initiative  boolean     NOT NULL DEFAULT false,     -- l'initiative a été tirée
  version     int         NOT NULL DEFAULT 1,
  demarre_par uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combats_mode CHECK (mode IN ('individuel', 'creneaux')),
  CONSTRAINT combats_round CHECK (round >= 1),
  CONSTRAINT combats_courant CHECK (courant >= 0),
  CONSTRAINT combats_version_positive CHECK (version >= 1),
  CONSTRAINT combats_creneaux CHECK (
    (mode = 'individuel' AND creneaux IS NULL)
    OR (mode = 'creneaux' AND jsonb_typeof(creneaux) = 'array')
  )
);
--rollback DROP TABLE combats;

--changeset campaign:0002-combat-participants
--comment: Participants d'un combat, dans l'ordre d'initiative (rang croissant). Un participant est forcément engagé dans la salle.
CREATE TABLE combat_participants (
  room_id      uuid    NOT NULL REFERENCES combats (room_id) ON DELETE CASCADE,
  character_id uuid    NOT NULL,
  rang         int     NOT NULL,
  camp         text    NOT NULL,
  cles         jsonb   NOT NULL DEFAULT '[]',         -- clés de tri de l'initiative (initiative.tri)
  a_agi        boolean NOT NULL DEFAULT false,        -- a déjà agi pendant ce round
  PRIMARY KEY (room_id, character_id),
  FOREIGN KEY (room_id, character_id) REFERENCES room_characters (room_id, character_id) ON DELETE CASCADE,
  CONSTRAINT combat_participants_rang UNIQUE (room_id, rang),
  CONSTRAINT combat_participants_cles CHECK (jsonb_typeof(cles) = 'array'),
  CONSTRAINT combat_participants_camp CHECK (camp IN ('joueurs', 'adversaires', 'allies'))
);
--rollback DROP TABLE combat_participants;
