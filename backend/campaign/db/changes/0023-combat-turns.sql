--liquibase formatted sql

-- Combat, étape A (docs/combat.md § 4) : réglages du MJ, acteur du créneau, compteur des passages
-- de tour ; participants cachés aux joueurs, détail d'initiative, initiative demandée au joueur,
-- round d'arrivée, hors de combat ; journal des passages pour « Précédent ».
-- Le début du combat est `created_at` (déjà là) : pas de colonne `started_at` en double.

--changeset campaign:0023-combat-settings
--comment: Réglages du combat (CombatSettings, défauts complétés par le service), acteur désigné du créneau courant (mode slots), compteur des passages de tour.
ALTER TABLE campaign_combats ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE campaign_combats ADD COLUMN current_actor_id uuid;
ALTER TABLE campaign_combats ADD COLUMN turn int NOT NULL DEFAULT 0;
ALTER TABLE campaign_combats
  ADD CONSTRAINT campaign_combats_settings CHECK (jsonb_typeof(settings) = 'object');
ALTER TABLE campaign_combats ADD CONSTRAINT campaign_combats_turn CHECK (turn >= 0);
ALTER TABLE campaign_combats
  ADD CONSTRAINT campaign_combats_actor_slots CHECK (current_actor_id IS NULL OR mode = 'slots');
--rollback ALTER TABLE campaign_combats DROP CONSTRAINT campaign_combats_actor_slots;
--rollback ALTER TABLE campaign_combats DROP CONSTRAINT campaign_combats_turn;
--rollback ALTER TABLE campaign_combats DROP CONSTRAINT campaign_combats_settings;
--rollback ALTER TABLE campaign_combats DROP COLUMN turn;
--rollback ALTER TABLE campaign_combats DROP COLUMN current_actor_id;
--rollback ALTER TABLE campaign_combats DROP COLUMN settings;

--changeset campaign:0023-combat-participants
--comment: Participants : caché aux joueurs, détail d'initiative (CombatInitiative), initiative demandée au joueur, round d'arrivée, hors de combat.
ALTER TABLE campaign_combat_participants
  ADD COLUMN visible_to_players boolean NOT NULL DEFAULT true;
ALTER TABLE campaign_combat_participants ADD COLUMN initiative jsonb;
ALTER TABLE campaign_combat_participants
  ADD COLUMN initiative_pending boolean NOT NULL DEFAULT false;
ALTER TABLE campaign_combat_participants ADD COLUMN joined_round int NOT NULL DEFAULT 1;
ALTER TABLE campaign_combat_participants ADD COLUMN defeated boolean NOT NULL DEFAULT false;
ALTER TABLE campaign_combat_participants
  ADD CONSTRAINT campaign_combat_participants_initiative
  CHECK (initiative IS NULL OR jsonb_typeof(initiative) = 'object');
ALTER TABLE campaign_combat_participants
  ADD CONSTRAINT campaign_combat_participants_joined_round CHECK (joined_round >= 1);
--rollback ALTER TABLE campaign_combat_participants DROP CONSTRAINT campaign_combat_participants_joined_round;
--rollback ALTER TABLE campaign_combat_participants DROP CONSTRAINT campaign_combat_participants_initiative;
--rollback ALTER TABLE campaign_combat_participants DROP COLUMN defeated;
--rollback ALTER TABLE campaign_combat_participants DROP COLUMN joined_round;
--rollback ALTER TABLE campaign_combat_participants DROP COLUMN initiative_pending;
--rollback ALTER TABLE campaign_combat_participants DROP COLUMN initiative;
--rollback ALTER TABLE campaign_combat_participants DROP COLUMN visible_to_players;

--changeset campaign:0023-combat-turns
--comment: Journal des passages de tour (next, new_round, slot_actor, turn_set) : état d'avant (participants par identité), décompte des durées ouvert par le passage. « Précédent » dépile le dernier ; il disparaît avec le combat.
CREATE TABLE campaign_combat_turns (
  id          uuid        PRIMARY KEY,                -- UUIDv7 : ordre des passages
  campaign_id uuid        NOT NULL REFERENCES campaign_combats (campaign_id) ON DELETE CASCADE,
  combat_id   uuid        NOT NULL,
  reason      text        NOT NULL,
  before      jsonb       NOT NULL,                   -- round, tour courant par identité, qui a agi
  tick_id     text,                                   -- décompte des durées de fin de round (character)
  expired     jsonb,                                  -- entrées expirées par personnage à ce décompte
  created_by  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_combat_turns_reason
    CHECK (reason IN ('next', 'new_round', 'slot_actor', 'turn_set')),
  CONSTRAINT campaign_combat_turns_before CHECK (jsonb_typeof(before) = 'object'),
  CONSTRAINT campaign_combat_turns_expired CHECK (expired IS NULL OR jsonb_typeof(expired) = 'object')
);
CREATE INDEX campaign_combat_turns_campaign ON campaign_combat_turns (campaign_id, id DESC);
--rollback DROP TABLE campaign_combat_turns;
