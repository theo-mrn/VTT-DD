--liquibase formatted sql

--changeset history:0002-erasure splitStatements:false runOnChange:true
--comment: Effacement (docs/legal.md) : seule exception à l'ajout seul. Deux fonctions SECURITY DEFINER du propriétaire, seules à lever l'immuabilité (réglage history.erasure local à la transaction) : erase_campaign supprime la chaîne d'une campagne supprimée et sa tête ; erase_user supprime les événements sans campagne d'un compte supprimé, remplace son pseudo dans ses événements de campagne et recalcule ces chaînes (verify_chain reste vraie). Le rôle du service n'a toujours ni UPDATE ni DELETE sur events.
CREATE OR REPLACE FUNCTION events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Ouvert seulement pendant erase_campaign / erase_user (réglage local à leur transaction)
  IF TG_OP IN ('UPDATE', 'DELETE') AND current_setting('history.erasure', true) = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'history.events est en ajout seul (% refusé)', TG_OP;
END $$;

-- Campagne supprimée : toute sa chaîne et sa tête. Renvoie le nombre d'événements effacés.
CREATE OR REPLACE FUNCTION erase_campaign(p_campaign uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = history, pg_catalog, pg_temp
AS $$
DECLARE
  n bigint;
BEGIN
  PERFORM 1 FROM campaign_heads WHERE campaign_id = p_campaign FOR UPDATE;
  PERFORM set_config('history.erasure', 'on', true);
  DELETE FROM events WHERE campaign_id = p_campaign;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM campaign_heads WHERE campaign_id = p_campaign;
  PERFORM set_config('history.erasure', 'off', true);
  RETURN n;
END $$;

-- Compte supprimé : ses événements sans campagne (compte, profil, sécurité) supprimés ; dans les
-- campagnes, son pseudo recopié (payload.userName) devient « Joueur supprimé » et chaque chaîne
-- touchée est recalculée à partir du premier événement modifié, tête comprise. Renvoie le nombre
-- d'événements effacés ou modifiés.
CREATE OR REPLACE FUNCTION erase_user(p_user uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = history, pg_catalog, pg_temp
AS $$
DECLARE
  deleted bigint;
  redacted bigint := 0;
  campaigns uuid[];
  froms bigint[];
  i int;
  r record;
  prev bytea;
  h bytea;
BEGIN
  -- Campagnes où il apparaît sous son pseudo, et premier rang concerné de chacune
  SELECT coalesce(array_agg(t.campaign_id ORDER BY t.campaign_id), '{}'),
         coalesce(array_agg(t.from_seq ORDER BY t.campaign_id), '{}')
  INTO campaigns, froms
  FROM (
    SELECT e.campaign_id, min(e.seq) AS from_seq
    FROM events e
    WHERE e.campaign_id IS NOT NULL
      AND e.payload->>'userName' IS DISTINCT FROM 'Joueur supprimé'
      AND e.payload ? 'userName'
      AND (e.actor_id = p_user OR e.payload->>'authorId' = p_user::text)
    GROUP BY e.campaign_id
  ) t;

  -- Les ajouts de ces campagnes attendent (même verrou que l'ajout au journal)
  PERFORM 1 FROM campaign_heads h2
  WHERE h2.campaign_id = ANY (campaigns)
  ORDER BY h2.campaign_id FOR UPDATE;

  PERFORM set_config('history.erasure', 'on', true);

  DELETE FROM events
  WHERE campaign_id IS NULL
    AND (actor_id = p_user OR (aggregate_type = 'user' AND aggregate_id = p_user::text));
  GET DIAGNOSTICS deleted = ROW_COUNT;

  FOR i IN 1 .. coalesce(array_length(campaigns, 1), 0) LOOP
    UPDATE events
    SET payload = jsonb_set(payload, '{userName}', to_jsonb('Joueur supprimé'::text))
    WHERE campaign_id = campaigns[i]
      AND payload ? 'userName'
      AND payload->>'userName' IS DISTINCT FROM 'Joueur supprimé'
      AND (actor_id = p_user OR payload->>'authorId' = p_user::text);

    prev := NULL;
    SELECT e.hash INTO prev FROM events e
    WHERE e.campaign_id = campaigns[i] AND e.seq = froms[i] - 1;

    FOR r IN
      SELECT * FROM events e
      WHERE e.campaign_id = campaigns[i] AND e.seq >= froms[i]
      ORDER BY e.seq, e.occurred_at, e.id
    LOOP
      h := event_hash(prev, event_canonical(
        r.id, r.occurred_at, r.campaign_id, r.seq, r.type, r.version, r.actor_id,
        r.actor_role, r.actor_character_id, r.aggregate_type, r.aggregate_id,
        r.visibility, r.payload, r.correlation_id, r.causation_id, r.traceparent));
      UPDATE events SET prev_hash = prev, hash = h
      WHERE id = r.id AND occurred_at = r.occurred_at;
      prev := h;
      redacted := redacted + 1;
    END LOOP;

    UPDATE campaign_heads SET last_hash = prev, updated_at = now()
    WHERE campaign_id = campaigns[i];
  END LOOP;

  PERFORM set_config('history.erasure', 'off', true);
  RETURN deleted + redacted;
END $$;

REVOKE ALL ON FUNCTION erase_campaign(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erase_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erase_campaign(uuid) TO history_svc;
GRANT EXECUTE ON FUNCTION erase_user(uuid) TO history_svc;
--rollback DROP FUNCTION erase_user(uuid);
--rollback DROP FUNCTION erase_campaign(uuid);
--rollback CREATE OR REPLACE FUNCTION events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history.events est en ajout seul (% refusé)', TG_OP; END $$;
