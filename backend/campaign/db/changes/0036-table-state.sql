--liquibase formatted sql

-- État des outils de la table (docs/automatismes.md § 4) : heure du monde, horloges, minuteur,
-- jetons de destin, ambiance d'écran, pause. Une ligne par campagne, créée à la première écriture.

--changeset campaign:0036-table-state
--comment: État des outils de table, validé par le contrat (JSON).
CREATE TABLE table_states (
  campaign_id uuid        PRIMARY KEY REFERENCES campaigns (id) ON DELETE CASCADE,
  state       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  version     int         NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_states_object CHECK (jsonb_typeof(state) = 'object'),
  CONSTRAINT table_states_version_positive CHECK (version >= 1)
);
--rollback DROP TABLE table_states;
