/**
 * Module « checkout » : achat à l'unité d'un skin de dés ou d'un cadre de
 * jeton, et liste des achats.
 *
 *   POST /v1/billing/checkout   { itemId, returnUrl? }  →  { url }
 *       session Stripe Checkout (paiement unique) au prix Stripe de l'article
 *       (lookup_key), acheteur pris du jeton. itemId : skin (`bismuth`) ou
 *       cadre préfixé (`token_Token3`). 404 item_not_found, 400 item_free,
 *       409 already_owned.
 *
 *   GET /v1/billing/checkout/sessions/:sessionId  →  { status, kind, itemId }
 *       état d'une session de l'appelant au retour de Checkout. Une session
 *       payée dont le webhook n'est pas encore arrivé est confirmée ici (mêmes
 *       traitements idempotents) ; les droits partent sur le bus dans la foulée.
 *
 *   GET /v1/billing/purchases  →  { purchases: [...] }   achats payés ou remboursés
 *
 *   GET /v1/billing/token-frames  →  { all, frames: [{ id, name, price, owned }] }
 *       cadres du catalogue et possession, règle de l'ancienne app : premium,
 *       tous (`all`, cadres hors catalogue compris) ; sinon les gratuits et les
 *       achetés. Un cadre hors catalogue n'est ouvert que par le premium.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CURRENCY,
  findItem,
  itemOf,
  lineName,
  lookupKeyOf,
  TOKEN_FRAMES,
} from '../../catalog/catalog.js';
import { purchases } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { fulfillCheckoutSession } from '../../payments/checkout.js';
import { customerOf, PREMIUM_TYPE, userActor } from '../../payments/common.js';
import { activeOf, owns, rightsOf } from '../../payments/entitlements.js';
import { purchaseOf } from '../../payments/purchases.js';
import type { CheckoutSessionParams } from '../../stripe/client.js';
import {
  callStripe,
  checkoutUrls,
  currentUser,
  eventContext,
  isMissing,
  PAYMENT_RATE_LIMIT,
  paymentDeps,
  requirePrices,
  requireStripe,
  ReturnUrl,
  taxParams,
} from '../common.js';

const SessionStatus = z.object({
  status: z.enum(['pending', 'completed', 'expired']),
  kind: z.enum(['premium', 'dice', 'token']),
  itemId: z.string().nullable(),
});

const TokenFrames = z.object({
  /** Premium : tous les cadres, ceux du catalogue comme les autres. */
  all: z.boolean(),
  frames: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Centimes TTC ; 0 : gratuit. */
      price: z.number(),
      owned: z.boolean(),
    }),
  ),
});

const Purchase = z.object({
  id: z.string(),
  kind: z.enum(['dice', 'token']),
  itemId: z.string(),
  name: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(['completed', 'refunded']),
  completedAt: z.string(),
  refundedAt: z.string().nullable(),
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/billing/checkout',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: {
        body: z.object({ itemId: z.string().min(1).max(80), returnUrl: ReturnUrl }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const stripe = requireStripe(deps);
      const item = findItem(req.body.itemId);
      if (!item) throw new HttpError(404, 'Article introuvable', 'item_not_found');
      if (item.price <= 0)
        throw HttpError.badRequest('Cet article est gratuit, il est déjà à vous', 'item_free');

      const kind = item.kind === 'dice' ? 'dice_skin' : 'token_frame';
      // Premium : tous les dés et tous les cadres sont déjà possédés ; celui d'un code
      // s'arrête, l'article acheté reste
      const lasting = (await activeOf(db, userId, 'premium')).some((e) => e.source !== 'code');
      if (lasting || (await owns(db, userId, kind, item.id)))
        throw HttpError.conflict('Vous possédez déjà cet article', 'already_owned');

      const price = await callStripe(req, () => requirePrices(deps)(lookupKeyOf(item)));
      const customer = await customerOf(db, userId);
      const params: CheckoutSessionParams = {
        mode: 'payment',
        line_items: [{ price, quantity: 1 }],
        invoice_creation: { enabled: true, invoice_data: { metadata: { userId } } },
        // Un seul client Stripe par utilisateur : factures et portail regroupés
        ...(customer?.stripeCustomerId
          ? { customer: customer.stripeCustomerId }
          : { customer_creation: 'always' as const }),
        ...taxParams(config, !!customer?.stripeCustomerId),
        client_reference_id: userId,
        ...checkoutUrls(config, req.body.returnUrl),
        metadata: { skinId: item.id, type: item.kind, userId },
        payment_intent_data: { metadata: { userId, itemId: item.id, type: item.kind } },
      };
      const session = await callStripe(req, () => stripe.createCheckoutSession(params));
      if (!session.url) throw new HttpError(502, 'Paiement indisponible', 'stripe_error');

      await db
        .insert(purchases)
        .values({
          id: uuidv7(),
          userId,
          kind: item.kind,
          itemId: item.id,
          amountCents: item.price,
          currency: CURRENCY,
          stripeSessionId: session.id,
        })
        .onConflictDoNothing();
      return { url: session.url };
    },
  );

  r.get(
    '/v1/billing/checkout/sessions/:sessionId',
    {
      ...auth,
      schema: {
        params: z.object({
          sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{1,250}$/, 'Session Checkout invalide'),
        }),
        response: { 200: SessionStatus },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { sessionId } = req.params;
      const notFound = () => new HttpError(404, 'Session introuvable', 'session_not_found');

      const purchase = await purchaseOf(db, sessionId);
      if (purchase && purchase.userId !== userId) throw notFound();
      if (purchase && purchase.status !== 'pending')
        return {
          status: purchase.status === 'expired' ? ('expired' as const) : ('completed' as const),
          kind: purchase.kind,
          itemId: purchase.itemId,
        };

      const pd = paymentDeps(deps);
      const session = await callStripe(req, async () => {
        try {
          return await pd.stripe.retrieveCheckoutSession(sessionId);
        } catch (e) {
          if (isMissing(e)) throw notFound();
          throw e;
        }
      });
      const m = session.metadata ?? {};
      if (typeof m.userId !== 'string' || m.userId.toLowerCase() !== userId) throw notFound();
      let kind: 'premium' | 'dice' | 'token' | null = null;
      if (m.type === PREMIUM_TYPE) kind = 'premium';
      else if (m.type === 'dice' || m.type === 'token') kind = m.type;
      if (!kind) throw notFound();
      const itemId = kind === 'premium' ? null : (m.skinId ?? null);

      const outcome = await callStripe(req, () =>
        fulfillCheckoutSession(pd, eventContext(req), userActor(userId), session),
      );
      if (outcome === 'ignored') throw notFound();
      return { status: outcome, kind, itemId };
    },
  );

  r.get(
    '/v1/billing/purchases',
    { ...auth, schema: { response: { 200: z.object({ purchases: z.array(Purchase) }) } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const rows = await db
        .select()
        .from(purchases)
        .where(
          and(eq(purchases.userId, userId), inArray(purchases.status, ['completed', 'refunded'])),
        )
        .orderBy(desc(purchases.completedAt));
      reply.header('cache-control', 'no-store');
      return {
        purchases: rows.map((p) => {
          const item = itemOf(p.kind, p.itemId);
          return {
            id: p.id,
            kind: p.kind,
            itemId: p.itemId,
            name: item ? lineName(item) : p.itemId,
            amount: p.amountCents,
            currency: p.currency,
            status: p.status as 'completed' | 'refunded',
            completedAt: p.completedAt!.toISOString(),
            refundedAt: p.refundedAt?.toISOString() ?? null,
          };
        }),
      };
    },
  );

  r.get(
    '/v1/billing/token-frames',
    { ...auth, schema: { response: { 200: TokenFrames } } },
    async (req, reply) => {
      const rights = await rightsOf(db, currentUser(req));
      const bought = new Set(rights.tokenFrames);
      reply.header('cache-control', 'no-store');
      return {
        all: rights.premium,
        frames: TOKEN_FRAMES.map(({ id, name, price }) => ({
          id,
          name,
          price,
          owned: rights.premium || price <= 0 || bought.has(id),
        })),
      };
    },
  );
};
