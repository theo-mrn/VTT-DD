/**
 * Abonnements premium. Stripe ne garantit pas l'ordre de ses événements : on
 * ne croit jamais la charge utile, on relit l'abonnement chez Stripe et on
 * recopie son état le plus récent. Un événement en retard ne peut donc pas
 * réactiver un premium terminé.
 *
 * Chaque synchronisation compare l'ancien et le nouvel état dans la même
 * transaction et écrit un événement par transition (début, changement de
 * formule, résiliation programmée ou annulée, paiement en retard, fin), puis
 * accorde ou révoque le droit premium de cet abonnement.
 */
import type { Actor } from '@vtt/contracts';
import { desc, eq, sql } from 'drizzle-orm';
import { planOfLookupKey } from '../catalog/catalog.js';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../db/outbox.js';
import { subscriptions, type SubscriptionRow, type SubscriptionStatus } from '../db/schema.js';
import {
  cancellationDate,
  idOf,
  periodEnd,
  periodStart,
  type Subscription,
} from '../stripe/client.js';
import {
  customerAggregate,
  customerByStripeId,
  fromUnix,
  isUuid,
  rememberCustomer,
  type PaymentDeps,
} from './common.js';
import { grant, hasPremium, publishRights, revoke } from './entitlements.js';

/** Statuts qui donnent le premium (past_due : Stripe relance encore la carte). */
export const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'trialing',
  'active',
  'past_due',
]);

export const isLive = (status: SubscriptionStatus | null | undefined) =>
  !!status && LIVE_STATUSES.has(status);

const isMissing = (e: unknown) => (e as { code?: unknown })?.code === 'resource_missing';

export interface SyncOptions {
  /** Utilisateur connu de l'appelant (session Checkout), si l'abonnement ne le porte pas. */
  userId?: string;
  /** Rattrapage (stripe:backfill) : état recopié sans événement ni e-mail. */
  quiet?: boolean;
}

/**
 * Recopie l'état d'un abonnement relu chez Stripe. `unknown` : abonnement
 * absent chez Stripe, ou dont l'utilisateur est introuvable (rien à faire).
 */
export async function syncSubscription(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  subscriptionId: string,
  opts: SyncOptions = {},
): Promise<'synced' | 'unknown'> {
  let sub: Subscription;
  try {
    sub = await deps.stripe.retrieveSubscription(subscriptionId);
  } catch (e) {
    if (isMissing(e)) return 'unknown';
    throw e;
  }
  const userId = await subscriberOf(deps.db, sub, opts.userId);
  if (!userId) return 'unknown';

  await deps.db.transaction((tx) => recordSubscription(tx, ctx, actor, userId, sub, opts));
  return 'synced';
}

/** Utilisateur d'un abonnement : métadonnée posée par le service, ligne connue, puis client. */
async function subscriberOf(db: Db, sub: Subscription, hint?: string) {
  const fromMetadata = sub.metadata?.userId;
  if (isUuid(fromMetadata)) return fromMetadata.toLowerCase();
  const [known] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.id, sub.id));
  if (known) return known.userId;
  const customerId = idOf(sub.customer);
  const customer = customerId ? await customerByStripeId(db, customerId) : undefined;
  return customer?.userId ?? (isUuid(hint) ? hint.toLowerCase() : null);
}

async function recordSubscription(
  tx: Tx,
  ctx: EventContext,
  actor: Actor,
  userId: string,
  sub: Subscription,
  opts: SyncOptions,
) {
  const [prev] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, sub.id))
    .for('update');

  const price = sub.items?.data?.[0]?.price;
  const status = sub.status as SubscriptionStatus;
  const values = {
    userId,
    plan: planOfLookupKey(price?.lookup_key),
    status,
    priceId: price?.id ?? null,
    currentPeriodStart: fromUnix(periodStart(sub)),
    currentPeriodEnd: fromUnix(periodEnd(sub)),
    cancelAt: isLive(status) ? cancellationDate(sub) : null,
    canceledAt: fromUnix(sub.canceled_at),
    endedAt: fromUnix(sub.ended_at),
  };
  await tx
    .insert(subscriptions)
    .values({ id: sub.id, ...values, createdAt: fromUnix(sub.created) ?? new Date() })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: { ...values, updatedAt: sql`now()` },
    });
  await rememberCustomer(tx, userId, idOf(sub.customer));

  const premiumBefore = await hasPremium(tx, userId);
  const ref = {
    userId,
    kind: 'premium' as const,
    source: 'subscription' as const,
    sourceId: sub.id,
  };
  const changed = isLive(status)
    ? await grant(tx, ref)
    : await revoke(tx, ref, `subscription_${status}`);
  const premiumAfter = await hasPremium(tx, userId);
  // Droits publiés même en rattrapage (quiet) : dice et identity doivent suivre
  if (changed) await publishRights(tx, ctx, actor, userId);

  if (opts.quiet) return;
  const emit = (type: string, payload: Record<string, unknown>) =>
    appendEvent(tx, ctx, {
      type,
      actor,
      aggregate: customerAggregate(userId),
      payload: { userId, subscriptionId: sub.id, ...payload },
    });

  for (const t of transitions(prev, values)) await emit(t.type, t.payload);
  if (!premiumBefore && premiumAfter) await emit('billing.premium_activated', {});
  if (premiumBefore && !premiumAfter) await emit('billing.premium_deactivated', { status });
}

type State = Pick<SubscriptionRow, 'plan' | 'status' | 'cancelAt' | 'currentPeriodEnd'>;

/** Transitions entre l'état connu et l'état relu chez Stripe, dans l'ordre où elles comptent. */
export function transitions(
  prev: State | undefined,
  next: State,
): { type: string; payload: Record<string, unknown> }[] {
  const out: { type: string; payload: Record<string, unknown> }[] = [];
  const wasLive = isLive(prev?.status);
  const live = isLive(next.status);
  const iso = (d: Date | null) => d?.toISOString() ?? null;

  if (!wasLive && live) {
    out.push({
      type: 'billing.subscription_started',
      payload: { plan: next.plan, currentPeriodEnd: iso(next.currentPeriodEnd) },
    });
  }
  if (wasLive && live && prev!.plan !== next.plan) {
    out.push({
      type: 'billing.subscription_plan_changed',
      payload: { from: prev!.plan, to: next.plan },
    });
  }
  if (live && next.cancelAt && !prev?.cancelAt) {
    out.push({
      type: 'billing.subscription_cancellation_scheduled',
      payload: { endDate: iso(next.cancelAt) },
    });
  }
  if (wasLive && live && prev!.cancelAt && !next.cancelAt) {
    out.push({ type: 'billing.subscription_resumed', payload: {} });
  }
  if (next.status === 'past_due' && prev?.status !== 'past_due') {
    out.push({ type: 'billing.subscription_past_due', payload: {} });
  }
  if (wasLive && !live) {
    out.push({ type: 'billing.subscription_ended', payload: { status: next.status } });
  }
  return out;
}

/** Abonnement le plus récent d'un utilisateur (en cours de préférence). */
export async function currentSubscription(
  db: Db | Tx,
  userId: string,
): Promise<SubscriptionRow | undefined> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));
  return rows.find((r) => isLive(r.status)) ?? rows[0];
}
