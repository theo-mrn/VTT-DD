/**
 * Marketplace (docs/marketplace.md § 5) : comptes Connect des créateurs et ventes de packs.
 *
 * - Un compte par créateur (`connected_accounts`) ; son état est publié en entier, versionné
 *   (`billing.connect_account_updated`), comme les droits : marketplace applique le dernier.
 * - Une vente par session Checkout (`marketplace_sales`) : charge de destination vers le compte
 *   du créateur, `on_behalf_of` (le créateur est le vendeur, la facture est émise à son nom),
 *   commission de la plateforme (`marketplaceFee`, @vtt/contracts).
 * - Vente payée, remboursée ou contestée : un événement sur le bus, marketplace accorde ou
 *   révoque l'acquisition. billing n'accorde aucun droit lui-même.
 */
import {
  CONNECT_ACCOUNT_UPDATED,
  MARKETPLACE_SALE_COMPLETED,
  MARKETPLACE_SALE_DISPUTED,
  MARKETPLACE_SALE_REFUNDED,
  marketplaceFee,
  uuidv7,
  type Actor,
  type MarketplaceCheckoutRequest,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../db/outbox.js';
import { connectedAccounts, marketplaceSales, type SaleRow } from '../db/schema.js';
import { idOf, type CheckoutSession, type CheckoutSessionParams } from '../stripe/client.js';
import type { ConnectApi, ConnectState } from '../stripe/connect.js';
import { customerOf, rememberCustomer, type PaymentDeps } from './common.js';

/** Type de session Checkout d'une vente (métadonnée `type`). */
export const MARKETPLACE_TYPE = 'marketplace';

export interface ConnectDeps extends PaymentDeps {
  connect: ConnectApi;
}

export async function accountOf(db: Db | Tx, userId: string) {
  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, userId));
  return row;
}

/** Le compte peut encaisser et verser : la vente est possible. */
export const isReady = (a: Pick<ConnectState, 'chargesEnabled' | 'payoutsEnabled'>) =>
  a.chargesEnabled && a.payoutsEnabled;

/**
 * Enregistre l'état d'un compte et publie l'état complet avec une version de plus (même
 * transaction). Toujours publié, même inchangé : un consommateur qui l'aurait manqué (profil de
 * créateur créé après) se réaligne au prochain rafraîchissement.
 */
export async function saveState(
  tx: Tx,
  ctx: EventContext,
  actor: Actor,
  userId: string,
  state: ConnectState,
): Promise<number> {
  const [row] = await tx
    .update(connectedAccounts)
    .set({
      chargesEnabled: state.chargesEnabled,
      payoutsEnabled: state.payoutsEnabled,
      detailsSubmitted: state.detailsSubmitted,
      requirementsDue: state.requirementsDue,
      stateVersion: sql`${connectedAccounts.stateVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(connectedAccounts.userId, userId))
    .returning({ version: connectedAccounts.stateVersion });
  if (!row) throw new Error(`compte connecté inconnu : ${userId}`);
  await appendEvent(tx, ctx, {
    type: CONNECT_ACCOUNT_UPDATED,
    actor,
    aggregate: { type: 'billing_connect_account', id: userId },
    payload: {
      userId,
      version: row.version,
      chargesEnabled: state.chargesEnabled,
      payoutsEnabled: state.payoutsEnabled,
      detailsSubmitted: state.detailsSubmitted,
    },
  });
  return row.version;
}

/** Compte d'un créateur : créé chez Stripe s'il manque (une seule fois par utilisateur). */
export async function ensureAccount(
  deps: ConnectDeps,
  ctx: EventContext,
  actor: Actor,
  r: { userId: string; displayName: string },
) {
  const existing = await accountOf(deps.db, r.userId);
  if (existing) return existing;
  const email = (await customerOf(deps.db, r.userId))?.email ?? null;
  // Même clé à chaque essai : un double clic ou une reprise ne crée pas deux comptes
  const created = await deps.connect.createAccount(
    { userId: r.userId, displayName: r.displayName, email },
    `connect-account-${r.userId}`,
  );
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(connectedAccounts)
      .values({ userId: r.userId, stripeAccountId: created.id })
      .onConflictDoNothing()
      .returning();
    if (!row) return (await accountOf(tx, r.userId))!;
    await saveState(tx, ctx, actor, r.userId, created.state);
    return (await accountOf(tx, r.userId))!;
  });
}

/** Relit un compte chez Stripe et publie son état. */
export async function syncAccount(
  deps: ConnectDeps,
  ctx: EventContext,
  actor: Actor,
  accountId: string,
): Promise<'synced' | 'unknown'> {
  const [row] = await deps.db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.stripeAccountId, accountId));
  if (!row) return 'unknown';
  const state = await deps.connect.retrieveAccount(accountId);
  await deps.db.transaction((tx) => saveState(tx, ctx, actor, row.userId, state));
  return 'synced';
}

const saleAggregate = (s: SaleRow) => ({ type: 'billing_marketplace_sale', id: s.id });
const salePayload = (s: SaleRow) => ({
  saleId: s.id,
  buyerId: s.buyerId,
  sellerId: s.sellerId,
  listingId: s.listingId,
  amountCents: s.amountCents,
  feeCents: s.feeCents,
  currency: s.currency,
  // Lu par le consommateur des e-mails (destinataire) : l'acheteur
  userId: s.buyerId,
});

export const sellerNotReady = () =>
  new HttpError(
    409,
    'Vente impossible',
    'seller_not_ready',
    'Le créateur ne peut pas encore vendre',
  );

/**
 * Session Checkout d'une vente, demandée par marketplace (qui a vérifié la fiche, le prix et
 * l'acheteur). Le compte du vendeur doit pouvoir encaisser.
 */
export async function startSale(
  deps: ConnectDeps,
  r: MarketplaceCheckoutRequest,
  urls: { success_url: string; cancel_url: string },
  extra: Partial<CheckoutSessionParams>,
): Promise<{ url: string }> {
  if (r.buyerId === r.sellerId) throw HttpError.conflict('Vente à soi-même', 'own_listing');
  const account = await accountOf(deps.db, r.sellerId);
  if (!account || !isReady(account)) throw sellerNotReady();
  const fee = marketplaceFee(r.priceCents);
  const customer = await customerOf(deps.db, r.buyerId);
  const metadata = {
    type: MARKETPLACE_TYPE,
    userId: r.buyerId,
    sellerId: r.sellerId,
    listingId: r.listingId,
  };
  const params: CheckoutSessionParams = {
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: r.currency,
          unit_amount: r.priceCents,
          tax_behavior: 'inclusive',
          product_data: { name: r.title, metadata: { listingId: r.listingId } },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      on_behalf_of: account.stripeAccountId,
      transfer_data: { destination: account.stripeAccountId },
      metadata,
    },
    // Facture émise au nom du créateur, le vendeur
    invoice_creation: {
      enabled: true,
      invoice_data: {
        issuer: { type: 'account', account: account.stripeAccountId },
        metadata: { userId: r.buyerId },
      },
    },
    ...(customer?.stripeCustomerId
      ? { customer: customer.stripeCustomerId }
      : { customer_creation: 'always' as const }),
    client_reference_id: r.buyerId,
    metadata,
    ...urls,
    ...extra,
  };
  const session = await deps.stripe.createCheckoutSession(params);
  if (!session.url) throw new HttpError(502, 'Paiement indisponible', 'stripe_error');
  await deps.db
    .insert(marketplaceSales)
    .values({
      id: uuidv7(),
      buyerId: r.buyerId,
      sellerId: r.sellerId,
      listingId: r.listingId,
      title: r.title,
      amountCents: r.priceCents,
      feeCents: fee,
      currency: r.currency,
      stripeAccountId: account.stripeAccountId,
      stripeSessionId: session.id,
    })
    .onConflictDoNothing();
  return { url: session.url };
}

export async function saleOf(db: Db | Tx, sessionId: string): Promise<SaleRow | undefined> {
  const [row] = await db
    .select()
    .from(marketplaceSales)
    .where(eq(marketplaceSales.stripeSessionId, sessionId));
  return row;
}

/** Vente payée : terminée, événement une seule fois. null : session inconnue du service. */
export async function completeSale(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  session: CheckoutSession,
): Promise<SaleRow | null> {
  const sale = await saleOf(deps.db, session.id);
  if (!sale) return null;
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .update(marketplaceSales)
      .set({
        status: 'completed',
        completedAt: sql`now()`,
        stripePaymentIntentId: idOf(session.payment_intent),
        consentAt: session.consent?.terms_of_service === 'accepted' ? sql`now()` : null,
      })
      .where(and(eq(marketplaceSales.id, sale.id), eq(marketplaceSales.status, 'pending')))
      .returning();
    if (!row) return sale;
    await rememberCustomer(
      tx,
      row.buyerId,
      idOf(session.customer),
      session.customer_details?.email,
    );
    await appendEvent(tx, ctx, {
      type: MARKETPLACE_SALE_COMPLETED,
      actor,
      aggregate: saleAggregate(row),
      payload: salePayload(row),
    });
    return row;
  });
}

/** Session expirée ou paiement différé refusé : la vente ne sera jamais payée. */
export async function expireSale(db: Db, sessionId: string): Promise<void> {
  await db
    .update(marketplaceSales)
    .set({ status: 'expired' })
    .where(
      and(eq(marketplaceSales.stripeSessionId, sessionId), eq(marketplaceSales.status, 'pending')),
    );
}

/**
 * Paiement d'une vente remboursé en totalité ou contesté : vente marquée, événement (marketplace
 * révoque l'acquisition). `ignored` : ce paiement n'est pas une vente.
 */
export async function withdrawSale(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  paymentIntent: string,
  reason: 'refund' | 'dispute',
): Promise<'withdrawn' | 'ignored'> {
  const [sale] = await deps.db
    .select()
    .from(marketplaceSales)
    .where(eq(marketplaceSales.stripePaymentIntentId, paymentIntent));
  if (!sale) return 'ignored';
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .update(marketplaceSales)
      .set(
        reason === 'refund'
          ? { status: 'refunded', refundedAt: sql`now()` }
          : { status: 'disputed' },
      )
      .where(and(eq(marketplaceSales.id, sale.id), eq(marketplaceSales.status, 'completed')))
      .returning();
    if (!row) return;
    await appendEvent(tx, ctx, {
      type: reason === 'refund' ? MARKETPLACE_SALE_REFUNDED : MARKETPLACE_SALE_DISPUTED,
      actor,
      aggregate: saleAggregate(row),
      payload: salePayload(row),
    });
  });
  return 'withdrawn';
}
