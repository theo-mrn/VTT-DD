--liquibase formatted sql

--changeset billing:0006-entitlement-expiry
--comment: Droit à durée limitée (premium offert par un code) : retiré par la tâche horaire une fois expires_at passé. Nouvelle source « code ».
ALTER TABLE entitlements ADD COLUMN expires_at timestamptz;
ALTER TABLE entitlements DROP CONSTRAINT entitlements_source;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_source
  CHECK (source IN ('subscription', 'purchase', 'legacy', 'gift', 'code'));
CREATE INDEX entitlements_expiring ON entitlements (expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;
--rollback DROP INDEX entitlements_expiring;
--rollback ALTER TABLE entitlements DROP CONSTRAINT entitlements_source;
--rollback ALTER TABLE entitlements ADD CONSTRAINT entitlements_source CHECK (source IN ('subscription', 'purchase', 'legacy', 'gift'));
--rollback ALTER TABLE entitlements DROP COLUMN expires_at;

--changeset billing:0006-codes
--comment: Codes à échanger contre un droit : premium pendant N jours, un skin de dés ou un cadre à vie. Créés par la commande codes:create.
CREATE TABLE codes (
  code          text        PRIMARY KEY,                     -- normalisé : majuscules, sans séparateur
  kind          text        NOT NULL,                        -- premium | dice_skin | token_frame
  item_id       text        NOT NULL DEFAULT '',             -- skin ou cadre ; '' pour premium
  duration_days integer,                                     -- premium seulement
  max_uses      integer     NOT NULL DEFAULT 1,
  uses          integer     NOT NULL DEFAULT 0,
  valid_until   timestamptz,                                 -- échangeable jusqu'à cette date
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT codes_kind CHECK (kind IN ('premium', 'dice_skin', 'token_frame')),
  CONSTRAINT codes_item CHECK ((kind = 'premium') = (item_id = '')),
  CONSTRAINT codes_duration CHECK ((kind = 'premium') = (duration_days IS NOT NULL) AND (duration_days IS NULL OR duration_days > 0)),
  CONSTRAINT codes_uses CHECK (max_uses > 0 AND uses >= 0 AND uses <= max_uses)
);

CREATE TABLE code_redemptions (
  code           text        NOT NULL REFERENCES codes (code),
  user_id        uuid        NOT NULL,
  entitlement_id uuid        NOT NULL,
  redeemed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);
CREATE INDEX code_redemptions_user ON code_redemptions (user_id);
--rollback DROP TABLE code_redemptions;
--rollback DROP TABLE codes;
