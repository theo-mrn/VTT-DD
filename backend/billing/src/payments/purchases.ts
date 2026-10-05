/**
 * Achats à l'unité (skin de dés, cadre de jeton) : paiement, abandon,
 * remboursement et contestation. L'achat payé accorde un droit
 * (entitlements, source purchase) ; remboursé ou contesté, ce droit est révoqué.
 */
import { uuidv7, type Actor } from '@vtt/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { findItem, itemOf } from '../catalog/catalog.js';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { purchases, type PurchaseRow } from '../db/schema.js';
import { idOf, type CheckoutSession } from '../stripe/client.js';
import { isUuid, rememberCustomer, type PaymentDeps } from './common.js';
import { grant, publishRights, revoke } from './entitlements.js';

const entitlementOf = (p: PurchaseRow) => ({
  userId: p.userId,
  kind: p.kind === 'dice' ? ('dice_skin' as const) : ('token_frame' as const),
  itemId: p.itemId,
  source: 'purchase' as const,
  sourceId: p.id,
});

const purchaseAggregate = (p: PurchaseRow) => ({ type: 'billing_purchase', id: p.id });

const purchasePayload = (p: PurchaseRow) => ({
  purchaseId: p.id,
  userId: p.userId,
  kind: p.kind,
  itemId: p.itemId,
  amountCents: p.amountCents,
  currency: p.currency,
});

export async function purchaseOf(db: Db, sessionId: string): Promise<PurchaseRow | undefined> {
  const [row] = await db.select().from(purchases).where(eq(purchases.stripeSessionId, sessionId));
  return row;
}

/**
 * Achat payé : terminé, droit accordé, événement une seule fois, puis droits
 * appliqués dans dice. Rejoué : seuls les droits sont réappliqués. null :
 * session qui n'est pas un achat du service.
 */
export async function completePurchase(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  session: CheckoutSession,
): Promise<PurchaseRow | null> {
  const purchase = (await purchaseOf(deps.db, session.id)) ?? (await rebuild(deps.db, session));
  if (!purchase) return null;

  const done = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .update(purchases)
      .set({
        status: 'completed',
        completedAt: sql`now()`,
        stripePaymentIntentId: idOf(session.payment_intent),
        consentAt: session.consent?.terms_of_service === 'accepted' ? sql`now()` : null,
      })
      .where(and(eq(purchases.id, purchase.id), eq(purchases.status, 'pending')))
      .returning();
    if (!row) return purchase;
    await rememberCustomer(tx, row.userId, idOf(session.customer), session.customer_details?.email);
    if (await grant(tx, entitlementOf(row))) await publishRights(tx, ctx, actor, row.userId);
    await appendEvent(tx, ctx, {
      type: 'billing.purchase_completed',
      actor,
      aggregate: purchaseAggregate(row),
      payload: purchasePayload(row),
    });
    return row;
  });
  return done;
}

/**
 * Session sans ligne locale (créée avant une restauration de la base…) :
 * reconstituée depuis les métadonnées posées par le service.
 */
async function rebuild(db: Db, session: CheckoutSession): Promise<PurchaseRow | undefined> {
  const m = session.metadata ?? {};
  const item =
    typeof m.skinId !== 'string'
      ? undefined
      : m.type === 'token'
        ? itemOf('token', m.skinId)
        : m.type === 'dice'
          ? findItem(m.skinId)
          : undefined;
  const amount = session.amount_total ?? item?.price ?? 0;
  if (!item || !isUuid(m.userId) || amount <= 0) return undefined;
  await db
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
  return purchaseOf(db, session.id);
}

/** Session expirée ou paiement différé refusé : l'achat en attente ne sera jamais payé. */
export async function expirePurchase(db: Db, sessionId: string): Promise<void> {
  await db
    .update(purchases)
    .set({ status: 'expired' })
    .where(and(eq(purchases.stripeSessionId, sessionId), eq(purchases.status, 'pending')));
}

/**
 * Paiement remboursé en totalité ou contesté (charge.refunded,
 * charge.dispute.created) : droit révoqué. Un remboursement partiel ne retire
 * rien. `ignored` : paiement qui n'est pas un achat (facture d'abonnement).
 */
export async function withdrawPurchase(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  chargeId: string,
  reason: 'refund' | 'dispute',
): Promise<'withdrawn' | 'partial' | 'ignored'> {
  const charge = await deps.stripe.retrieveCharge(chargeId);
  if (reason === 'refund' && !charge.refunded) return 'partial';
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent) return 'ignored';
  const [purchase] = await deps.db
    .select()
    .from(purchases)
    .where(eq(purchases.stripePaymentIntentId, paymentIntent));
  if (!purchase) return 'ignored';

  await deps.db.transaction(async (tx) => {
    const revoked = await revoke(tx, entitlementOf(purchase), reason);
    if (revoked) await publishRights(tx, ctx, actor, purchase.userId);
    if (reason === 'refund')
      await tx
        .update(purchases)
        .set({ status: 'refunded', refundedAt: sql`now()` })
        .where(and(eq(purchases.id, purchase.id), eq(purchases.status, 'completed')));
    if (revoked)
      await appendEvent(tx, ctx, {
        type: reason === 'refund' ? 'billing.purchase_refunded' : 'billing.purchase_disputed',
        actor,
        aggregate: purchaseAggregate(purchase),
        payload: purchasePayload(purchase),
      });
  });
  return 'withdrawn';
}
