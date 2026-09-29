--liquibase formatted sql

-- Calques du MJ (docs/carte.md § 5 et § 12, point 12) : chaque carte a une pile ordonnée de
-- calques ; tokens et objets appartiennent à un calque (layer_id) et y ont un ordre z (réel),
-- dessins et textes aussi, ou aucun (annotation au-dessus de l'ombre). Les droits DML de
-- campaign_svc et EXECUTE sur les fonctions viennent des privilèges par défaut.
--
-- Invariants tenus par la base, quel que soit l'écrivain (service, import) :
--  - une carte naît avec « Sol » (ground), « Objets » (objects) et « Personnages » (tokens) ;
--  - un token ou un objet inséré sans calque va dans le calque de son rôle (objet
--    is_background : Sol), sinon le plus haut ; sans z, en haut de son calque.

--changeset campaign:0018-map-layers
--comment: Calques du MJ : nom, ordre, visibles des joueurs, verrouillés, opacité, rôle par défaut.
CREATE TABLE map_layers (
  id                 uuid             PRIMARY KEY,
  campaign_id        uuid             NOT NULL,
  map_id             uuid             NOT NULL,
  name               text             NOT NULL,
  sort_order         double precision NOT NULL DEFAULT 0,  -- du bas (petit) vers le haut
  visible_to_players boolean          NOT NULL DEFAULT true,
  locked             boolean          NOT NULL DEFAULT false,
  opacity            real             NOT NULL DEFAULT 1,
  role               text,                                  -- calque par défaut d'une sorte
  version            int              NOT NULL DEFAULT 1,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT map_layers_map FOREIGN KEY (map_id, campaign_id)
    REFERENCES maps (id, campaign_id) ON DELETE CASCADE,
  CONSTRAINT map_layers_id_map UNIQUE (id, map_id),
  CONSTRAINT map_layers_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT map_layers_opacity CHECK (opacity BETWEEN 0 AND 1),
  CONSTRAINT map_layers_role CHECK (role IN ('ground', 'objects', 'tokens')),
  CONSTRAINT map_layers_version_positive CHECK (version >= 1)
);
CREATE INDEX map_layers_map ON map_layers (map_id, sort_order);
CREATE UNIQUE INDEX map_layers_map_role ON map_layers (map_id, role) WHERE role IS NOT NULL;
--rollback DROP TABLE map_layers;

--changeset campaign:0018-map-layers-content
--comment: layer_id et z sur tokens, objets, dessins et textes (même carte que le calque) ; z_index (0017, jamais utilisé) retiré.
ALTER TABLE map_tokens ADD COLUMN layer_id uuid;
ALTER TABLE map_tokens ADD COLUMN z double precision;
ALTER TABLE map_objects ADD COLUMN layer_id uuid;
ALTER TABLE map_objects ADD COLUMN z double precision;
ALTER TABLE map_drawings ADD COLUMN layer_id uuid;
ALTER TABLE map_drawings ADD COLUMN z double precision;
ALTER TABLE map_notes ADD COLUMN layer_id uuid;
ALTER TABLE map_notes ADD COLUMN z double precision;
ALTER TABLE map_tokens ADD CONSTRAINT map_tokens_layer
  FOREIGN KEY (layer_id, map_id) REFERENCES map_layers (id, map_id);
ALTER TABLE map_objects ADD CONSTRAINT map_objects_layer
  FOREIGN KEY (layer_id, map_id) REFERENCES map_layers (id, map_id);
ALTER TABLE map_drawings ADD CONSTRAINT map_drawings_layer
  FOREIGN KEY (layer_id, map_id) REFERENCES map_layers (id, map_id);
ALTER TABLE map_notes ADD CONSTRAINT map_notes_layer
  FOREIGN KEY (layer_id, map_id) REFERENCES map_layers (id, map_id);
CREATE INDEX map_tokens_layer ON map_tokens (layer_id, z);
CREATE INDEX map_objects_layer ON map_objects (layer_id, z);
CREATE INDEX map_drawings_layer ON map_drawings (layer_id, z) WHERE layer_id IS NOT NULL;
CREATE INDEX map_notes_layer ON map_notes (layer_id, z) WHERE layer_id IS NOT NULL;
ALTER TABLE map_objects DROP CONSTRAINT map_objects_search_radius;
ALTER TABLE map_objects DROP COLUMN z_index;
ALTER TABLE map_objects
  ADD CONSTRAINT map_objects_search_radius CHECK (search_radius BETWEEN 0 AND 10000);
--rollback ALTER TABLE map_objects ADD COLUMN z_index int NOT NULL DEFAULT 0;
--rollback DROP INDEX map_notes_layer;
--rollback DROP INDEX map_drawings_layer;
--rollback DROP INDEX map_objects_layer;
--rollback DROP INDEX map_tokens_layer;
--rollback ALTER TABLE map_notes DROP COLUMN z;
--rollback ALTER TABLE map_notes DROP COLUMN layer_id;
--rollback ALTER TABLE map_drawings DROP COLUMN z;
--rollback ALTER TABLE map_drawings DROP COLUMN layer_id;
--rollback ALTER TABLE map_objects DROP COLUMN z;
--rollback ALTER TABLE map_objects DROP COLUMN layer_id;
--rollback ALTER TABLE map_tokens DROP COLUMN z;
--rollback ALTER TABLE map_tokens DROP COLUMN layer_id;

--changeset campaign:0018-map-layers-migrate
--comment: Trois calques par carte existante ; objets is_background → Sol, autres objets → Objets, tokens → Personnages ; z dans l'ordre de création.
INSERT INTO map_layers (id, campaign_id, map_id, name, sort_order, role)
SELECT gen_random_uuid(), m.campaign_id, m.id, l.name, l.sort_order, l.role
  FROM maps m
 CROSS JOIN (VALUES ('Sol', 0, 'ground'), ('Objets', 1, 'objects'), ('Personnages', 2, 'tokens'))
       AS l (name, sort_order, role);
UPDATE map_objects o SET layer_id = l.id
  FROM map_layers l
 WHERE l.map_id = o.map_id AND l.role = CASE WHEN o.is_background THEN 'ground' ELSE 'objects' END;
UPDATE map_tokens t SET layer_id = l.id
  FROM map_layers l
 WHERE l.map_id = t.map_id AND l.role = 'tokens';
UPDATE map_objects o SET z = s.n
  FROM (SELECT id, row_number() OVER (PARTITION BY layer_id ORDER BY created_at, id) AS n
          FROM map_objects) s
 WHERE s.id = o.id;
UPDATE map_tokens t SET z = s.n
  FROM (SELECT id, row_number() OVER (PARTITION BY layer_id ORDER BY created_at, id) AS n
          FROM map_tokens) s
 WHERE s.id = t.id;
UPDATE map_drawings d SET z = s.n
  FROM (SELECT id, row_number() OVER (PARTITION BY map_id ORDER BY created_at, id) AS n
          FROM map_drawings) s
 WHERE s.id = d.id;
UPDATE map_notes x SET z = s.n
  FROM (SELECT id, row_number() OVER (PARTITION BY map_id ORDER BY created_at, id) AS n
          FROM map_notes) s
 WHERE s.id = x.id;
ALTER TABLE map_tokens ALTER COLUMN layer_id SET NOT NULL;
ALTER TABLE map_tokens ALTER COLUMN z SET NOT NULL;
ALTER TABLE map_objects ALTER COLUMN layer_id SET NOT NULL;
ALTER TABLE map_objects ALTER COLUMN z SET NOT NULL;
ALTER TABLE map_drawings ALTER COLUMN z SET NOT NULL;
ALTER TABLE map_notes ALTER COLUMN z SET NOT NULL;
--rollback ALTER TABLE map_notes ALTER COLUMN z DROP NOT NULL;
--rollback ALTER TABLE map_drawings ALTER COLUMN z DROP NOT NULL;
--rollback ALTER TABLE map_objects ALTER COLUMN z DROP NOT NULL;
--rollback ALTER TABLE map_objects ALTER COLUMN layer_id DROP NOT NULL;
--rollback ALTER TABLE map_tokens ALTER COLUMN z DROP NOT NULL;
--rollback ALTER TABLE map_tokens ALTER COLUMN layer_id DROP NOT NULL;
--rollback UPDATE map_tokens SET layer_id = NULL, z = NULL;
--rollback UPDATE map_objects SET layer_id = NULL, z = NULL;
--rollback UPDATE map_drawings SET layer_id = NULL, z = NULL;
--rollback UPDATE map_notes SET layer_id = NULL, z = NULL;
--rollback DELETE FROM map_layers;

--changeset campaign:0018-map-layers-triggers splitStatements:false
--comment: Calques d'une nouvelle carte, calque et z par défaut d'un élément inséré sans eux.
-- Haut d'un calque : plus grand z de tout ce qu'il contient, toutes sortes confondues.
CREATE FUNCTION campaign.map_layer_top_z(layer uuid) RETURNS double precision
LANGUAGE sql STABLE SET search_path = campaign, public AS $$
  SELECT coalesce(max(z), 0) FROM (
    SELECT max(z) AS z FROM campaign.map_tokens WHERE layer_id = layer
    UNION ALL SELECT max(z) FROM campaign.map_objects WHERE layer_id = layer
    UNION ALL SELECT max(z) FROM campaign.map_drawings WHERE layer_id = layer
    UNION ALL SELECT max(z) FROM campaign.map_notes WHERE layer_id = layer
  ) AS tops
$$;

-- Calque d'un rôle sur une carte ; sans calque de ce rôle, le plus haut.
CREATE FUNCTION campaign.map_default_layer(map uuid, wanted text) RETURNS uuid
LANGUAGE sql STABLE SET search_path = campaign, public AS $$
  SELECT id FROM campaign.map_layers
   WHERE map_id = map
   ORDER BY (role IS NOT DISTINCT FROM wanted) DESC, sort_order DESC, id DESC
   LIMIT 1
$$;

CREATE FUNCTION campaign.map_default_layers() RETURNS trigger
LANGUAGE plpgsql SET search_path = campaign, public AS $$
BEGIN
  INSERT INTO campaign.map_layers (id, campaign_id, map_id, name, sort_order, role) VALUES
    (gen_random_uuid(), NEW.campaign_id, NEW.id, 'Sol', 0, 'ground'),
    (gen_random_uuid(), NEW.campaign_id, NEW.id, 'Objets', 1, 'objects'),
    (gen_random_uuid(), NEW.campaign_id, NEW.id, 'Personnages', 2, 'tokens');
  RETURN NULL;
END
$$;

CREATE FUNCTION campaign.map_token_layer() RETURNS trigger
LANGUAGE plpgsql SET search_path = campaign, public AS $$
BEGIN
  IF NEW.layer_id IS NULL THEN
    NEW.layer_id := campaign.map_default_layer(NEW.map_id, 'tokens');
  END IF;
  IF NEW.z IS NULL THEN
    NEW.z := campaign.map_layer_top_z(NEW.layer_id) + 1;
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION campaign.map_object_layer() RETURNS trigger
LANGUAGE plpgsql SET search_path = campaign, public AS $$
BEGIN
  IF NEW.layer_id IS NULL THEN
    NEW.layer_id := campaign.map_default_layer(
      NEW.map_id, CASE WHEN NEW.is_background THEN 'ground' ELSE 'objects' END);
  END IF;
  IF NEW.z IS NULL THEN
    NEW.z := campaign.map_layer_top_z(NEW.layer_id) + 1;
  END IF;
  RETURN NEW;
END
$$;

-- Dessins et textes : sans calque, ce sont des annotations, ordonnées entre elles par carte.
CREATE FUNCTION campaign.map_annotation_z() RETURNS trigger
LANGUAGE plpgsql SET search_path = campaign, public AS $$
BEGIN
  IF NEW.z IS NULL THEN
    IF NEW.layer_id IS NOT NULL THEN
      NEW.z := campaign.map_layer_top_z(NEW.layer_id) + 1;
    ELSIF TG_TABLE_NAME = 'map_drawings' THEN
      NEW.z := coalesce((SELECT max(z) FROM campaign.map_drawings
                          WHERE map_id = NEW.map_id AND layer_id IS NULL), 0) + 1;
    ELSE
      NEW.z := coalesce((SELECT max(z) FROM campaign.map_notes
                          WHERE map_id = NEW.map_id AND layer_id IS NULL), 0) + 1;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER maps_default_layers AFTER INSERT ON campaign.maps
  FOR EACH ROW EXECUTE FUNCTION campaign.map_default_layers();
CREATE TRIGGER map_tokens_layer BEFORE INSERT ON campaign.map_tokens
  FOR EACH ROW EXECUTE FUNCTION campaign.map_token_layer();
CREATE TRIGGER map_objects_layer BEFORE INSERT ON campaign.map_objects
  FOR EACH ROW EXECUTE FUNCTION campaign.map_object_layer();
CREATE TRIGGER map_drawings_z BEFORE INSERT ON campaign.map_drawings
  FOR EACH ROW EXECUTE FUNCTION campaign.map_annotation_z();
CREATE TRIGGER map_notes_z BEFORE INSERT ON campaign.map_notes
  FOR EACH ROW EXECUTE FUNCTION campaign.map_annotation_z();
--rollback DROP TRIGGER map_notes_z ON campaign.map_notes;
--rollback DROP TRIGGER map_drawings_z ON campaign.map_drawings;
--rollback DROP TRIGGER map_objects_layer ON campaign.map_objects;
--rollback DROP TRIGGER map_tokens_layer ON campaign.map_tokens;
--rollback DROP TRIGGER maps_default_layers ON campaign.maps;
--rollback DROP FUNCTION campaign.map_annotation_z();
--rollback DROP FUNCTION campaign.map_object_layer();
--rollback DROP FUNCTION campaign.map_token_layer();
--rollback DROP FUNCTION campaign.map_default_layers();
--rollback DROP FUNCTION campaign.map_default_layer(uuid, text);
--rollback DROP FUNCTION campaign.map_layer_top_z(uuid);
