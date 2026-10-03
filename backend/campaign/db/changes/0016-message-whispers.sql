--liquibase formatted sql

-- Discussion de la campagne : chuchotements et messages modifiés (docs/api-campaign.md).
--  - whisper_recipients : NULL pour un message lu par toute la table ; sinon un chuchotement,
--    lu par son auteur et les membres listés (utilisateurs), bornés comme le service (50) ;
--  - whisper_gm : chuchotement adressé aussi aux MJ de la campagne (ceux du moment de la
--    lecture) ; un chuchotement a au moins un destinataire (des membres ou les MJ) ;
--  - edited_at : dernière modification du texte par son auteur (NULL : jamais modifié).
-- `IF NOT EXISTS` sur edited_at : des bases de dev ont reçu l'ébauche abandonnée
-- 0010-message-channels (branche wip/campaign-message-channels), qui créait déjà cette colonne.
-- Les droits DML de campaign_svc viennent des privilèges par défaut.

--changeset campaign:0016-message-whispers
--comment: Chuchotements (membres destinataires, MJ) et date de modification des messages.
ALTER TABLE campaign_messages ADD COLUMN whisper_recipients uuid[];
ALTER TABLE campaign_messages ADD COLUMN whisper_gm boolean NOT NULL DEFAULT false;
ALTER TABLE campaign_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE campaign_messages
  ADD CONSTRAINT campaign_messages_whisper_audience CHECK (
    (whisper_recipients IS NULL AND NOT whisper_gm)
    OR (whisper_recipients IS NOT NULL AND (whisper_gm OR cardinality(whisper_recipients) > 0))
  );
ALTER TABLE campaign_messages
  ADD CONSTRAINT campaign_messages_whisper_recipients_size
  CHECK (whisper_recipients IS NULL OR cardinality(whisper_recipients) <= 50);
--rollback ALTER TABLE campaign_messages DROP CONSTRAINT campaign_messages_whisper_recipients_size;
--rollback ALTER TABLE campaign_messages DROP CONSTRAINT campaign_messages_whisper_audience;
--rollback ALTER TABLE campaign_messages DROP COLUMN edited_at;
--rollback ALTER TABLE campaign_messages DROP COLUMN whisper_gm;
--rollback ALTER TABLE campaign_messages DROP COLUMN whisper_recipients;
