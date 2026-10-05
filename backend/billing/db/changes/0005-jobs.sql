--liquibase formatted sql

--changeset billing:0005-job-runs
--comment: Dernier passage des tâches planifiées du service (réconciliation, rappels) : une tâche quotidienne ne tourne qu'une fois par jour, quel que soit le nombre de réplicas.
CREATE TABLE job_runs (
  name        text        PRIMARY KEY,
  last_run_at timestamptz NOT NULL
);
--rollback DROP TABLE job_runs;

--changeset billing:0005-renewal-reminders
--comment: Rappels de reconduction envoyés (loi Chatel : abonnement annuel prévenu avant le renouvellement), un par abonnement et par échéance.
CREATE TABLE renewal_reminders (
  subscription_id text        NOT NULL,
  period_end      timestamptz NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, period_end)
);
--rollback DROP TABLE renewal_reminders;
