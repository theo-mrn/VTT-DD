--liquibase formatted sql

-- Applications du combat (docs/combat.md § 7.2, § 11.2) : les modifications décidées par le MJ
-- (dégâts, soins, états, blessures) sont écrites sans relancer un dé, et chaque écriture garde de
-- quoi être annulée. Un décompte des durées de fin de round (`tickId`) est rangé de la même façon.
--  - applications : une par `applicationId` (UUIDv7 de campaign, ou `tick:<combat>:<round>`),
--    avec la réponse d'origine pour rejouer une reprise réseau sans rien écrire deux fois ;
--  - application_items : une ligne par personnage touché, avec son delta (valeurs, possessions,
--    bonus : avant et après) pour l'annulation, et son résultat (version, diff, hors de combat).

--changeset character:0010-applications
--comment: Applications du combat et décomptes des durées : idempotence et annulation.
CREATE TABLE applications (
  application_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('application', 'tick')),
  campaign_id uuid,
  user_id uuid,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE application_items (
  application_id text NOT NULL REFERENCES applications (application_id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  delta jsonb NOT NULL,
  result jsonb NOT NULL,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, character_id)
);
CREATE INDEX application_items_character ON application_items (character_id);
--rollback DROP TABLE application_items;
--rollback DROP TABLE applications;
