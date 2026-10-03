--liquibase formatted sql

-- Portails (docs/carte.md § 10, Portails) : franchis sans question (`auto`) et reliés deux à
-- deux (`linked_portal_id`, aller-retour, sur la même carte ou sur deux scènes de la campagne).
-- Le lien est symétrique et tenu par le service ; la base garantit seulement qu'il vise un
-- portail de la même campagne, jamais lui-même, et qu'il disparaît avec lui.

--changeset campaign:0022-map-portals-use
--comment: Portails : franchissement automatique et retour relié (aller-retour).
ALTER TABLE map_portals ADD COLUMN auto boolean NOT NULL DEFAULT false;
ALTER TABLE map_portals ADD COLUMN linked_portal_id uuid;
ALTER TABLE map_portals ADD CONSTRAINT map_portals_id_campaign UNIQUE (id, campaign_id);
ALTER TABLE map_portals
  ADD CONSTRAINT map_portals_linked FOREIGN KEY (linked_portal_id, campaign_id)
  REFERENCES map_portals (id, campaign_id) ON DELETE SET NULL (linked_portal_id);
ALTER TABLE map_portals
  ADD CONSTRAINT map_portals_linked_not_self CHECK (linked_portal_id IS NULL OR linked_portal_id <> id);
CREATE INDEX map_portals_linked ON map_portals (linked_portal_id)
  WHERE linked_portal_id IS NOT NULL;
--rollback DROP INDEX map_portals_linked;
--rollback ALTER TABLE map_portals DROP CONSTRAINT map_portals_linked_not_self;
--rollback ALTER TABLE map_portals DROP CONSTRAINT map_portals_linked;
--rollback ALTER TABLE map_portals DROP CONSTRAINT map_portals_id_campaign;
--rollback ALTER TABLE map_portals DROP COLUMN linked_portal_id;
--rollback ALTER TABLE map_portals DROP COLUMN auto;

--changeset campaign:0022-map-portals-legacy-pairs
--comment: Paires jumelles de l'ancienne app (même carte, arrivées croisées) reliées.
-- Deux portails `same_map` de la même carte dont chacun arrive sur l'autre (à un demi-pixel
-- près) forment une paire ; un portail pris dans plusieurs paires reste seul (ambigu).
WITH pairs AS (
  SELECT a.id AS a, b.id AS b
  FROM map_portals a
  JOIN map_portals b
    ON b.map_id = a.map_id AND b.id > a.id
   AND a.kind = 'same_map' AND b.kind = 'same_map'
   AND a.target IS NOT NULL AND b.target IS NOT NULL
   AND ST_DWithin(a.target, b.pos, 0.5) AND ST_DWithin(b.target, a.pos, 0.5)
),
single AS (
  SELECT p.a, p.b
  FROM pairs p
  WHERE (SELECT count(*) FROM pairs q WHERE q.a IN (p.a, p.b) OR q.b IN (p.a, p.b)) = 1
)
UPDATE map_portals m
   SET linked_portal_id = CASE WHEN m.id = s.a THEN s.b ELSE s.a END
  FROM single s
 WHERE m.id IN (s.a, s.b);
--rollback UPDATE map_portals SET linked_portal_id = NULL;

--changeset campaign:0022-map-portals-legacy-spawn
--comment: Changement de scène vers (0, 0) de l'ancienne app : le point d'arrivée de la scène.
-- L'ancienne app lisait une arrivée en (0, 0) comme « le point d'arrivée de la scène visée » ;
-- ici, c'est `target` nul.
UPDATE map_portals SET target = NULL
 WHERE kind = 'scene_change' AND target IS NOT NULL AND ST_X(target) = 0 AND ST_Y(target) = 0;
--rollback SELECT 1;
