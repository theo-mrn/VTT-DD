/**
 * Module « checkout » : achat à l'unité d'un skin de dés ou d'un cadre de
 * jeton (ancienne route /api/checkout).
 *
 *   POST /v1/billing/checkout   { skinId, returnUrl? }  →  { url }
 *       session Stripe Checkout (paiement unique) ; le prix vient du
 *       catalogue du service, l'acheteur du jeton. skinId : identifiant du
 *       skin (`bismuth`) ou du cadre préfixé (`token_Token3`). 404
 *       item_not_found, 400 item_free, 409 already_owned.
 *
 *   GET /v1/billing/checkout/sessions/:sessionId  →  { status, kind, itemId }
 *       état d'une session de l'appelant au retour de Checkout (pages
 *       /checkout/success et /checkout/subscribe-success). Une session payée
 *       dont le webhook n'est pas encore arrivé est livrée ici (mêmes effets
 *       idempotents) : l'ancienne page de succès livrait elle-même l'achat.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CURRENCY, findItem, lineName } from '../../catalog/catalog.js';
import { EffectFailed } from '../../clients/effects.js';
import { purchases } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  customerOf,
  fulfillCheckoutSession,
  PREMIUM_TYPE,
  purchaseOf,
  userActor,
} from '../../payments/fulfillment.js';
import type { CheckoutSessionParams } from '../../stripe/client.js';
import {
  callStripe,
  currentUser,
  eventContext,
  isMissing,
  PAYMENT_RATE_LIMIT,
  requireStripe,
  ReturnUrl,
} from '../common.js';

const SessionStatus = z.object({
  status: z.enum(['pending', 'completed', 'expired']),
  kind: z.enum(['premium', 'dice', 'token']),
  itemId: z.string().nullable(),
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
        body: z.object({
          skinId: z.string().min(1).max(80),
          returnUrl: ReturnUrl,
        }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const stripe = requireStripe(deps);
      const item = findItem(req.body.skinId);
      if (!item) throw new HttpError(404, 'Article introuvable', 'item_not_found');
      if (item.price <= 0)
        throw HttpError.badRequest('Cet article est gratuit, il est déjà à vous', 'item_free');

      const customer = await customerOf(db, userId);
      const [owned] = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(
          and(
            eq(purchases.userId, userId),
            eq(purchases.kind, item.kind),
            eq(purchases.itemId, item.id),
            eq(purchases.status, 'completed'),
          ),
        )
        .limit(1);
      // Premium : tous les dés sont déjà possédés
      if (owned || (item.kind === 'dice' && customer?.premium))
        throw HttpError.conflict('Vous possédez déjà cet article', 'already_owned');

      const ret = encodeURIComponent(req.body.returnUrl);
      const params: CheckoutSessionParams = {
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: CURRENCY,
              product_data: {
                name: lineName(item),
                ...(item.description ? { description: item.description } : {}),
                ...(item.image ? { images: [item.image] } : {}),
              },
              unit_amount: item.price,
            },
            quantity: 1,
          },
        ],
        invoice_creation: { enabled: true },
        // Un seul client Stripe par utilisateur : factures et portail regroupés
        ...(customer?.stripeCustomerId
          ? { customer: customer.stripeCustomerId }
          : { customer_creation: 'always' as const }),
        client_reference_id: userId,
        success_url:
          `${config.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}` +
          `&skin_id=${encodeURIComponent(item.id)}&type=${item.kind}&returnUrl=${ret}`,
        cancel_url: `${config.APP_URL}/checkout/cancel?returnUrl=${ret}`,
        metadata: { skinId: item.id, type: item.kind, userId },
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
        return { status: purchase.status, kind: purchase.kind, itemId: purchase.itemId };

      const stripe = requireStripe(deps);
      const session = await callStripe(req, async () => {
        try {
          return await stripe.retrieveCheckoutSession(sessionId);
        } catch (e) {
          if (isMissing(e)) throw notFound();
          throw e;
        }
      });
      const m = session.metadata ?? {};
      if (typeof m.userId !== 'string' || m.userId.toLowerCase() !== userId) throw notFound();
      const type = m.type;
      const kind: 'premium' | 'dice' | 'token' | null =
        type === PREMIUM_TYPE ? 'premium' : type === 'dice' || type === 'token' ? type : null;
      if (!kind) throw notFound();
      const itemId = kind === 'premium' ? null : (m.skinId ?? null);

      try {
        const outcome = await fulfillCheckoutSession(
          deps,
          eventContext(req),
          userActor(userId),
          session,
        );
        if (outcome === 'ignored') throw notFound();
        return { status: outcome, kind, itemId };
      } catch (e) {
        // Livraison impossible pour l'instant (dice ou identity en panne) : le
        // webhook la refera ; la page de succès affiche « en cours ».
        if (!(e instanceof EffectFailed)) throw e;
        req.log.warn({ error: e.message }, 'livraison différée au webhook');
        return { status: 'pending' as const, kind, itemId };
      }
    },
  );
};
