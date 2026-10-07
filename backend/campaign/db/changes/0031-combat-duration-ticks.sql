--liquibase formatted sql

-- Durées décomptées au nombre de tours (docs/combat.md § 18) : chaque passage de tour garde les
-- événements de son décompte (début et fin de tour d'un personnage, fin de round). `expired`
-- non nul marque le décompte fait ; un décompte qui n'a pas abouti (character injoignable) est
-- rejoué au passage suivant, dans l'ordre du journal.

--changeset campaign:0031-combat-duration-ticks
--comment: Événements du décompte des durées d'un passage de tour, rejoués s'il n'a pas abouti.
ALTER TABLE campaign_combat_turns ADD COLUMN tick_events jsonb;
--rollback ALTER TABLE campaign_combat_turns DROP COLUMN tick_events;

--changeset campaign:0031-combat-pending-ticks
--comment: Décomptes en attente d'un combat, dans l'ordre du journal.
CREATE INDEX campaign_combat_turns_pending_ticks ON campaign_combat_turns (combat_id, created_at, id)
  WHERE tick_id IS NOT NULL AND tick_events IS NOT NULL AND expired IS NULL;
--rollback DROP INDEX campaign_combat_turns_pending_ticks;
