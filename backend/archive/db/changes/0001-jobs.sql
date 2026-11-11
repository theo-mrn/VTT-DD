--liquibase formatted sql

--changeset archive:0001-jobs
--comment: Tâches d'export, d'import et de duplication d'une campagne, et leurs archives (docs/export-campagne.md § 5.1).
CREATE TABLE jobs (
  id                  uuid        PRIMARY KEY,
  kind                text        NOT NULL,
  user_id             uuid        NOT NULL,
  -- Campagne exportée ou dupliquée
  source_campaign_id  uuid,
  -- Campagne créée par un import ou une duplication
  campaign_id         uuid,
  campaign_name       text,
  keep_progress       boolean     NOT NULL,
  status              text        NOT NULL,
  step                text,
  progress            real        NOT NULL DEFAULT 0,
  -- Archive sur R2 : exports/<user>/<tâche>.yner ou imports/<user>/<tâche>.yner
  object_key          text,
  size                bigint,
  error               text,
  attempts            int         NOT NULL DEFAULT 0,
  run_after           timestamptz NOT NULL DEFAULT now(),
  locked_until        timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_kind CHECK (kind IN ('export', 'import', 'duplicate')),
  CONSTRAINT jobs_status CHECK (status IN ('uploading', 'pending', 'running', 'ready', 'failed')),
  CONSTRAINT jobs_step CHECK (step IN ('collect', 'files', 'write', 'read', 'create', 'done')),
  CONSTRAINT jobs_progress CHECK (progress BETWEEN 0 AND 1),
  CONSTRAINT jobs_size CHECK (size >= 0),
  CONSTRAINT jobs_name CHECK (char_length(campaign_name) <= 200),
  CONSTRAINT jobs_source CHECK ((kind = 'import') = (source_campaign_id IS NULL))
);
-- Tâches à prendre par l'ouvrier
CREATE INDEX jobs_queue ON jobs (run_after) WHERE status IN ('pending', 'running');
-- Centre des exports
CREATE INDEX jobs_user ON jobs (user_id, created_at DESC);
-- Archives à effacer
CREATE INDEX jobs_expiry ON jobs (expires_at) WHERE expires_at IS NOT NULL;
-- Un export ou une duplication à la fois par campagne
CREATE UNIQUE INDEX jobs_one_per_campaign ON jobs (source_campaign_id)
  WHERE status IN ('pending', 'running');
--rollback DROP TABLE jobs;
