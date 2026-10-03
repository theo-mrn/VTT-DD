/**
 * Schéma Drizzle du service billing : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/billing/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const billingSchema = pgSchema('billing');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ITEM_KINDS = ['dice', 'token'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PURCHASE_STATUSES = ['pending', 'completed', 'expired'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const customers = billingSchema.table('customers', {
  userId: uuid('user_id').primaryKey(),
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionId: text('subscription_id'),
  premium: boolean('premium').notNull().default(false),
  premiumSince: timestampTz('premium_since'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  premiumEndDate: timestampTz('premium_end_date'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type CustomerRow = typeof customers.$inferSelect;

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
});
export type PurchaseRow = typeof purchases.$inferSelect;

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
