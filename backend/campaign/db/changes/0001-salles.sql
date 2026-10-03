--liquibase formatted sql

--changeset campaign:0001-rooms
--comment: Salles de jeu. Le propriétaire (MJ créateur) est aussi membre « mj » dans room_members.
CREATE TABLE rooms (
  id             uuid        PRIMARY KEY,               -- UUIDv7 généré par le service
  nom            text        NOT NULL,
  description    text        NOT NULL DEFAULT '',
  system_id      text        NOT NULL,                  -- système de règles de la salle
  system_version text        NOT NULL,
  owner_id       uuid        NOT NULL,                  -- MJ propriétaire (identity), seul à pouvoir supprimer
  version        int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_nom_longueur CHECK (char_length(nom) BETWEEN 1 AND 100),
  CONSTRAINT rooms_description_longueur CHECK (char_length(description) <= 2000),
  CONSTRAINT rooms_version_positive CHECK (version >= 1)
);
--rollback DROP TABLE rooms;

--changeset campaign:0001-room-members
--comment: Membres et rôles (remplace users.room_id + users.perso de Firebase) : un utilisateur peut être dans plusieurs salles.
CREATE TABLE room_members (
  room_id   uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL,
  role      text        NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id),
  CONSTRAINT room_members_role CHECK (role IN ('mj', 'joueur', 'spectateur'))
);
-- « Mes salles »
CREATE INDEX room_members_user ON room_members (user_id);
--rollback DROP TABLE room_members;

--changeset campaign:0001-invitations
--comment: Liens d'invitation. Seul le SHA-256 du code est stocké : une fuite de la base ne donne aucun code utilisable.
CREATE TABLE invitations (
  id               uuid        PRIMARY KEY,
  room_id          uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  code_hash        text        NOT NULL UNIQUE,
  cree_par         uuid        NOT NULL,
  expire_le        timestamptz NOT NULL,
  utilisations_max int         NOT NULL,
  utilisations     int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_code_hash CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invitations_utilisations CHECK (
    utilisations_max >= 1 AND utilisations >= 0 AND utilisations <= utilisations_max
  )
);
CREATE INDEX invitations_room ON invitations (room_id);
--rollback DROP TABLE invitations;

--changeset campaign:0001-room-characters
--comment: Personnages engagés dans une salle. Les personnages vivent dans character ; owner_id est une copie (immuable côté character) pour les droits.
CREATE TABLE room_characters (
  room_id      uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  character_id uuid        NOT NULL,
  owner_id     uuid        NOT NULL,                  -- propriétaire du personnage
  camp         text        NOT NULL,
  ajoute_par   uuid        NOT NULL,                  -- membre qui l'a engagé
  ajoute_le    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, character_id),
  CONSTRAINT room_characters_camp CHECK (camp IN ('joueurs', 'adversaires', 'allies'))
);
-- Droits demandés par character : dans quelles salles ce personnage est-il engagé ?
CREATE INDEX room_characters_character ON room_characters (character_id);
--rollback DROP TABLE room_characters;

--changeset campaign:0001-legacy-ids
--comment: Anciens identifiants Firebase (Salle, salles, rooms fusionnées) -> salles, pour rejouer l'import sans doublon.
CREATE TABLE legacy_ids (
  source    text NOT NULL,   -- ex. 'firestore_room'
  legacy_id text NOT NULL,
  room_id   uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  PRIMARY KEY (source, legacy_id)
);
CREATE INDEX legacy_ids_room ON legacy_ids (room_id);
--rollback DROP TABLE legacy_ids;
