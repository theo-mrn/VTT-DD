--liquibase formatted sql

--changeset billing:0001-customers
--comment: Client Stripe et abonnement premium d'un utilisateur (ancien users/{uid}.stripeCustomerId, stripeSubscriptionId, premium, premiumSince, cancelAtPeriodEnd, premiumEndDate). Le webhook Stripe en est la source.
CREATE TABLE customers (
  user_id              uuid        PRIMARY KEY,                -- compte identity
  stripe_customer_id   text        UNIQUE,                     -- cus_… (portail, factures)
  subscription_id      text        UNIQUE,                     -- sub_… de l'abonnement premium en cours
  premium              boolean     NOT NULL DEFAULT false,
  premium_since        timestamptz,
  cancel_at_period_end boolean     NOT NULL DEFAULT false,     -- résilié, actif jusqu'à premium_end_date
  premium_end_date     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_stripe_customer_id CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$'),
  CONSTRAINT customers_subscription_id CHECK (subscription_id ~ '^sub_[A-Za-z0-9]{1,250}$'),
  -- Une résiliation programmée porte sa date de fin
  CONSTRAINT customers_cancel_end CHECK (NOT cancel_at_period_end OR premium_end_date IS NOT NULL)
);
--rollback DROP TABLE customers;

--changeset billing:0001-purchases
--comment: Achats à l'unité (skin de dés, cadre de jeton) payés par Stripe Checkout. Le montant vient du catalogue du service, jamais du client.
CREATE TABLE purchases (
  id                       uuid        PRIMARY KEY,          -- UUIDv7
  user_id                  uuid        NOT NULL,
  kind                     text        NOT NULL,             -- dice | token
  item_id                  text        NOT NULL,             -- identifiant du skin ou du cadre
  amount_cents             int         NOT NULL,
  currency                 text        NOT NULL DEFAULT 'eur',
  status                   text        NOT NULL DEFAULT 'pending',
  stripe_session_id        text        NOT NULL UNIQUE,      -- cs_… (session Checkout)
  stripe_payment_intent_id text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  CONSTRAINT purchases_kind CHECK (kind IN ('dice', 'token')),
  CONSTRAINT purchases_status CHECK (status IN ('pending', 'completed', 'expired')),
  CONSTRAINT purchases_amount CHECK (amount_cents > 0),
  CONSTRAINT purchases_currency CHECK (currency ~ '^[a-z]{3}$'),
  CONSTRAINT purchases_item_id CHECK (item_id ~ '^[A-Za-z0-9_]{1,64}$'),
  CONSTRAINT purchases_session CHECK (stripe_session_id ~ '^cs_[A-Za-z0-9_]{1,250}$'),
  CONSTRAINT purchases_completed CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
-- Achats d'un utilisateur (article déjà acheté : 409 avant de créer la session)
CREATE INDEX purchases_user ON purchases (user_id, kind, item_id);
--rollback DROP TABLE purchases;

--changeset billing:0001-processed-events
--comment: Événements Stripe déjà traités par le webhook : une relivraison (Stripe livre au moins une fois) est acquittée sans aucun effet.
CREATE TABLE processed_events (
  stripe_event_id text        PRIMARY KEY,                   -- evt_…
  type            text        NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processed_events_id CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{1,250}$')
);
--rollback DROP TABLE processed_events;
