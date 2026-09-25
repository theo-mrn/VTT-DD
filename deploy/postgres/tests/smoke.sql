-- Tests SQL exécutés en CI sur une vraie base PostGIS (psql -v ON_ERROR_STOP=1).
-- Chaque vérification lève une exception si elle échoue.
\set ON_ERROR_STOP 1

SET search_path = campaign, public;
\ir ../templates/outbox.sql
\ir ../templates/campaign-spatial.sql
SET search_path = history, public;
\ir ../templates/history-events.sql
CREATE TABLE history.events_test PARTITION OF history.events FOR VALUES FROM ('2000-01-01') TO ('2100-01-01');

DO $$
DECLARE m uuid := gen_random_uuid(); me uuid := gen_random_uuid(); n int; blocked bool; plan text;
BEGIN
  INSERT INTO campaign.maps VALUES (m, gen_random_uuid(), 'test', 1000, 800, 50);
  INSERT INTO campaign.tokens (id, map_id, pos, vision_radius) VALUES
    (me, m, ST_Point(100, 100, 0), 300),
    (gen_random_uuid(), m, ST_Point(300, 100, 0), 0),
    (gen_random_uuid(), m, ST_Point(900, 700, 0), 0);
  INSERT INTO campaign.obstacles VALUES
    (gen_random_uuid(), m, 'wall', false, ST_GeomFromText('LINESTRING(200 0, 200 150)', 0));

  SELECT count(*) INTO n FROM campaign.tokens t, campaign.tokens s
   WHERE s.id = me AND t.map_id = m AND t.id <> me AND ST_DWithin(t.pos, s.pos, s.vision_radius);
  IF n <> 1 THEN RAISE EXCEPTION 'vision : attendu 1 token visible, obtenu %', n; END IF;

  SELECT EXISTS (SELECT 1 FROM campaign.obstacles o WHERE o.map_id = m AND NOT o.is_open
     AND ST_Intersects(o.geom, ST_MakeLine(ST_Point(100,100,0), ST_Point(300,100,0)))) INTO blocked;
  IF NOT blocked THEN RAISE EXCEPTION 'ligne de vue : le mur devrait bloquer'; END IF;
  RAISE NOTICE 'spatial OK';
END $$;

-- Journal : chaîne continue, modification interdite, altération détectée
DO $$
DECLARE r uuid := gen_random_uuid(); n int;
BEGIN
  INSERT INTO history.events (id, occurred_at, room_id, type, version, actor_role,
                              aggregate_type, aggregate_id, payload, correlation_id)
  SELECT gen_random_uuid(), now(), r, 'character.hp_changed', 1, 'gm', 'character', 'c1',
         jsonb_build_object('hp', g), 'corr' FROM generate_series(1, 10) g;
  SELECT count(*) INTO n FROM history.verify_chain(r);
  IF n <> 0 THEN RAISE EXCEPTION 'chaîne cassée dès l''insertion (%)', n; END IF;
  BEGIN
    UPDATE history.events SET payload = '{}' WHERE room_id = r AND seq = 3;
    RAISE EXCEPTION 'UPDATE aurait dû être refusé';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ajout seul%' THEN RAISE; END IF;
  END;
  ALTER TABLE history.events_test DISABLE TRIGGER USER;
  UPDATE history.events_test SET payload = '{"hp":999}' WHERE room_id = r AND seq = 3;
  ALTER TABLE history.events_test ENABLE TRIGGER USER;
  SELECT count(*) INTO n FROM history.verify_chain(r);
  IF n = 0 THEN RAISE EXCEPTION 'altération non détectée'; END IF;
  RAISE NOTICE 'historique OK';
END $$;
