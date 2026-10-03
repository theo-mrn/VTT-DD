--liquibase formatted sql

--changeset audio:0005-asset-sections
--comment: Espaces où un son apparaît pour le MJ (musique, ambiance), indépendants de son type : un même son peut servir aux deux sans copie. Les effets sont la table d'effets (soundboards).
ALTER TABLE assets ADD COLUMN sections text[] NOT NULL DEFAULT '{}';
ALTER TABLE assets ADD CONSTRAINT assets_sections
  CHECK (sections <@ ARRAY['music', 'ambience']::text[]);
UPDATE assets SET sections = ARRAY[kind] WHERE kind IN ('music', 'ambience');
--rollback ALTER TABLE assets DROP CONSTRAINT assets_sections;
--rollback ALTER TABLE assets DROP COLUMN sections;

--changeset audio:0005-soundboards-from-sfx
--comment: Les effets déjà dans une bibliothèque rejoignent la table d'effets de leur campagne (60 au plus, par nom), sauf si le MJ en a déjà composé une.
INSERT INTO soundboards (campaign_id, asset_ids)
SELECT campaign_id, (array_agg(id ORDER BY name, id))[1:60]
FROM assets
WHERE kind = 'sfx' AND deleted_at IS NULL
GROUP BY campaign_id
ON CONFLICT (campaign_id) DO NOTHING;
--rollback SELECT 1;
