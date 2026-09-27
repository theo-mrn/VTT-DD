/**
 * Effets des paiements, partagés par le webhook Stripe, la confirmation d'une
 * session au retour de Checkout et la résiliation. Reprend l'ancien
 * legacy/src/app/api/stripe-webhook/route.ts, qui écrivait dans users/{uid} :
 *
 *  - achat payé : skin ajouté à l'inventaire (dice) ; cadre : enregistré ici
 *    seulement, en attendant un service des cadres ;
 *  - abonnement payé : premium (tous les skins dans dice, badge dans identity) ;
 *  - abonnement supprimé : fin du premium.
 *
 * Ordre et reprise : les effets dans dice et identity (routes internes
 * idempotentes) passent AVANT la transaction locale. S'ils échouent, rien
 * n'est écrit ici et l'erreur remonte : le webhook répond 500 et Stripe
 * relivre l'événement, qui refait tout. Si la transaction échoue après les
 * effets, la relivraison les rejoue sans dommage. Chaque transition écrit son
 * événement dans l'outbox une seule fois (verrou de ligne + état vérifié).
 */
import { uuidv7, type Actor } from '@vtt/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { itemOf, findItem } from '../catalog/catalog.js';
import type { Effects } from '../clients/effects.js';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../db/outbox.js';
import { customers, purchases, type CustomerRow, type PurchaseRow } from '../db/schema.js';
import {
  cancellationDate,
  idOf,
  type CheckoutSession,
  type Subscription,
} from '../stripe/client.js';

export interface FulfillmentDeps {
  db: Db;
  effects: Effects;
}

export const SYSTEM: Actor = { userId: null, role: 'system', characterId: null };
export const userActor = (userId: string): Actor => ({ userId, role: 'user', characterId: null });

/** Type de session Checkout (métadonnée `type` posée par le service, comme l'ancienne app). */
export const PREMIUM_TYPE = 'premium_subscription';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const aggregate = (userId: string) => ({ type: 'billing_customer', id: userId });

async function lockCustomer(tx: Tx, userId: string): Promise<CustomerRow | undefined> {
  const [row] = await tx.select().from(customers).where(eq(customers.userId, userId)).for('update');
  return row;
}

/** Client Stripe connu : enregistré s'il manque (portail, factures), jamais remplacé. */
async function rememberCustomer(tx: Tx, userId: string, customerId: string | null) {
  if (!customerId) return;
  await tx
    .insert(customers)
    .values({ userId, stripeCustomerId: customerId })
    .onConflictDoUpdate({
      target: customers.userId,
      set: { stripeCustomerId: customerId, updatedAt: sql`now()` },
      setWhere: sql`${customers.stripeCustomerId} is null`,
    });
}

export async function customerByStripeId(db: Db, customerId: string) {
  const [row] = await db.select().from(customers).where(eq(customers.stripeCustomerId, customerId));
  return row;
}

export async function customerOf(db: Db, userId: string) {
  const [row] = await db.select().from(customers).where(eq(customers.userId, userId));
  return row;
}

// ─── Premium ─────────────────────────────────────────────────────────────────

/**
 * Abonnement payé (checkout.session.completed en mode abonnement) : premium
 * actif, tous les skins, badge. Rejoué : aucun nouvel événement.
 */
export async function activatePremium(
  deps: FulfillmentDeps,
  ctx: EventContext,
  actor: Actor,
  p: { userId: string; customerId: string | null; subscriptionId: string | null },
): Promise<void> {
  // Déjà actif pour cet abonnement (session confirmée deux fois) : rien à refaire,
  // et surtout pas d'effacement d'une résiliation programmée depuis
  const current = await customerOf(deps.db, p.userId);
  if (current?.premium && current.subscriptionId === p.subscriptionId) return;
  await deps.effects.setAllSkins(p.userId, true);
  await deps.effects.setPremium(p.userId, true);
  await deps.db.transaction(async (tx) => {
    const row = await lockCustomer(tx, p.userId);
    if (row?.premium && row.subscriptionId === p.subscriptionId) return;
    const since = row?.premium && row.premiumSince ? row.premiumSince : new Date();
    const values = {
      premium: true,
      premiumSince: since,
      subscriptionId: p.subscriptionId,
      cancelAtPeriodEnd: false,
      premiumEndDate: null,
      ...(p.customerId && !row?.stripeCustomerId ? { stripeCustomerId: p.customerId } : {}),
    };
    await tx
      .insert(customers)
      .values({ userId: p.userId, ...values })
      .onConflictDoUpdate({ target: customers.userId, set: { ...values, updatedAt: sql`now()` } });
    if (!row?.premium) {
      await appendEvent(tx, ctx, {
        type: 'billing.premium_activated',
        actor,
        aggregate: aggregate(p.userId),
        // TODO(worker) : e-mail de bienvenue premium (ancien PremiumActivatedEmail),
        // adresse lue dans identity par le futur service worker
        payload: { userId: p.userId, since: since.toISOString() },
      });
    }
  });
}

/**
 * Fin du premium (abonnement supprimé chez Stripe, ou résiliation sans
 * abonnement Stripe). `subscriptionId` : l'abonnement qui prend fin ; un
 * événement d'un ancien abonnement remplacé depuis est ignoré.
 */
export async function deactivatePremium(
  deps: FulfillmentDeps,
  ctx: EventContext,
  actor: Actor,
  p: { userId: string; subscriptionId: string | null; reason: string },
): Promise<'deactivated' | 'stale'> {
  const current = await customerOf(deps.db, p.userId);
  if (p.subscriptionId && current?.subscriptionId && current.subscriptionId !== p.subscriptionId)
    return 'stale';
  await deps.effects.setAllSkins(p.userId, false);
  await deps.effects.setPremium(p.userId, false);
  await deps.db.transaction(async (tx) => {
    const row = await lockCustomer(tx, p.userId);
    if (!row) return;
    if (p.subscriptionId && row.subscriptionId && row.subscriptionId !== p.subscriptionId) return;
    await tx
      .update(customers)
      .set({
        premium: false,
        subscriptionId: null,
        cancelAtPeriodEnd: false,
        premiumEndDate: null,
        updatedAt: sql`now()`,
      })
      .where(eq(customers.userId, p.userId));
    if (row.premium) {
      await appendEvent(tx, ctx, {
        type: 'billing.premium_deactivated',
        actor,
        aggregate: aggregate(p.userId),
        payload: { userId: p.userId, reason: p.reason },
      });
    }
  });
  return 'deactivated';
}

/**
 * Résiliation programmée ou annulée (portail Stripe, route unsubscribe) :
 * le premium reste actif jusqu'à la date de fin. Rejoué : aucun événement.
 */
export async function scheduleCancellation(
  db: Db,
  ctx: EventContext,
  actor: Actor,
  p: { userId: string; subscriptionId: string | null; endDate: Date | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCustomer(tx, p.userId);
    if (!row?.premium) return;
    if (p.subscriptionId && row.subscriptionId && row.subscriptionId !== p.subscriptionId) return;
    const scheduled = p.endDate !== null;
    const sameDate = (row.premiumEndDate?.getTime() ?? null) === (p.endDate?.getTime() ?? null);
    if (row.cancelAtPeriodEnd === scheduled && sameDate) return;
    await tx
      .update(customers)
      .set({
        cancelAtPeriodEnd: scheduled,
        premiumEndDate: p.endDate,
        // Abonnement retrouvé chez Stripe (client importé de l'ancienne app) : on le garde
        subscriptionId: row.subscriptionId ?? p.subscriptionId,
        updatedAt: sql`now()`,
      })
      .where(eq(customers.userId, p.userId));
    if (scheduled && !row.cancelAtPeriodEnd) {
      await appendEvent(tx, ctx, {
        type: 'billing.premium_cancellation_scheduled',
        actor,
        aggregate: aggregate(p.userId),
        // TODO(worker) : e-mail de résiliation (ancien PremiumCancelledEmail)
        payload: { userId: p.userId, endDate: p.endDate!.toISOString() },
      });
    }
  });
}

/** customer.subscription.updated : suit la résiliation programmée (ou annulée) depuis le portail. */
export async function syncSubscription(
  deps: FulfillmentDeps,
  ctx: EventContext,
  sub: Subscription,
): Promise<'synced' | 'unknown'> {
  const row = await subscriber(deps.db, sub);
  if (!row || row.subscriptionId !== sub.id) return 'unknown';
  await scheduleCancellation(deps.db, ctx, SYSTEM, {
    userId: row.userId,
    subscriptionId: sub.id,
    endDate: sub.cancel_at_period_end || sub.cancel_at ? cancellationDate(sub) : null,
  });
  return 'synced';
}

/** customer.subscription.deleted : fin du premium de l'abonné. */
export async function endSubscription(
  deps: FulfillmentDeps,
  ctx: EventContext,
  sub: Subscription,
): Promise<'deactivated' | 'stale' | 'unknown'> {
  const row = await subscriber(deps.db, sub);
  if (!row) return 'unknown';
  return deactivatePremium(deps, ctx, SYSTEM, {
    userId: row.userId,
    subscriptionId: sub.id,
    reason: 'subscription_deleted',
  });
}

/** Abonné d'un abonnement Stripe : par l'abonnement, sinon par le client (ancienne app). */
async function subscriber(db: Db, sub: Subscription): Promise<CustomerRow | undefined> {
  const [bySub] = await db.select().from(customers).where(eq(customers.subscriptionId, sub.id));
  if (bySub) return bySub;
  const customerId = idOf(sub.customer);
  return customerId ? customerByStripeId(db, customerId) : undefined;
}

// ─── Achats à l'unité ────────────────────────────────────────────────────────

/** Achat payé : skin ajouté à l'inventaire, achat marqué terminé, événement une seule fois. */
export async function completePurchase(
  deps: FulfillmentDeps,
  ctx: EventContext,
  actor: Actor,
  session: CheckoutSession,
): Promise<PurchaseRow | null> {
  let purchase = await purchaseOf(deps.db, session.id);
  if (!purchase) {
    // Session sans ligne locale (créée avant une restauration de la base…) :
    // reconstituée depuis les métadonnées posées par le service
    const m = session.metadata ?? {};
    const item = typeof m.skinId === 'string' ? findItemOfSession(m.type, m.skinId) : undefined;
    const amount = session.amount_total ?? item?.price ?? 0;
    if (!item || !isUuid(m.userId) || amount <= 0) return null;
    await deps.db
      .insert(purchases)
      .values({
        id: uuidv7(),
        userId: m.userId.toLowerCase(),
        kind: item.kind,
        itemId: item.id,
        amountCents: amount,
        currency: session.currency ?? 'eur',
        stripeSessionId: session.id,
      })
      .onConflictDoNothing();
    purchase = (await purchaseOf(deps.db, session.id))!;
  }
  if (purchase.status === 'completed') return purchase;

  if (purchase.kind === 'dice') await deps.effects.grantSkin(purchase.userId, purchase.itemId);
  // Cadre de jeton : pas encore de service des cadres. L'achat est gardé ici
  // (source de vérité) et publié ; le futur service le reprendra.

  return deps.db.transaction(async (tx) => {
    const [done] = await tx
      .update(purchases)
      .set({
        status: 'completed',
        completedAt: sql`now()`,
        stripePaymentIntentId: idOf(session.payment_intent),
      })
      .where(and(eq(purchases.id, purchase.id), sql`${purchases.status} <> 'completed'`))
      .returning();
    if (!done) return purchase;
    await rememberCustomer(tx, done.userId, idOf(session.customer));
    await appendEvent(tx, ctx, {
      type: 'billing.purchase_completed',
      actor,
      aggregate: { type: 'billing_purchase', id: done.id },
      payload: {
        purchaseId: done.id,
        userId: done.userId,
        kind: done.kind,
        itemId: done.itemId,
        amountCents: done.amountCents,
        currency: done.currency,
      },
    });
    return done;
  });
}

function findItemOfSession(type: unknown, skinId: string) {
  if (type === 'token') return itemOf('token', skinId);
  if (type === 'dice') return findItem(skinId);
  return undefined;
}

export async function purchaseOf(db: Db, sessionId: string): Promise<PurchaseRow | undefined> {
  const [row] = await db.select().from(purchases).where(eq(purchases.stripeSessionId, sessionId));
  return row;
}

/** checkout.session.expired : l'achat en attente ne sera jamais payé. */
export async function expirePurchase(db: Db, sessionId: string): Promise<void> {
  await db
    .update(purchases)
    .set({ status: 'expired' })
    .where(and(eq(purchases.stripeSessionId, sessionId), eq(purchases.status, 'pending')));
}

// ─── Session Checkout ────────────────────────────────────────────────────────

export type SessionOutcome = 'completed' | 'pending' | 'expired' | 'ignored';

/** Abonnement qui donne droit au premium (past_due : Stripe relance encore le paiement). */
const LIVE_SUBSCRIPTION = new Set<Subscription['status']>(['active', 'trialing', 'past_due']);

/**
 * Session Checkout terminée : premium ou achat, selon la métadonnée `type`
 * (même aiguillage que l'ancien webhook). Paiement différé non encore reçu
 * (payment_status unpaid) : en attente, checkout.session.async_payment_succeeded suivra.
 */
export async function fulfillCheckoutSession(
  deps: FulfillmentDeps,
  ctx: EventContext,
  actor: Actor,
  session: CheckoutSession,
): Promise<SessionOutcome> {
  if (session.status === 'expired') return 'expired';
  if (session.status !== 'complete' || session.payment_status === 'unpaid') return 'pending';
  const m = session.metadata ?? {};
  if (m.type === PREMIUM_TYPE) {
    if (!isUuid(m.userId)) return 'ignored';
    // Abonnement développé (confirmation au retour de Checkout) et déjà terminé :
    // une vieille session ne réactive jamais le premium
    const sub = session.subscription;
    if (sub && typeof sub === 'object' && !LIVE_SUBSCRIPTION.has(sub.status)) return 'completed';
    await activatePremium(deps, ctx, actor, {
      userId: m.userId.toLowerCase(),
      customerId: idOf(session.customer),
      subscriptionId: idOf(session.subscription),
    });
    return 'completed';
  }
  if (m.type === 'dice' || m.type === 'token') {
    return (await completePurchase(deps, ctx, actor, session)) ? 'completed' : 'ignored';
  }
  return 'ignored';
}
