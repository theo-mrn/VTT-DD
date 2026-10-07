--liquibase formatted sql

--changeset billing:0007-connected-accounts
--comment: Compte Stripe Connect d'un créateur de la marketplace (docs/marketplace.md § 5), un par utilisateur. state_version croît à chaque publication de son état (billing.connect_account_updated).
CREATE TABLE connected_accounts (
  user_id            uuid        PRIMARY KEY,
  stripe_account_id  text        NOT NULL,
  charges_enabled    boolean     NOT NULL DEFAULT false,
  payouts_enabled    boolean     NOT NULL DEFAULT false,
  details_submitted  boolean     NOT NULL DEFAULT false,
  requirements_due   integer     NOT NULL DEFAULT 0,
  state_version      bigint      NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connected_accounts_stripe_unique UNIQUE (stripe_account_id),
  CONSTRAINT connected_accounts_stripe_id CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  CONSTRAINT connected_accounts_requirements CHECK (requirements_due >= 0),
  CONSTRAINT connected_accounts_version CHECK (state_version >= 0)
);
--rollback DROP TABLE connected_accounts;

--changeset billing:0007-marketplace-sales
--comment: Vente d'un pack (une par session Checkout) : charge de destination vers le compte du créateur, commission de la plateforme. Remboursée ou contestée : l'acquisition est révoquée par marketplace.
CREATE TABLE marketplace_sales (
  id                        uuid        PRIMARY KEY,
  buyer_id                  uuid        NOT NULL,
  seller_id                 uuid        NOT NULL,
  listing_id                uuid        NOT NULL,
  title                     text        NOT NULL,
  amount_cents              integer     NOT NULL,
  fee_cents                 integer     NOT NULL,
  currency                  text        NOT NULL DEFAULT 'eur',
  stripe_account_id         text        NOT NULL,
  status                    text        NOT NULL DEFAULT 'pending',
  stripe_session_id         text        NOT NULL,
  stripe_payment_intent_id  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz,
  refunded_at               timestamptz,
  consent_at                timestamptz,
  CONSTRAINT marketplace_sales_session_unique UNIQUE (stripe_session_id),
  CONSTRAINT marketplace_sales_amount CHECK (amount_cents > 0),
  CONSTRAINT marketplace_sales_fee CHECK (fee_cents >= 0 AND fee_cents <= amount_cents),
  CONSTRAINT marketplace_sales_title CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT marketplace_sales_status CHECK (status IN ('pending', 'completed', 'expired', 'refunded', 'disputed')),
  CONSTRAINT marketplace_sales_completed CHECK (status IN ('pending', 'expired') OR completed_at IS NOT NULL),
  CONSTRAINT marketplace_sales_refunded CHECK (status <> 'refunded' OR refunded_at IS NOT NULL),
  CONSTRAINT marketplace_sales_buyer CHECK (buyer_id <> seller_id)
);
CREATE INDEX marketplace_sales_seller ON marketplace_sales (seller_id, created_at DESC);
CREATE INDEX marketplace_sales_buyer ON marketplace_sales (buyer_id, created_at DESC);
CREATE INDEX marketplace_sales_payment ON marketplace_sales (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
--rollback DROP TABLE marketplace_sales;
