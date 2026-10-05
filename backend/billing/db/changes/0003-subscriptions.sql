--liquibase formatted sql

--changeset billing:0003-subscriptions
--comment: Abonnements Stripe, historique compris (un abonné qui revient a deux lignes). Copie de l'état relu chez Stripe à chaque événement (docs/paiement.md).
CREATE TABLE subscriptions (
  id                   text        PRIMARY KEY,              -- sub_…
  user_id              uuid        NOT NULL,
  plan                 text        NOT NULL,                 -- monthly | annual | legacy
  status               text        NOT NULL,                 -- statut Stripe
  price_id             text,                                 -- price_… de la ligne d'abonnement
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at            timestamptz,                          -- fin programmée (résiliation)
  canceled_at          timestamptz,
  ended_at             timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_id CHECK (id ~ '^sub_[A-Za-z0-9]{1,250}$'),
  CONSTRAINT subscriptions_plan CHECK (plan IN ('monthly', 'annual', 'legacy')),
  CONSTRAINT subscriptions_status CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing',
    'active', 'past_due', 'canceled', 'unpaid', 'paused'))
);
CREATE INDEX subscriptions_user ON subscriptions (user_id, created_at DESC);
--rollback DROP TABLE subscriptions;

--changeset billing:0003-invoices
--comment: Factures Stripe (copie locale alimentée par le webhook) : la liste des factures ne dépend plus d'un appel à Stripe.
CREATE TABLE invoices (
  id              text        PRIMARY KEY,                   -- in_…
  user_id         uuid        NOT NULL,
  subscription_id text,
  number          text,                                      -- numéro légal, attribué à la finalisation
  status          text        NOT NULL,                      -- draft | open | paid | uncollectible | void
  amount_due      int         NOT NULL DEFAULT 0,
  amount_paid     int         NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'eur',
  description     text,
  hosted_url      text,
  pdf_url         text,
  period_start    timestamptz,
  period_end      timestamptz,
  issued_at       timestamptz NOT NULL,                      -- created de Stripe
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_id CHECK (id ~ '^in_[A-Za-z0-9]{1,250}$'),
  CONSTRAINT invoices_status CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void')),
  CONSTRAINT invoices_currency CHECK (currency ~ '^[a-z]{3}$')
);
CREATE INDEX invoices_user ON invoices (user_id, issued_at DESC);
--rollback DROP TABLE invoices;

--changeset billing:0003-entitlements
--comment: Droits achetés ou donnés : source de vérité de ce qu'un utilisateur possède (premium, skins, cadres). Une ligne par source ; révoquée, jamais supprimée.
CREATE TABLE entitlements (
  id            uuid        PRIMARY KEY,                     -- UUIDv7
  user_id       uuid        NOT NULL,
  kind          text        NOT NULL,                        -- premium | dice_skin | token_frame
  item_id       text        NOT NULL DEFAULT '',             -- skin ou cadre ; '' pour premium
  source        text        NOT NULL,                        -- subscription | purchase | legacy | gift
  source_id     text        NOT NULL DEFAULT '',             -- sub_… ou id d'achat
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  revoke_reason text,
  CONSTRAINT entitlements_kind CHECK (kind IN ('premium', 'dice_skin', 'token_frame')),
  CONSTRAINT entitlements_source CHECK (source IN ('subscription', 'purchase', 'legacy', 'gift')),
  CONSTRAINT entitlements_item CHECK ((kind = 'premium') = (item_id = '')),
  CONSTRAINT entitlements_revoked CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
-- Un seul droit actif par source : un événement rejoué n'en crée pas un second
CREATE UNIQUE INDEX entitlements_active ON entitlements (user_id, kind, item_id, source, source_id)
  WHERE revoked_at IS NULL;
--rollback DROP TABLE entitlements;

--changeset billing:0003-purchases-refund
--comment: Achat remboursé ou contesté : statut refunded ; accord de renonciation au droit de rétractation.
ALTER TABLE purchases DROP CONSTRAINT purchases_status;
ALTER TABLE purchases DROP CONSTRAINT purchases_completed;
ALTER TABLE purchases ADD COLUMN refunded_at timestamptz;
ALTER TABLE purchases ADD COLUMN consent_at timestamptz;
ALTER TABLE purchases ADD CONSTRAINT purchases_status
  CHECK (status IN ('pending', 'completed', 'expired', 'refunded'));
ALTER TABLE purchases ADD CONSTRAINT purchases_completed
  CHECK ((status IN ('completed', 'refunded')) = (completed_at IS NOT NULL));
ALTER TABLE purchases ADD CONSTRAINT purchases_refunded
  CHECK ((status = 'refunded') = (refunded_at IS NOT NULL));
CREATE INDEX purchases_payment_intent ON purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
--rollback DROP INDEX purchases_payment_intent;
--rollback ALTER TABLE purchases DROP CONSTRAINT purchases_refunded;
--rollback ALTER TABLE purchases DROP CONSTRAINT purchases_completed;
--rollback ALTER TABLE purchases DROP CONSTRAINT purchases_status;
--rollback UPDATE purchases SET status = 'completed' WHERE status = 'refunded';
--rollback ALTER TABLE purchases DROP COLUMN consent_at;
--rollback ALTER TABLE purchases DROP COLUMN refunded_at;
--rollback ALTER TABLE purchases ADD CONSTRAINT purchases_status CHECK (status IN ('pending', 'completed', 'expired'));
--rollback ALTER TABLE purchases ADD CONSTRAINT purchases_completed CHECK ((status = 'completed') = (completed_at IS NOT NULL));

--changeset billing:0003-backfill
--comment: Reprise de l'état actuel : premium et achats deviennent des droits, l'abonnement en cours une ligne de subscriptions (formule legacy, recalculée par stripe:backfill).
INSERT INTO entitlements (id, user_id, kind, source, source_id, granted_at)
SELECT gen_random_uuid(), user_id, 'premium',
       CASE WHEN subscription_id IS NULL THEN 'legacy' ELSE 'subscription' END,
       coalesce(subscription_id, ''), coalesce(premium_since, created_at)
FROM customers WHERE premium;

INSERT INTO entitlements (id, user_id, kind, item_id, source, source_id, granted_at)
SELECT gen_random_uuid(), user_id, CASE kind WHEN 'dice' THEN 'dice_skin' ELSE 'token_frame' END,
       item_id, 'purchase', id::text, completed_at
FROM purchases WHERE status = 'completed'
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (id, user_id, plan, status, cancel_at, created_at)
SELECT subscription_id, user_id, 'legacy', CASE WHEN premium THEN 'active' ELSE 'canceled' END,
       CASE WHEN cancel_at_period_end THEN premium_end_date END, coalesce(premium_since, created_at)
FROM customers WHERE subscription_id IS NOT NULL;
--rollback DELETE FROM subscriptions;
--rollback DELETE FROM entitlements;

--changeset billing:0003-customers
--comment: customers ne garde que le client Stripe et son e-mail de facturation ; l'état du premium vit dans entitlements et subscriptions.
ALTER TABLE customers ADD COLUMN email text;
ALTER TABLE customers DROP CONSTRAINT customers_cancel_end;
ALTER TABLE customers DROP CONSTRAINT customers_subscription_id;
ALTER TABLE customers DROP COLUMN subscription_id;
ALTER TABLE customers DROP COLUMN premium;
ALTER TABLE customers DROP COLUMN premium_since;
ALTER TABLE customers DROP COLUMN cancel_at_period_end;
ALTER TABLE customers DROP COLUMN premium_end_date;
--rollback ALTER TABLE customers ADD COLUMN premium_end_date timestamptz;
--rollback ALTER TABLE customers ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE customers ADD COLUMN premium_since timestamptz;
--rollback ALTER TABLE customers ADD COLUMN premium boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE customers ADD COLUMN subscription_id text UNIQUE;
--rollback ALTER TABLE customers ADD CONSTRAINT customers_subscription_id CHECK (subscription_id ~ '^sub_[A-Za-z0-9]{1,250}$');
--rollback ALTER TABLE customers ADD CONSTRAINT customers_cancel_end CHECK (NOT cancel_at_period_end OR premium_end_date IS NOT NULL);
--rollback ALTER TABLE customers DROP COLUMN email;
