--liquibase formatted sql

--changeset campaign:0004-rooms-parite splitStatements:false
--comment: Champs de l'ancienne app (Salle) : code court partagé, image, joueurs max, salle publique, création de fiches. Les salles existantes reçoivent un code aléatoire.
ALTER TABLE rooms
  ADD COLUMN code                 text,
  ADD COLUMN image_url            text,
  ADD COLUMN max_joueurs          int     NOT NULL DEFAULT 4,
  ADD COLUMN publique             boolean NOT NULL DEFAULT false,
  ADD COLUMN creation_personnages boolean NOT NULL DEFAULT true;

-- Même alphabet que le service : base32 sans 0, O, 1 ni I (codes lus à voix haute)
DO $$
DECLARE
  salle     record;
  alphabet  constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidat  text;
BEGIN
  FOR salle IN SELECT id FROM rooms WHERE code IS NULL LOOP
    LOOP
      candidat := '';
      FOR i IN 1..6 LOOP
        candidat := candidat || substr(alphabet, 1 + floor(random() * 32)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE code = candidat);
    END LOOP;
    UPDATE rooms SET code = candidat WHERE id = salle.id;
  END LOOP;
END $$;

ALTER TABLE rooms
  ALTER COLUMN code SET NOT NULL,
  -- 6 caractères majuscules ou chiffres : les codes générés, et les codes à 6 chiffres importés
  ADD CONSTRAINT rooms_code_forme CHECK (code ~ '^[0-9A-Z]{6}$'),
  ADD CONSTRAINT rooms_code_unique UNIQUE (code),
  ADD CONSTRAINT rooms_max_joueurs CHECK (max_joueurs BETWEEN 1 AND 100),
  ADD CONSTRAINT rooms_image_url_longueur CHECK (char_length(image_url) <= 2048);

-- Liste des campagnes publiques, les plus récemment modifiées d'abord
CREATE INDEX rooms_publiques ON rooms (updated_at DESC, id DESC) WHERE publique;
--rollback DROP INDEX rooms_publiques;
--rollback ALTER TABLE rooms DROP COLUMN code, DROP COLUMN image_url, DROP COLUMN max_joueurs, DROP COLUMN publique, DROP COLUMN creation_personnages;

--changeset campaign:0004-room-bans
--comment: Bannissements : un utilisateur banni ne rejoint plus la salle, ni par code ni par invitation.
CREATE TABLE room_bans (
  room_id   uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL,
  banni_par uuid        NOT NULL,
  banni_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
--rollback DROP TABLE room_bans;

--changeset campaign:0004-room-sessions
--comment: Sessions de jeu prévues par le MJ (ancienne sous-collection Salle/{id}/sessions).
CREATE TABLE room_sessions (
  id         uuid        PRIMARY KEY,               -- UUIDv7 généré par le service
  room_id    uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  prevue_le  timestamptz NOT NULL,
  titre      text,
  cree_par   uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_sessions_titre CHECK (titre IS NULL OR char_length(titre) BETWEEN 1 AND 100)
);
-- Prochaines sessions d'une salle
CREATE INDEX room_sessions_room_date ON room_sessions (room_id, prevue_le);
--rollback DROP TABLE room_sessions;

--changeset campaign:0004-room-messages
--comment: Discussion de la salle (ancienne sous-collection Salle/{id}/chat). L'id UUIDv7 donne l'ordre chronologique.
CREATE TABLE room_messages (
  id         uuid        PRIMARY KEY,               -- UUIDv7 : trié comme la date d'envoi
  room_id    uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  auteur_id  uuid        NOT NULL,
  texte      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_messages_texte CHECK (char_length(texte) BETWEEN 1 AND 1000)
);
-- Derniers messages, et pages précédentes (id < avant)
CREATE INDEX room_messages_room ON room_messages (room_id, id DESC);
-- Limite de débit : messages récents d'un auteur
CREATE INDEX room_messages_auteur ON room_messages (room_id, auteur_id, created_at DESC);
--rollback DROP TABLE room_messages;

--changeset campaign:0004-room-characters-incarne-par
--comment: Personnage incarné (ancien users/{uid}.persoId) : un membre incarne au plus un personnage par salle, un personnage n'est incarné que par un membre. Le départ du membre libère le personnage.
ALTER TABLE room_characters
  ADD COLUMN incarne_par uuid,
  ADD CONSTRAINT room_characters_incarne_par UNIQUE (room_id, incarne_par),
  ADD CONSTRAINT room_characters_incarne_par_membre
    FOREIGN KEY (room_id, incarne_par) REFERENCES room_members (room_id, user_id)
    ON DELETE SET NULL (incarne_par);
--rollback ALTER TABLE room_characters DROP COLUMN incarne_par;
