/**
 * Module « subscription » : abonnement premium (anciennes routes
 * /api/subscribe, /api/unsubscribe et /api/stripe-portal). Le client Stripe
 * et l'abonnement sont lus dans la base du service, jamais envoyés par le client.
 *
 *   GET  /v1/billing/me            état de l'abonnement de l'appelant
 *   POST /v1/billing/subscribe     { returnUrl? }  →  { url }   session Checkout (abonnement)
 *   POST /v1/billing/unsubscribe   →  { success, message, cancelAt }
 *        résiliation en fin de période ; sans abonnement Stripe (premium
 *        importé ou offert), fin immédiate du premium, comme l'ancienne app
 *   POST /v1/billing/portal        { returnUrl? }  →  { url }   portail client Stripe
 */
import { HttpError } from '@vtt/platform';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CURRENCY, PREMIUM } from '../../catalog/catalog.js';
import { EffectFailed } from '../../clients/effects.js';
import type { Module } from '../../deps.js';
import {
  customerOf,
  deactivatePremium,
  PREMIUM_TYPE,
  scheduleCancellation,
  userActor,
} from '../../payments/fulfillment.js';
import { cancellationDate, type CheckoutSessionParams } from '../../stripe/client.js';
import {
  callStripe,
  currentUser,
  eventContext,
  PAYMENT_RATE_LIMIT,
  requireStripe,
  ReturnUrl,
  unixSeconds,
} from '../common.js';

const Me = z.object({
  /** Stripe configuré sur ce serveur (sinon boutons de paiement indisponibles). */
  configured: z.boolean(),
  premium: z.boolean(),
  premiumSince: z.string().nullable(),
  /** Résilié : premium actif jusqu'à premiumEndDate. */
  cancelAtPeriodEnd: z.boolean(),
  premiumEndDate: z.string().nullable(),
  /** Client Stripe connu : portail et factures disponibles. */
  hasCustomer: z.boolean(),
  hasSubscription: z.boolean(),
  monthlyPriceCents: z.number(),
});

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };

  r.get('/v1/billing/me', { ...auth, schema: { response: { 200: Me } } }, async (req, reply) => {
    const row = await customerOf(db, currentUser(req));
    reply.header('cache-control', 'no-store');
    return {
      configured: !!deps.stripe,
      premium: row?.premium ?? false,
      premiumSince: iso(row?.premiumSince),
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
      premiumEndDate: iso(row?.premiumEndDate),
      hasCustomer: !!row?.stripeCustomerId,
      hasSubscription: !!row?.subscriptionId,
      monthlyPriceCents: PREMIUM.monthlyPriceCents,
    };
  });

  r.post(
    '/v1/billing/subscribe',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: {
        body: z.object({ returnUrl: ReturnUrl }).default({ returnUrl: '/' }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const stripe = requireStripe(deps);
      const row = await customerOf(db, userId);
      if (row?.premium) throw HttpError.conflict('Vous êtes déjà premium', 'already_premium');

      const ret = encodeURIComponent(req.body.returnUrl);
      const params: CheckoutSessionParams = {
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          config.STRIPE_PREMIUM_PRICE_ID
            ? { price: config.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }
            : {
                price_data: {
                  currency: CURRENCY,
                  product_data: { name: PREMIUM.name, description: PREMIUM.description },
                  unit_amount: PREMIUM.monthlyPriceCents,
                  recurring: { interval: 'month' },
                },
                quantity: 1,
              },
        ],
        ...(row?.stripeCustomerId ? { customer: row.stripeCustomerId } : {}),
        client_reference_id: userId,
        success_url: `${config.APP_URL}/checkout/subscribe-success?session_id={CHECKOUT_SESSION_ID}&returnUrl=${ret}`,
        cancel_url: `${config.APP_URL}/checkout/cancel?returnUrl=${ret}`,
        metadata: { userId, type: PREMIUM_TYPE },
        // Retrouve l'utilisateur depuis les événements de l'abonnement lui-même
        subscription_data: { metadata: { userId } },
      };
      const session = await callStripe(req, () => stripe.createCheckoutSession(params));
      if (!session.url) throw new HttpError(502, 'Paiement indisponible', 'stripe_error');
      return { url: session.url };
    },
  );

  r.post(
    '/v1/billing/unsubscribe',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: {
        response: {
          200: z.object({ success: z.boolean(), message: z.string(), cancelAt: z.number() }),
        },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const row = await customerOf(db, userId);
      if (!row?.premium)
        throw new HttpError(404, 'Aucun abonnement trouvé à résilier', 'no_subscription');
      if (row.cancelAtPeriodEnd)
        return {
          success: true,
          message: 'Abonnement déjà résilié',
          cancelAt: unixSeconds(row.premiumEndDate),
        };

      let subscriptionId = row.subscriptionId;
      // Client Stripe sans abonnement connu (ancienne app) : on cherche son abonnement actif
      if (!subscriptionId && row.stripeCustomerId && deps.stripe) {
        const stripe = deps.stripe;
        const active = await callStripe(req, () =>
          stripe.activeSubscriptions(row.stripeCustomerId!),
        );
        subscriptionId = active[0]?.id ?? null;
      }

      if (subscriptionId) {
        const stripe = requireStripe(deps);
        const sub = await callStripe(req, () => stripe.cancelAtPeriodEnd(subscriptionId));
        const endDate = cancellationDate(sub) ?? new Date();
        await scheduleCancellation(db, eventContext(req), userActor(userId), {
          userId,
          subscriptionId,
          endDate,
        });
        return {
          success: true,
          message: 'Abonnement résilié avec succès',
          cancelAt: unixSeconds(endDate),
        };
      }

      // Pas d'abonnement Stripe : fin immédiate du premium, comme l'ancienne app
      try {
        await deactivatePremium(deps, eventContext(req), userActor(userId), {
          userId,
          subscriptionId: null,
          reason: 'unsubscribed',
        });
      } catch (e) {
        if (!(e instanceof EffectFailed)) throw e;
        req.log.warn({ error: e.message }, 'résiliation impossible : effets indisponibles');
        throw new HttpError(
          503,
          'Service indisponible',
          'effects_unavailable',
          'Réessayez dans un instant',
        );
      }
      return { success: true, message: 'Abonnement résilié avec succès', cancelAt: 0 };
    },
  );

  r.post(
    '/v1/billing/portal',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: {
        body: z.object({ returnUrl: ReturnUrl }).default({ returnUrl: '/' }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const row = await customerOf(db, userId);
      if (!row?.stripeCustomerId)
        throw new HttpError(404, 'Aucun client Stripe', 'no_customer', 'Aucun paiement enregistré');
      const stripe = requireStripe(deps);
      return callStripe(req, () =>
        stripe.createPortalSession(row.stripeCustomerId!, `${config.APP_URL}${req.body.returnUrl}`),
      );
    },
  );
};
