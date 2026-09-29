--liquibase formatted sql

-- Instances de PNJ posées sur la carte (docs/carte.md § 12) : chaque PNJ posé est un vrai
-- personnage (kind = npc) possédé par le MJ. On garde son origine :
--  - template_id : le modèle de PNJ dont il est la copie (null : bestiaire, création rapide
--    ou copie d'une autre instance) ; pas de clé étrangère, un modèle supprimé laisse la trace ;
--  - campaign_id : la campagne pour laquelle il a été créé (numérotation « Gobelin 2 »
--    propre à la campagne). Son engagement reste décidé par campaign.

--changeset character:0009-npc-instances
--comment: Origine des instances de PNJ : modèle copié et campagne de création.
ALTER TABLE characters ADD COLUMN template_id uuid;
ALTER TABLE characters ADD COLUMN campaign_id uuid;
CREATE INDEX characters_npc_campaign ON characters (campaign_id)
  WHERE campaign_id IS NOT NULL AND deleted_at IS NULL;
--rollback DROP INDEX characters_npc_campaign;
--rollback ALTER TABLE characters DROP COLUMN campaign_id;
--rollback ALTER TABLE characters DROP COLUMN template_id;
