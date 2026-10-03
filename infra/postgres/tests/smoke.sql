-- Tests SQL exécutés en CI sur une vraie base PostGIS (psql -v ON_ERROR_STOP=1).
-- Chaque vérification lève une exception si elle échoue.
\set ON_ERROR_STOP 1

-- Schéma jetable : les vrais schémas (campaign…) restent à Liquibase, migré ensuite
DROP SCHEMA IF EXISTS smoke CASCADE;
CREATE SCHEMA smoke;
SET search_path = smoke, public;
\ir ../templates/outbox.sql
\ir ../templates/campaign-spatial.sql

DO $$
DECLARE m uuid := gen_random_uuid(); me uuid := gen_random_uuid(); n int; blocked bool; plan text;
BEGIN
  INSERT INTO smoke.maps VALUES (m, gen_random_uuid(), 'test', 1000, 800, 50);
  INSERT INTO smoke.tokens (id, map_id, pos, vision_radius) VALUES
    (me, m, ST_Point(100, 100, 0), 300),
    (gen_random_uuid(), m, ST_Point(300, 100, 0), 0),
    (gen_random_uuid(), m, ST_Point(900, 700, 0), 0);
  INSERT INTO smoke.obstacles VALUES
    (gen_random_uuid(), m, 'wall', false, ST_GeomFromText('LINESTRING(200 0, 200 150)', 0));

  SELECT count(*) INTO n FROM smoke.tokens t, smoke.tokens s
   WHERE s.id = me AND t.map_id = m AND t.id <> me AND ST_DWithin(t.pos, s.pos, s.vision_radius);
  IF n <> 1 THEN RAISE EXCEPTION 'vision : attendu 1 token visible, obtenu %', n; END IF;

  SELECT EXISTS (SELECT 1 FROM smoke.obstacles o WHERE o.map_id = m AND NOT o.is_open
     AND ST_Intersects(o.geom, ST_MakeLine(ST_Point(100,100,0), ST_Point(300,100,0)))) INTO blocked;
  IF NOT blocked THEN RAISE EXCEPTION 'ligne de vue : le mur devrait bloquer'; END IF;
  RAISE NOTICE 'spatial OK';
END $$;

-- Journal d'historique : schéma réel migré par Liquibase (backend/history/db),
-- vérifié après les migrations par infra/postgres/tests/history-droits.sh.

DROP SCHEMA smoke CASCADE;
