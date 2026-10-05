/**
 * Schéma Drizzle du service billing : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/billing/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import { bigint, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const billingSchema = pgSchema('billing');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ITEM_KINDS = ['dice', 'token'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PURCHASE_STATUSES = ['pending', 'completed', 'expired', 'refunded'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PLANS = ['monthly', 'annual', 'legacy'] as const;
export type Plan = (typeof PLANS)[number];

export const SUBSCRIPTION_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['draft', 'open', 'paid', 'uncollectible', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const ENTITLEMENT_KINDS = ['premium', 'dice_skin', 'token_frame'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

export const ENTITLEMENT_SOURCES = ['subscription', 'purchase', 'legacy', 'gift'] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

export const customers = billingSchema.table('customers', {
  userId: uuid('user_id').primaryKey(),
  stripeCustomerId: text('stripe_customer_id'),
  /** E-mail de facturation (celui du client Stripe). */
  email: text('email'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type CustomerRow = typeof customers.$inferSelect;

export const subscriptions = billingSchema.table('subscriptions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  plan: text('plan', { enum: PLANS }).notNull(),
  status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull(),
  priceId: text('price_id'),
  currentPeriodStart: timestampTz('current_period_start'),
  currentPeriodEnd: timestampTz('current_period_end'),
  cancelAt: timestampTz('cancel_at'),
  canceledAt: timestampTz('canceled_at'),
  endedAt: timestampTz('ended_at'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export const invoices = billingSchema.table('invoices', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  subscriptionId: text('subscription_id'),
  number: text('number'),
  status: text('status', { enum: INVOICE_STATUSES }).notNull(),
  amountDue: integer('amount_due').notNull().default(0),
  amountPaid: integer('amount_paid').notNull().default(0),
  currency: text('currency').notNull().default('eur'),
  description: text('description'),
  hostedUrl: text('hosted_url'),
  pdfUrl: text('pdf_url'),
  periodStart: timestampTz('period_start'),
  periodEnd: timestampTz('period_end'),
  issuedAt: timestampTz('issued_at').notNull(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type InvoiceRow = typeof invoices.$inferSelect;

export const entitlements = billingSchema.table('entitlements', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  kind: text('kind', { enum: ENTITLEMENT_KINDS }).notNull(),
  itemId: text('item_id').notNull().default(''),
  source: text('source', { enum: ENTITLEMENT_SOURCES }).notNull(),
  sourceId: text('source_id').notNull().default(''),
  grantedAt: timestampTz('granted_at').notNull().defaultNow(),
  revokedAt: timestampTz('revoked_at'),
  revokeReason: text('revoke_reason'),
});
export type EntitlementRow = typeof entitlements.$inferSelect;

export const purchases = billingSchema.table('purchases', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  kind: text('kind', { enum: ITEM_KINDS }).notNull(),
  itemId: text('item_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('eur'),
  status: text('status', { enum: PURCHASE_STATUSES }).notNull().default('pending'),
  stripeSessionId: text('stripe_session_id').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  completedAt: timestampTz('completed_at'),
  refundedAt: timestampTz('refunded_at'),
  /** Renonciation au droit de rétractation acceptée dans Checkout. */
  consentAt: timestampTz('consent_at'),
});
export type PurchaseRow = typeof purchases.$inferSelect;

export const rightsVersions = billingSchema.table('rights_versions', {
  userId: uuid('user_id').primaryKey(),
  version: bigint('version', { mode: 'number' }).notNull(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const processedEvents = billingSchema.table('processed_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});

export const outbox = billingSchema.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  publishedAt: timestampTz('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = billingSchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
