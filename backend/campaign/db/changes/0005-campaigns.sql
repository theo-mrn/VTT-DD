--liquibase formatted sql

-- Les « salles » deviennent des « campagnes », et tout le schéma passe en anglais :
-- tables, colonnes, contraintes, index, et valeurs des rôles, camps et modes de combat.
-- Les droits (GRANT, privilèges par défaut) suivent les tables renommées.

--changeset campaign:0005-campaigns
--comment: rooms -> campaigns (nom -> name, max_joueurs -> max_players, publique -> is_public, creation_personnages -> character_creation).
ALTER TABLE rooms RENAME TO campaigns;
ALTER TABLE campaigns RENAME COLUMN nom TO name;
ALTER TABLE campaigns RENAME COLUMN max_joueurs TO max_players;
ALTER TABLE campaigns RENAME COLUMN publique TO is_public;
ALTER TABLE campaigns RENAME COLUMN creation_personnages TO character_creation;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_pkey TO campaigns_pkey;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_nom_longueur TO campaigns_name_length;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_description_longueur TO campaigns_description_length;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_version_positive TO campaigns_version_positive;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_code_forme TO campaigns_code_format;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_code_unique TO campaigns_code_unique;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_max_joueurs TO campaigns_max_players;
ALTER TABLE campaigns RENAME CONSTRAINT rooms_image_url_longueur TO campaigns_image_url_length;
ALTER INDEX rooms_publiques RENAME TO campaigns_public;
--rollback ALTER INDEX campaigns_public RENAME TO rooms_publiques;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_image_url_length TO rooms_image_url_longueur;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_max_players TO rooms_max_joueurs;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_code_unique TO rooms_code_unique;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_code_format TO rooms_code_forme;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_version_positive TO rooms_version_positive;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_description_length TO rooms_description_longueur;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_name_length TO rooms_nom_longueur;
--rollback ALTER TABLE campaigns RENAME CONSTRAINT campaigns_pkey TO rooms_pkey;
--rollback ALTER TABLE campaigns RENAME COLUMN character_creation TO creation_personnages;
--rollback ALTER TABLE campaigns RENAME COLUMN is_public TO publique;
--rollback ALTER TABLE campaigns RENAME COLUMN max_players TO max_joueurs;
--rollback ALTER TABLE campaigns RENAME COLUMN name TO nom;
--rollback ALTER TABLE campaigns RENAME TO rooms;

--changeset campaign:0005-campaign-members
--comment: room_members -> campaign_members ; rôles mj/joueur/spectateur -> gm/player/spectator.
ALTER TABLE room_members RENAME TO campaign_members;
ALTER TABLE campaign_members RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_members RENAME CONSTRAINT room_members_pkey TO campaign_members_pkey;
ALTER TABLE campaign_members RENAME CONSTRAINT room_members_room_id_fkey TO campaign_members_campaign_id_fkey;
ALTER INDEX room_members_user RENAME TO campaign_members_user;
ALTER TABLE campaign_members DROP CONSTRAINT room_members_role;
UPDATE campaign_members SET role = CASE role
  WHEN 'mj' THEN 'gm' WHEN 'joueur' THEN 'player' WHEN 'spectateur' THEN 'spectator' ELSE role END;
ALTER TABLE campaign_members
  ADD CONSTRAINT campaign_members_role CHECK (role IN ('gm', 'player', 'spectator'));
--rollback ALTER TABLE campaign_members DROP CONSTRAINT campaign_members_role;
--rollback UPDATE campaign_members SET role = CASE role WHEN 'gm' THEN 'mj' WHEN 'player' THEN 'joueur' WHEN 'spectator' THEN 'spectateur' ELSE role END;
--rollback ALTER TABLE campaign_members ADD CONSTRAINT room_members_role CHECK (role IN ('mj', 'joueur', 'spectateur'));
--rollback ALTER INDEX campaign_members_user RENAME TO room_members_user;
--rollback ALTER TABLE campaign_members RENAME CONSTRAINT campaign_members_campaign_id_fkey TO room_members_room_id_fkey;
--rollback ALTER TABLE campaign_members RENAME CONSTRAINT campaign_members_pkey TO room_members_pkey;
--rollback ALTER TABLE campaign_members RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_members RENAME TO room_members;

--changeset campaign:0005-campaign-invitations
--comment: invitations -> campaign_invitations (cree_par -> created_by, expire_le -> expires_at, utilisations(_max) -> (max_)uses).
ALTER TABLE invitations RENAME TO campaign_invitations;
ALTER TABLE campaign_invitations RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_invitations RENAME COLUMN cree_par TO created_by;
ALTER TABLE campaign_invitations RENAME COLUMN expire_le TO expires_at;
ALTER TABLE campaign_invitations RENAME COLUMN utilisations_max TO max_uses;
ALTER TABLE campaign_invitations RENAME COLUMN utilisations TO uses;
ALTER TABLE campaign_invitations RENAME CONSTRAINT invitations_pkey TO campaign_invitations_pkey;
ALTER TABLE campaign_invitations RENAME CONSTRAINT invitations_code_hash_key TO campaign_invitations_code_hash_key;
ALTER TABLE campaign_invitations RENAME CONSTRAINT invitations_code_hash TO campaign_invitations_code_hash;
ALTER TABLE campaign_invitations RENAME CONSTRAINT invitations_utilisations TO campaign_invitations_uses;
ALTER TABLE campaign_invitations RENAME CONSTRAINT invitations_room_id_fkey TO campaign_invitations_campaign_id_fkey;
ALTER INDEX invitations_room RENAME TO campaign_invitations_campaign;
--rollback ALTER INDEX campaign_invitations_campaign RENAME TO invitations_room;
--rollback ALTER TABLE campaign_invitations RENAME CONSTRAINT campaign_invitations_campaign_id_fkey TO invitations_room_id_fkey;
--rollback ALTER TABLE campaign_invitations RENAME CONSTRAINT campaign_invitations_uses TO invitations_utilisations;
--rollback ALTER TABLE campaign_invitations RENAME CONSTRAINT campaign_invitations_code_hash TO invitations_code_hash;
--rollback ALTER TABLE campaign_invitations RENAME CONSTRAINT campaign_invitations_code_hash_key TO invitations_code_hash_key;
--rollback ALTER TABLE campaign_invitations RENAME CONSTRAINT campaign_invitations_pkey TO invitations_pkey;
--rollback ALTER TABLE campaign_invitations RENAME COLUMN uses TO utilisations;
--rollback ALTER TABLE campaign_invitations RENAME COLUMN max_uses TO utilisations_max;
--rollback ALTER TABLE campaign_invitations RENAME COLUMN expires_at TO expire_le;
--rollback ALTER TABLE campaign_invitations RENAME COLUMN created_by TO cree_par;
--rollback ALTER TABLE campaign_invitations RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_invitations RENAME TO invitations;

--changeset campaign:0005-campaign-characters
--comment: room_characters -> campaign_characters (camp -> side, ajoute_par/le -> added_by/at, incarne_par -> played_by) ; camps joueurs/adversaires/allies -> players/enemies/allies.
ALTER TABLE room_characters RENAME TO campaign_characters;
ALTER TABLE campaign_characters RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_characters RENAME COLUMN camp TO side;
ALTER TABLE campaign_characters RENAME COLUMN ajoute_par TO added_by;
ALTER TABLE campaign_characters RENAME COLUMN ajoute_le TO added_at;
ALTER TABLE campaign_characters RENAME COLUMN incarne_par TO played_by;
ALTER TABLE campaign_characters RENAME CONSTRAINT room_characters_pkey TO campaign_characters_pkey;
ALTER TABLE campaign_characters RENAME CONSTRAINT room_characters_room_id_fkey TO campaign_characters_campaign_id_fkey;
ALTER TABLE campaign_characters RENAME CONSTRAINT room_characters_incarne_par TO campaign_characters_played_by;
ALTER TABLE campaign_characters RENAME CONSTRAINT room_characters_incarne_par_membre TO campaign_characters_played_by_member;
ALTER INDEX room_characters_character RENAME TO campaign_characters_character;
ALTER TABLE campaign_characters DROP CONSTRAINT room_characters_camp;
UPDATE campaign_characters SET side = CASE side
  WHEN 'joueurs' THEN 'players' WHEN 'adversaires' THEN 'enemies' ELSE side END;
ALTER TABLE campaign_characters
  ADD CONSTRAINT campaign_characters_side CHECK (side IN ('players', 'enemies', 'allies'));
--rollback ALTER TABLE campaign_characters DROP CONSTRAINT campaign_characters_side;
--rollback UPDATE campaign_characters SET side = CASE side WHEN 'players' THEN 'joueurs' WHEN 'enemies' THEN 'adversaires' ELSE side END;
--rollback ALTER TABLE campaign_characters ADD CONSTRAINT room_characters_camp CHECK (side IN ('joueurs', 'adversaires', 'allies'));
--rollback ALTER INDEX campaign_characters_character RENAME TO room_characters_character;
--rollback ALTER TABLE campaign_characters RENAME CONSTRAINT campaign_characters_played_by_member TO room_characters_incarne_par_membre;
--rollback ALTER TABLE campaign_characters RENAME CONSTRAINT campaign_characters_played_by TO room_characters_incarne_par;
--rollback ALTER TABLE campaign_characters RENAME CONSTRAINT campaign_characters_campaign_id_fkey TO room_characters_room_id_fkey;
--rollback ALTER TABLE campaign_characters RENAME CONSTRAINT campaign_characters_pkey TO room_characters_pkey;
--rollback ALTER TABLE campaign_characters RENAME COLUMN played_by TO incarne_par;
--rollback ALTER TABLE campaign_characters RENAME COLUMN added_at TO ajoute_le;
--rollback ALTER TABLE campaign_characters RENAME COLUMN added_by TO ajoute_par;
--rollback ALTER TABLE campaign_characters RENAME COLUMN side TO camp;
--rollback ALTER TABLE campaign_characters RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_characters RENAME TO room_characters;

--changeset campaign:0005-legacy-ids
--comment: legacy_ids.room_id -> campaign_id (le nom de table reste celui des autres services).
ALTER TABLE legacy_ids RENAME COLUMN room_id TO campaign_id;
ALTER TABLE legacy_ids RENAME CONSTRAINT legacy_ids_room_id_fkey TO legacy_ids_campaign_id_fkey;
ALTER INDEX legacy_ids_room RENAME TO legacy_ids_campaign;
--rollback ALTER INDEX legacy_ids_campaign RENAME TO legacy_ids_room;
--rollback ALTER TABLE legacy_ids RENAME CONSTRAINT legacy_ids_campaign_id_fkey TO legacy_ids_room_id_fkey;
--rollback ALTER TABLE legacy_ids RENAME COLUMN campaign_id TO room_id;

--changeset campaign:0005-campaign-combats
--comment: combats -> campaign_combats (courant -> current_index, creneaux -> slots, initiative -> initiative_rolled, demarre_par -> started_by) ; modes individuel/creneaux -> individual/slots.
ALTER TABLE combats RENAME TO campaign_combats;
ALTER TABLE campaign_combats RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_combats RENAME COLUMN courant TO current_index;
ALTER TABLE campaign_combats RENAME COLUMN creneaux TO slots;
ALTER TABLE campaign_combats RENAME COLUMN initiative TO initiative_rolled;
ALTER TABLE campaign_combats RENAME COLUMN demarre_par TO started_by;
ALTER TABLE campaign_combats RENAME CONSTRAINT combats_pkey TO campaign_combats_pkey;
ALTER TABLE campaign_combats RENAME CONSTRAINT combats_id_key TO campaign_combats_id_key;
ALTER TABLE campaign_combats RENAME CONSTRAINT combats_room_id_fkey TO campaign_combats_campaign_id_fkey;
ALTER TABLE campaign_combats RENAME CONSTRAINT combats_round TO campaign_combats_round;
ALTER TABLE campaign_combats RENAME CONSTRAINT combats_courant TO campaign_combats_current_index;
ALTER TABLE campaign_combats RENAME CONSTRAINT combats_version_positive TO campaign_combats_version_positive;
ALTER TABLE campaign_combats DROP CONSTRAINT combats_mode;
ALTER TABLE campaign_combats DROP CONSTRAINT combats_creneaux;
UPDATE campaign_combats SET mode = CASE mode
  WHEN 'individuel' THEN 'individual' WHEN 'creneaux' THEN 'slots' ELSE mode END;
UPDATE campaign_combats SET slots = (
  SELECT coalesce(jsonb_agg(CASE v WHEN 'joueurs' THEN 'players' WHEN 'adversaires' THEN 'enemies' ELSE v END ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements_text(slots) WITH ORDINALITY AS t (v, i)
) WHERE jsonb_typeof(slots) = 'array';
ALTER TABLE campaign_combats
  ADD CONSTRAINT campaign_combats_mode CHECK (mode IN ('individual', 'slots')),
  ADD CONSTRAINT campaign_combats_slots CHECK (
    (mode = 'individual' AND slots IS NULL)
    OR (mode = 'slots' AND jsonb_typeof(slots) = 'array')
  );
--rollback ALTER TABLE campaign_combats DROP CONSTRAINT campaign_combats_slots, DROP CONSTRAINT campaign_combats_mode;
--rollback UPDATE campaign_combats SET slots = (SELECT coalesce(jsonb_agg(CASE v WHEN 'players' THEN 'joueurs' WHEN 'enemies' THEN 'adversaires' ELSE v END ORDER BY i), '[]'::jsonb) FROM jsonb_array_elements_text(slots) WITH ORDINALITY AS t (v, i)) WHERE jsonb_typeof(slots) = 'array';
--rollback UPDATE campaign_combats SET mode = CASE mode WHEN 'individual' THEN 'individuel' WHEN 'slots' THEN 'creneaux' ELSE mode END;
--rollback ALTER TABLE campaign_combats ADD CONSTRAINT combats_mode CHECK (mode IN ('individuel', 'creneaux')), ADD CONSTRAINT combats_creneaux CHECK ((mode = 'individuel' AND slots IS NULL) OR (mode = 'creneaux' AND jsonb_typeof(slots) = 'array'));
--rollback ALTER TABLE campaign_combats RENAME CONSTRAINT campaign_combats_version_positive TO combats_version_positive;
--rollback ALTER TABLE campaign_combats RENAME CONSTRAINT campaign_combats_current_index TO combats_courant;
--rollback ALTER TABLE campaign_combats RENAME CONSTRAINT campaign_combats_round TO combats_round;
--rollback ALTER TABLE campaign_combats RENAME CONSTRAINT campaign_combats_campaign_id_fkey TO combats_room_id_fkey;
--rollback ALTER TABLE campaign_combats RENAME CONSTRAINT campaign_combats_id_key TO combats_id_key;
--rollback ALTER TABLE campaign_combats RENAME CONSTRAINT campaign_combats_pkey TO combats_pkey;
--rollback ALTER TABLE campaign_combats RENAME COLUMN started_by TO demarre_par;
--rollback ALTER TABLE campaign_combats RENAME COLUMN initiative_rolled TO initiative;
--rollback ALTER TABLE campaign_combats RENAME COLUMN slots TO creneaux;
--rollback ALTER TABLE campaign_combats RENAME COLUMN current_index TO courant;
--rollback ALTER TABLE campaign_combats RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_combats RENAME TO combats;

--changeset campaign:0005-campaign-combat-participants
--comment: combat_participants -> campaign_combat_participants (rang -> turn_order, camp -> side, cles -> sort_keys, a_agi -> has_acted).
ALTER TABLE combat_participants RENAME TO campaign_combat_participants;
ALTER TABLE campaign_combat_participants RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_combat_participants RENAME COLUMN rang TO turn_order;
ALTER TABLE campaign_combat_participants RENAME COLUMN camp TO side;
ALTER TABLE campaign_combat_participants RENAME COLUMN cles TO sort_keys;
ALTER TABLE campaign_combat_participants RENAME COLUMN a_agi TO has_acted;
ALTER TABLE campaign_combat_participants RENAME CONSTRAINT combat_participants_pkey TO campaign_combat_participants_pkey;
ALTER TABLE campaign_combat_participants RENAME CONSTRAINT combat_participants_rang TO campaign_combat_participants_turn_order;
ALTER TABLE campaign_combat_participants RENAME CONSTRAINT combat_participants_cles TO campaign_combat_participants_sort_keys;
ALTER TABLE campaign_combat_participants RENAME CONSTRAINT combat_participants_room_id_fkey TO campaign_combat_participants_campaign_id_fkey;
ALTER TABLE campaign_combat_participants RENAME CONSTRAINT combat_participants_room_id_character_id_fkey TO campaign_combat_participants_character_fkey;
ALTER TABLE campaign_combat_participants DROP CONSTRAINT combat_participants_camp;
UPDATE campaign_combat_participants SET side = CASE side
  WHEN 'joueurs' THEN 'players' WHEN 'adversaires' THEN 'enemies' ELSE side END;
ALTER TABLE campaign_combat_participants
  ADD CONSTRAINT campaign_combat_participants_side CHECK (side IN ('players', 'enemies', 'allies'));
--rollback ALTER TABLE campaign_combat_participants DROP CONSTRAINT campaign_combat_participants_side;
--rollback UPDATE campaign_combat_participants SET side = CASE side WHEN 'players' THEN 'joueurs' WHEN 'enemies' THEN 'adversaires' ELSE side END;
--rollback ALTER TABLE campaign_combat_participants ADD CONSTRAINT combat_participants_camp CHECK (side IN ('joueurs', 'adversaires', 'allies'));
--rollback ALTER TABLE campaign_combat_participants RENAME CONSTRAINT campaign_combat_participants_character_fkey TO combat_participants_room_id_character_id_fkey;
--rollback ALTER TABLE campaign_combat_participants RENAME CONSTRAINT campaign_combat_participants_campaign_id_fkey TO combat_participants_room_id_fkey;
--rollback ALTER TABLE campaign_combat_participants RENAME CONSTRAINT campaign_combat_participants_sort_keys TO combat_participants_cles;
--rollback ALTER TABLE campaign_combat_participants RENAME CONSTRAINT campaign_combat_participants_turn_order TO combat_participants_rang;
--rollback ALTER TABLE campaign_combat_participants RENAME CONSTRAINT campaign_combat_participants_pkey TO combat_participants_pkey;
--rollback ALTER TABLE campaign_combat_participants RENAME COLUMN has_acted TO a_agi;
--rollback ALTER TABLE campaign_combat_participants RENAME COLUMN sort_keys TO cles;
--rollback ALTER TABLE campaign_combat_participants RENAME COLUMN side TO camp;
--rollback ALTER TABLE campaign_combat_participants RENAME COLUMN turn_order TO rang;
--rollback ALTER TABLE campaign_combat_participants RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_combat_participants RENAME TO combat_participants;

--changeset campaign:0005-campaign-bans
--comment: room_bans -> campaign_bans (banni_par/le -> banned_by/at).
ALTER TABLE room_bans RENAME TO campaign_bans;
ALTER TABLE campaign_bans RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_bans RENAME COLUMN banni_par TO banned_by;
ALTER TABLE campaign_bans RENAME COLUMN banni_le TO banned_at;
ALTER TABLE campaign_bans RENAME CONSTRAINT room_bans_pkey TO campaign_bans_pkey;
ALTER TABLE campaign_bans RENAME CONSTRAINT room_bans_room_id_fkey TO campaign_bans_campaign_id_fkey;
--rollback ALTER TABLE campaign_bans RENAME CONSTRAINT campaign_bans_campaign_id_fkey TO room_bans_room_id_fkey;
--rollback ALTER TABLE campaign_bans RENAME CONSTRAINT campaign_bans_pkey TO room_bans_pkey;
--rollback ALTER TABLE campaign_bans RENAME COLUMN banned_at TO banni_le;
--rollback ALTER TABLE campaign_bans RENAME COLUMN banned_by TO banni_par;
--rollback ALTER TABLE campaign_bans RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_bans RENAME TO room_bans;

--changeset campaign:0005-campaign-sessions
--comment: room_sessions -> campaign_sessions (prevue_le -> scheduled_at, titre -> title, cree_par -> created_by).
ALTER TABLE room_sessions RENAME TO campaign_sessions;
ALTER TABLE campaign_sessions RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_sessions RENAME COLUMN prevue_le TO scheduled_at;
ALTER TABLE campaign_sessions RENAME COLUMN titre TO title;
ALTER TABLE campaign_sessions RENAME COLUMN cree_par TO created_by;
ALTER TABLE campaign_sessions RENAME CONSTRAINT room_sessions_pkey TO campaign_sessions_pkey;
ALTER TABLE campaign_sessions RENAME CONSTRAINT room_sessions_room_id_fkey TO campaign_sessions_campaign_id_fkey;
ALTER TABLE campaign_sessions RENAME CONSTRAINT room_sessions_titre TO campaign_sessions_title;
ALTER INDEX room_sessions_room_date RENAME TO campaign_sessions_campaign_date;
--rollback ALTER INDEX campaign_sessions_campaign_date RENAME TO room_sessions_room_date;
--rollback ALTER TABLE campaign_sessions RENAME CONSTRAINT campaign_sessions_title TO room_sessions_titre;
--rollback ALTER TABLE campaign_sessions RENAME CONSTRAINT campaign_sessions_campaign_id_fkey TO room_sessions_room_id_fkey;
--rollback ALTER TABLE campaign_sessions RENAME CONSTRAINT campaign_sessions_pkey TO room_sessions_pkey;
--rollback ALTER TABLE campaign_sessions RENAME COLUMN created_by TO cree_par;
--rollback ALTER TABLE campaign_sessions RENAME COLUMN title TO titre;
--rollback ALTER TABLE campaign_sessions RENAME COLUMN scheduled_at TO prevue_le;
--rollback ALTER TABLE campaign_sessions RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_sessions RENAME TO room_sessions;

--changeset campaign:0005-campaign-messages
--comment: room_messages -> campaign_messages (auteur_id -> author_id, texte -> body).
ALTER TABLE room_messages RENAME TO campaign_messages;
ALTER TABLE campaign_messages RENAME COLUMN room_id TO campaign_id;
ALTER TABLE campaign_messages RENAME COLUMN auteur_id TO author_id;
ALTER TABLE campaign_messages RENAME COLUMN texte TO body;
ALTER TABLE campaign_messages RENAME CONSTRAINT room_messages_pkey TO campaign_messages_pkey;
ALTER TABLE campaign_messages RENAME CONSTRAINT room_messages_room_id_fkey TO campaign_messages_campaign_id_fkey;
ALTER TABLE campaign_messages RENAME CONSTRAINT room_messages_texte TO campaign_messages_body;
ALTER INDEX room_messages_room RENAME TO campaign_messages_campaign;
ALTER INDEX room_messages_auteur RENAME TO campaign_messages_author;
--rollback ALTER INDEX campaign_messages_author RENAME TO room_messages_auteur;
--rollback ALTER INDEX campaign_messages_campaign RENAME TO room_messages_room;
--rollback ALTER TABLE campaign_messages RENAME CONSTRAINT campaign_messages_body TO room_messages_texte;
--rollback ALTER TABLE campaign_messages RENAME CONSTRAINT campaign_messages_campaign_id_fkey TO room_messages_room_id_fkey;
--rollback ALTER TABLE campaign_messages RENAME CONSTRAINT campaign_messages_pkey TO room_messages_pkey;
--rollback ALTER TABLE campaign_messages RENAME COLUMN body TO texte;
--rollback ALTER TABLE campaign_messages RENAME COLUMN author_id TO auteur_id;
--rollback ALTER TABLE campaign_messages RENAME COLUMN campaign_id TO room_id;
--rollback ALTER TABLE campaign_messages RENAME TO room_messages;
