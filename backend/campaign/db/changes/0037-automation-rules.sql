--liquibase formatted sql

-- Moteur des automatismes (docs/automatismes.md) : règles « quand / si / alors », journal des
-- exécutions, file des actions différées et des échéances, mémoire de l'exécuteur par campagne.

--changeset campaign:0037-automation-rules
--comment: Règles, journal, file et mémoire de l'exécuteur des automatismes.
CREATE TABLE automation_rules (
  id           uuid        PRIMARY KEY,
  campaign_id  uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name         text        NOT NULL,
  enabled      boolean     NOT NULL DEFAULT true,
  trigger      jsonb       NOT NULL,
  conditions   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  actions      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cooldown_sec int         NOT NULL DEFAULT 0,
  once         boolean     NOT NULL DEFAULT false,
  sort_order   bigint      NOT NULL DEFAULT 0,
  last_run_at  timestamptz,
  version      int         NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_rules_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT automation_rules_trigger_object CHECK (jsonb_typeof(trigger) = 'object'),
  CONSTRAINT automation_rules_version_positive CHECK (version >= 1)
);
CREATE INDEX automation_rules_campaign ON automation_rules (campaign_id) WHERE enabled;

CREATE TABLE automation_runs (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  rule_id     uuid        REFERENCES automation_rules (id) ON DELETE SET NULL,
  rule_name   text        NOT NULL,
  trigger     text        NOT NULL,
  ok          boolean     NOT NULL,
  error       text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_runs_campaign_at ON automation_runs (campaign_id, at DESC);

CREATE TABLE automation_jobs (
  id          uuid        PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  kind        text        NOT NULL,
  run_at      timestamptz NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_jobs_kind CHECK (kind IN ('actions', 'timer.end', 'time.hour'))
);
CREATE INDEX automation_jobs_due ON automation_jobs (run_at);
CREATE INDEX automation_jobs_campaign_kind ON automation_jobs (campaign_id, kind);

ALTER TABLE table_states ADD COLUMN memory jsonb NOT NULL DEFAULT '{}'::jsonb;
--rollback ALTER TABLE table_states DROP COLUMN memory; DROP TABLE automation_jobs; DROP TABLE automation_runs; DROP TABLE automation_rules;
