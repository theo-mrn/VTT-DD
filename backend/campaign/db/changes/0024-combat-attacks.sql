--liquibase formatted sql

-- Attaques et rapports (docs/combat.md § 5 à § 7) : une attaque par déclaration, une ligne par
-- cible (issue, vue de l'attaquant, rapport complet, décision du MJ), une ligne par application
-- (décision envoyée à character, idempotente par son identifiant, annulable).
-- Les colonnes `snapshot`, `faces` et `pending_steps` servent au protocole des dés (§ 6) :
-- l'instantané des fiches reste ici, réservé au serveur, jusqu'à la résolution.

--changeset campaign:0024-attacks
--comment: Attaques déclarées (en combat ou hors combat), leur cycle de vie et les coûts de l'attaquant.
CREATE TABLE campaign_attacks (
  id              uuid        PRIMARY KEY,            -- UUIDv7 : ordre chronologique
  campaign_id     uuid        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  combat_id       uuid,                               -- combat de la déclaration ; null : hors combat
  round           int,
  turn            int,
  attacker_id     uuid        NOT NULL,
  action_id       text        NOT NULL,
  action_name     text        NOT NULL,
  params          jsonb       NOT NULL DEFAULT '{}',
  roll_mode       text        NOT NULL,
  dice            text        NOT NULL,
  visibility      text        NOT NULL,
  status          text        NOT NULL,
  out_of_turn     boolean     NOT NULL DEFAULT false,
  self_target     boolean     NOT NULL DEFAULT false,
  origin          text,
  preset_id       text,
  adjustments     jsonb,
  actor           jsonb,                              -- coûts de l'attaquant (AttackActor)
  snapshot        jsonb,                              -- instantané opaque de character (serveur seul)
  faces           jsonb       NOT NULL DEFAULT '[]',  -- faces lues ou tirées, dans l'ordre (étape C)
  pending_steps   jsonb       NOT NULL DEFAULT '[]',  -- étapes de dés à lancer (étape C)
  note            text,
  idempotency_key text,
  created_by      uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  decided_at      timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int         NOT NULL DEFAULT 1,
  CONSTRAINT campaign_attacks_roll_mode CHECK (roll_mode IN ('per_target', 'shared')),
  CONSTRAINT campaign_attacks_dice CHECK (dice IN ('physical', 'server')),
  CONSTRAINT campaign_attacks_visibility CHECK (visibility IN ('public', 'private', 'gm')),
  CONSTRAINT campaign_attacks_status CHECK (status IN (
    'awaiting_reactions', 'awaiting_dice', 'pending', 'applied', 'dismissed', 'cancelled', 'failed'
  )),
  CONSTRAINT campaign_attacks_origin
    CHECK (origin IS NULL OR origin IN ('map', 'selection', 'measurement', 'sheet', 'turns')),
  CONSTRAINT campaign_attacks_params CHECK (jsonb_typeof(params) = 'object'),
  CONSTRAINT campaign_attacks_faces CHECK (jsonb_typeof(faces) = 'array'),
  CONSTRAINT campaign_attacks_pending_steps CHECK (jsonb_typeof(pending_steps) = 'array'),
  CONSTRAINT campaign_attacks_note CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT campaign_attacks_version CHECK (version >= 1),
  CONSTRAINT campaign_attacks_combat CHECK ((combat_id IS NULL) = (round IS NULL))
);
CREATE INDEX campaign_attacks_campaign ON campaign_attacks (campaign_id, id DESC);
CREATE INDEX campaign_attacks_open ON campaign_attacks (campaign_id, status)
  WHERE status IN ('awaiting_reactions', 'awaiting_dice', 'pending');
CREATE INDEX campaign_attacks_attacker ON campaign_attacks (campaign_id, attacker_id, id DESC);
-- Idempotency-Key : une déclaration par clé, par auteur et par campagne
CREATE UNIQUE INDEX campaign_attacks_idempotency
  ON campaign_attacks (campaign_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--rollback DROP TABLE campaign_attacks;

--changeset campaign:0024-attack-targets
--comment: Cibles d'une attaque, dans l'ordre de la déclaration : résolution, réaction (défense active), vue de l'attaquant, rapport complet (MJ), décision et ce qui a été appliqué.
CREATE TABLE campaign_attack_targets (
  attack_id       uuid    NOT NULL REFERENCES campaign_attacks (id) ON DELETE CASCADE,
  character_id    uuid    NOT NULL,
  position        int     NOT NULL,
  status          text    NOT NULL,
  decision        text    NOT NULL DEFAULT 'pending',
  reaction_params jsonb   NOT NULL DEFAULT '[]',      -- paramètres `par: cible` proposés
  reaction        jsonb,                              -- { params, skipped, answeredBy }
  view            jsonb,                              -- AttackTargetView (attaquant)
  result          jsonb,                              -- AttackTargetResult (MJ seul)
  applied         jsonb,                              -- AttackAppliedTarget
  error           text,
  PRIMARY KEY (attack_id, character_id),
  CONSTRAINT campaign_attack_targets_position UNIQUE (attack_id, position),
  CONSTRAINT campaign_attack_targets_status
    CHECK (status IN ('awaiting_reaction', 'awaiting_dice', 'resolved', 'failed')),
  CONSTRAINT campaign_attack_targets_decision
    CHECK (decision IN ('pending', 'applied', 'skipped', 'reverted')),
  CONSTRAINT campaign_attack_targets_reaction_params CHECK (jsonb_typeof(reaction_params) = 'array')
);
CREATE INDEX campaign_attack_targets_character ON campaign_attack_targets (character_id);
--rollback DROP TABLE campaign_attack_targets;

--changeset campaign:0024-attack-applications
--comment: Décisions du MJ envoyées à character (applicationId, idempotent) : ce qui a été envoyé, la réponse (versions, diff, hors de combat), et son annulation. « applying » : envoyée, réponse pas encore enregistrée (reprise après une panne).
CREATE TABLE campaign_attack_applications (
  id          uuid        PRIMARY KEY,                -- applicationId (UUIDv7)
  attack_id   uuid        NOT NULL REFERENCES campaign_attacks (id) ON DELETE CASCADE,
  campaign_id uuid        NOT NULL,
  status      text        NOT NULL,
  decisions   jsonb       NOT NULL,                   -- décisions (cibles, attaquant) et fiches touchées
  items       jsonb       NOT NULL,                   -- corps envoyé à character, par fiche
  result      jsonb,                                  -- réponse de character, par fiche
  note        text,
  created_by  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz,
  reverted_at timestamptz,
  reverted_by uuid,
  CONSTRAINT campaign_attack_applications_status
    CHECK (status IN ('applying', 'applied', 'reverted')),
  CONSTRAINT campaign_attack_applications_decisions CHECK (jsonb_typeof(decisions) = 'array'),
  CONSTRAINT campaign_attack_applications_items CHECK (jsonb_typeof(items) = 'array')
);
CREATE INDEX campaign_attack_applications_attack ON campaign_attack_applications (attack_id, id);
--rollback DROP TABLE campaign_attack_applications;
