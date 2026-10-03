--liquibase formatted sql

--changeset dice:0002-preferences
--comment: Préférences de dés d'un utilisateur (ancien users/{uid}.dice_skin). Sans ligne : valeurs par défaut.
CREATE TABLE preferences (
  user_id      uuid        PRIMARY KEY,
  skin_id      text        NOT NULL,
  animation_3d boolean     NOT NULL DEFAULT true,
  sound        boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preferences_skin_id CHECK (skin_id ~ '^[a-z0-9_]{1,64}$')
);
--rollback DROP TABLE preferences;

--changeset dice:0002-inventory
--comment: Skins débloqués (ancien users/{uid}.dice_inventory ; plus tard boutique et défis). Les skins gratuits n'y figurent pas : ils sont toujours disponibles.
CREATE TABLE inventory (
  user_id     uuid        NOT NULL,
  skin_id     text        NOT NULL,
  source      text        NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skin_id),
  CONSTRAINT inventory_skin_id CHECK (skin_id ~ '^[a-z0-9_]{1,64}$'),
  CONSTRAINT inventory_source CHECK (source IN ('import', 'purchase', 'challenge', 'gift'))
);
--rollback DROP TABLE inventory;
