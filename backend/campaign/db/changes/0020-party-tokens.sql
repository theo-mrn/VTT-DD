--liquibase formatted sql

-- Tous les personnages joueurs sur la carte (docs/carte.md § 10) : un personnage du camp des
-- joueurs, ou incarné par un membre, qui n'a de token présent sur aucune scène rejoint la scène
-- du groupe (sinon le fond global). Il reprend sa dernière place mémorisée sur cette scène s'il
-- en a une ; sinon il est posé en grille, quatre de front, centrée sur le point d'apparition
-- (sinon sur le centre de la carte). Calque et ordre : déclencheurs de 0018. Le service fait de
-- même pour tout personnage joueur engagé ou incarné ensuite (`placeOnPartyMap`).

--changeset campaign:0020-party-tokens
--comment: Personnages joueurs sans token posés sur la scène du groupe.
WITH party AS (
  SELECT c.id AS campaign_id,
         COALESCE(
           s.party_map_id,
           (SELECT m.id FROM maps m WHERE m.campaign_id = c.id AND m.is_default LIMIT 1)
         ) AS map_id,
         COALESCE(NULLIF(s.pixels_per_unit, 0), 50) AS cell
  FROM campaigns c
  LEFT JOIN map_settings s ON s.campaign_id = c.id
),
missing AS (
  SELECT cc.campaign_id, cc.character_id, p.map_id, p.cell,
         ROW_NUMBER() OVER (PARTITION BY cc.campaign_id ORDER BY cc.character_id) - 1 AS n,
         LEAST(COUNT(*) OVER (PARTITION BY cc.campaign_id), 4) AS cols
  FROM campaign_characters cc
  JOIN party p ON p.campaign_id = cc.campaign_id AND p.map_id IS NOT NULL
  WHERE (cc.side = 'players' OR cc.played_by IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM map_tokens t
      WHERE t.campaign_id = cc.campaign_id AND t.character_id = cc.character_id AND t.present
    )
),
spot AS (
  SELECT mi.campaign_id, mi.character_id, mi.map_id,
         COALESCE(ST_X(m.spawn), COALESCE(m.width, 0) / 2.0)
           + ((mi.n % 4) - (mi.cols - 1) / 2.0) * mi.cell AS x,
         COALESCE(ST_Y(m.spawn), COALESCE(m.height, 0) / 2.0) + (mi.n / 4) * mi.cell AS y
  FROM missing mi
  JOIN maps m ON m.id = mi.map_id
),
revived AS (
  UPDATE map_tokens t
  SET present = true, version = t.version + 1, updated_at = now()
  FROM spot s
  WHERE t.map_id = s.map_id AND t.character_id = s.character_id
  RETURNING t.id
)
INSERT INTO map_tokens (id, campaign_id, map_id, character_id, pos)
SELECT gen_random_uuid(), s.campaign_id, s.map_id, s.character_id,
       ST_SetSRID(ST_MakePoint(s.x, s.y), 0)
FROM spot s
WHERE NOT EXISTS (
  SELECT 1 FROM map_tokens t WHERE t.map_id = s.map_id AND t.character_id = s.character_id
);
--rollback SELECT 1;
