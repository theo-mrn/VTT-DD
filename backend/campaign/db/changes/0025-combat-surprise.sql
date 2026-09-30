--liquibase formatted sql

-- Situation du combat (docs/combat.md § 5.7) : participant surpris, marqué par le MJ au démarrage
-- ou en cours, lu par les règles (`@combat.acteur.surpris`, `@combat.cible.surpris`). Le décompte
-- des attaques (`tally`) se calcule sur `campaign_attacks` : rien à stocker.

--changeset campaign:0025-combat-surprise
--comment: Participant surpris (embuscade), décidé par le MJ ; lu par les règles à la déclaration d'une attaque.
ALTER TABLE campaign_combat_participants ADD COLUMN surprised boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE campaign_combat_participants DROP COLUMN surprised;

--changeset campaign:0025-attacks-combat-tally
--comment: Décompte des attaques d'un combat (attaquant, round) : index sur les attaques du combat.
CREATE INDEX campaign_attacks_combat ON campaign_attacks (combat_id, attacker_id, round)
  WHERE combat_id IS NOT NULL;
--rollback DROP INDEX campaign_attacks_combat;
