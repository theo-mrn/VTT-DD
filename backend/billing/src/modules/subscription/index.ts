/**
 * Module « subscription » : abonnement premium. Le client Stripe et
 * l'abonnement sont lus dans la base du service, jamais envoyés par le client.
 *
 *   GET  /v1/billing/me                    premium, formule, statut, échéance, résiliation
 *   POST /v1/billing/subscribe             { plan, returnUrl? }  →  { url }   session Checkout
 *   POST /v1/billing/subscription/cancel   résiliation en fin de période  →  { cancelAt }
 *        premium sans abonnement Stripe (importé de l'ancienne app) : fin immédiate
 *   POST /v1/billing/subscription/resume   annule une résiliation programmée
 *   POST /v1/billing/portal                { returnUrl? }  →  { url }   portail client Stripe
 *        (carte bancaire, changement de formule, factures)
 */
import { HttpError } from '@vtt/platform';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PLANS } from '../../catalog/catalog.js';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { SUBSCRIPTION_STATUSES } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { customerAggregate, customerOf, PREMIUM_TYPE, userActor } from '../../payments/common.js';
import { activeOf, hasPremium, publishRights, revoke } from '../../payments/entitlements.js';
import { currentSubscription, isLive, syncSubscription } from '../../payments/subscriptions.js';
import type { CheckoutSessionParams } from '../../stripe/client.js';
import {
  callStripe,
  checkoutUrls,
  currentUser,
  eventContext,
  PAYMENT_RATE_LIMIT,
  paymentDeps,
  requirePrices,
  ReturnUrl,
  taxParams,
} from '../common.js';

const Me = z.object({
  /** Stripe configuré sur ce serveur (sinon boutons de paiement indisponibles). */
  configured: z.boolean(),
  premium: z.boolean(),
  /** Origine du premium actif : abonnement, ancienne app, cadeau. */
  premiumSource: z.enum(['subscription', 'legacy', 'gift', 'purchase', 'code']).nullable(),
  premiumSince: z.string().nullable(),
  /** Premium à durée limitée seulement (code) : sa fin ; null s'il ne s'arrête pas seul. */
  premiumUntil: z.string().nullable(),
  /** Abonnement en cours, ou le dernier terminé. */
  subscription: z
    .object({
      plan: z.enum(['monthly', 'annual', 'legacy']),
      status: z.enum(SUBSCRIPTION_STATUSES),
      currentPeriodEnd: z.string().nullable(),
      /** Résilié : premium jusqu'à cette date. */
      cancelAt: z.string().nullable(),
      /** Prélèvement en échec : carte à mettre à jour (portail). */
      paymentIssue: z.boolean(),
    })
    .nullable(),
  /** Client Stripe connu : portail et factures disponibles. */
  hasCustomer: z.boolean(),
});

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function meOf(db: Db, userId: string, configured: boolean): Promise<z.infer<typeof Me>> {
  const [premium, sub, customer] = await Promise.all([
    activeOf(db, userId, 'premium'),
    currentSubscription(db, userId),
    customerOf(db, userId),
  ]);
  const first = premium.toSorted((a, b) => a.grantedAt.getTime() - b.grantedAt.getTime())[0];
  const ends = premium.map((e) => e.expiresAt);
  const until =
    ends.length && ends.every((d) => d)
      ? new Date(Math.max(...ends.map((d) => d!.getTime())))
      : null;
  return {
    configured,
    premium: premium.length > 0,
    premiumSource: first?.source ?? null,
    premiumSince: iso(first?.grantedAt),
    premiumUntil: iso(until),
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: iso(sub.currentPeriodEnd),
          cancelAt: iso(sub.cancelAt),
          paymentIssue: sub.status === 'past_due' || sub.status === 'unpaid',
        }
      : null,
    hasCustomer: !!customer?.stripeCustomerId,
  };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };

  r.get('/v1/billing/me', { ...auth, schema: { response: { 200: Me } } }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    return meOf(db, currentUser(req), !!deps.stripe);
  });

  r.post(
    '/v1/billing/subscribe',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: {
        body: z
          .object({ plan: z.enum(['monthly', 'annual']).default('monthly'), returnUrl: ReturnUrl })
          .default({ plan: 'monthly', returnUrl: '/' }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const pd = paymentDeps(deps);
      // Le premium offert par un code n'empêche pas de s'abonner : il expire de lui-même
      const premium = await activeOf(db, userId, 'premium');
      if (premium.some((e) => e.source !== 'code'))
        throw HttpError.conflict('Vous êtes déjà premium', 'already_premium');
      // Abonnement encore en vie sans premium (impayé en cours de relance…) : portail
      const sub = await currentSubscription(db, userId);
      if (sub && isLive(sub.status))
        throw HttpError.conflict('Un abonnement est déjà en cours', 'subscription_exists');

      const plan = PLANS[req.body.plan];
      const price = await callStripe(req, () => requirePrices(deps)(plan.lookupKey));
      const customer = await customerOf(db, userId);
      const params: CheckoutSessionParams = {
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        ...(customer?.stripeCustomerId ? { customer: customer.stripeCustomerId } : {}),
        ...taxParams(config, !!customer?.stripeCustomerId),
        client_reference_id: userId,
        ...checkoutUrls(config, req.body.returnUrl),
        metadata: { userId, type: PREMIUM_TYPE, plan: plan.id },
        // Retrouve l'utilisateur depuis l'abonnement et ses factures
        subscription_data: { metadata: { userId } },
      };
      const session = await callStripe(req, () => pd.stripe.createCheckoutSession(params));
      if (!session.url) throw new HttpError(502, 'Paiement indisponible', 'stripe_error');
      return { url: session.url };
    },
  );

  r.post(
    '/v1/billing/subscription/cancel',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: { response: { 200: z.object({ cancelAt: z.string().nullable() }) } },
    },
    async (req) => {
      const userId = currentUser(req);
      const sub = await currentSubscription(db, userId);

      if (sub && isLive(sub.status)) {
        if (sub.cancelAt) return { cancelAt: sub.cancelAt.toISOString() };
        const pd = paymentDeps(deps);
        await callStripe(req, () => pd.stripe.setCancelAtPeriodEnd(sub.id, true));
        await callStripe(req, () =>
          syncSubscription(pd, eventContext(req), userActor(userId), sub.id),
        );
        const after = await currentSubscription(db, userId);
        return { cancelAt: iso(after?.cancelAt) };
      }

      // Premium de l'ancienne app, sans abonnement Stripe : fin immédiate, comme avant
      const legacy = (await activeOf(db, userId, 'premium')).filter((e) => e.source === 'legacy');
      if (!legacy.length)
        throw new HttpError(404, 'Aucun abonnement trouvé à résilier', 'no_subscription');
      await db.transaction(async (tx) => {
        for (const e of legacy)
          await revoke(
            tx,
            { userId, kind: 'premium', source: 'legacy', sourceId: e.sourceId },
            'unsubscribed',
          );
        await publishRights(tx, eventContext(req), userActor(userId), userId);
        if (!(await hasPremium(tx, userId)))
          await appendEvent(tx, eventContext(req), {
            type: 'billing.premium_deactivated',
            actor: userActor(userId),
            aggregate: customerAggregate(userId),
            payload: { userId, status: 'unsubscribed' },
          });
      });
      return { cancelAt: null };
    },
  );

  r.post(
    '/v1/billing/subscription/resume',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: { response: { 200: z.object({ resumed: z.boolean() }) } },
    },
    async (req) => {
      const userId = currentUser(req);
      const sub = await currentSubscription(db, userId);
      if (!sub || !isLive(sub.status) || !sub.cancelAt)
        throw HttpError.conflict('Aucune résiliation à annuler', 'not_cancelled');
      const pd = paymentDeps(deps);
      await callStripe(req, () => pd.stripe.setCancelAtPeriodEnd(sub.id, false));
      await callStripe(req, () =>
        syncSubscription(pd, eventContext(req), userActor(userId), sub.id),
      );
      return { resumed: true };
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
      const pd = paymentDeps(deps);
      return callStripe(req, () =>
        pd.stripe.createPortalSession(
          row.stripeCustomerId!,
          `${config.APP_URL}${req.body.returnUrl}`,
        ),
      );
    },
  );
};
