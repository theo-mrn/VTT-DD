/**
 * Module « connect » : vente des packs de la marketplace (docs/marketplace.md § 5).
 *
 *   GET  /v1/billing/connect/me           vente activée ici, état du compte du créateur
 *   POST /v1/billing/connect/onboarding   { returnUrl? } : compte créé s'il manque, lien d'onboarding
 *   POST /v1/billing/connect/refresh      relit le compte chez Stripe (retour de l'onboarding)
 *   POST /v1/billing/connect/dashboard    lien de connexion au tableau de bord Express
 *   GET  /v1/billing/connect/sales        ventes du créateur
 *   POST /v1/billing/connect/webhook      événements des comptes connectés (signés, secret à part)
 *   POST /internal/marketplace/checkout   session de vente demandée par marketplace (secret interne)
 *
 * Tout est coupé tant que STRIPE_CONNECT=off (503 connect_disabled) : la v1 de la marketplace
 * tourne en gratuit seulement.
 */
import { MarketplaceCheckoutRequest, PAGES_FRONT } from '@vtt/contracts';
import { HttpError, requireInternalSecret } from '@vtt/platform';
import { desc, eq } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { marketplaceSales, processedEvents } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { customerOf, SYSTEM, userActor } from '../../payments/common.js';
import {
  accountOf,
  ensureAccount,
  isReady,
  startSale,
  syncAccount,
  type ConnectDeps,
} from '../../payments/marketplace.js';
import { verifyWebhook } from '../../stripe/client.js';
import { accountOfEvent } from '../../stripe/connect.js';
import {
  callStripe,
  checkoutUrls,
  currentUser,
  eventContext,
  PAYMENT_RATE_LIMIT,
  ReturnUrl,
  taxParams,
} from '../common.js';

const AccountState = z.object({
  status: z.enum(['pending', 'restricted', 'active']),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
  requirementsDue: z.number().int(),
});

const ConnectMe = z.object({
  /** Vente activée sur ce serveur (STRIPE_CONNECT=on et Stripe configuré). */
  enabled: z.boolean(),
  account: AccountState.nullable(),
});

const Sale = z.object({
  id: z.string(),
  listingId: z.string(),
  title: z.string(),
  amount: z.number(),
  fee: z.number(),
  net: z.number(),
  currency: z.string(),
  status: z.enum(['completed', 'refunded', 'disputed']),
  completedAt: z.string(),
});

const BODY_LIMIT = 512 * 1024;

export const connectDisabled = () =>
  new HttpError(
    503,
    'Vente indisponible',
    'connect_disabled',
    'La vente de packs n’est pas ouverte sur ce serveur',
  );

/** Connect activé et configuré, sinon 503. */
export function connectDeps(deps: Deps): ConnectDeps {
  if (deps.config.STRIPE_CONNECT !== 'on' || !deps.stripe || !deps.connect) throw connectDisabled();
  return { db: deps.db, stripe: deps.stripe, connect: deps.connect };
}

function stateView(a: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: number;
}) {
  return {
    status: isReady(a)
      ? ('active' as const)
      : a.detailsSubmitted
        ? ('restricted' as const)
        : ('pending' as const),
    chargesEnabled: a.chargesEnabled,
    payoutsEnabled: a.payoutsEnabled,
    detailsSubmitted: a.detailsSubmitted,
    requirementsDue: a.requirementsDue,
  };
}

async function alreadyProcessed(db: Db, eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: processedEvents.stripeEventId })
    .from(processedEvents)
    .where(eq(processedEvents.stripeEventId, eventId));
  return rows.length > 0;
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };
  const studio = (state: string) =>
    `${config.APP_URL}${PAGES_FRONT.marketplaceStudio}?connect=${state}`;

  r.get(
    '/v1/billing/connect/me',
    { ...auth, schema: { response: { 200: ConnectMe } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const account = await accountOf(db, userId);
      reply.header('cache-control', 'no-store');
      return {
        enabled: config.STRIPE_CONNECT === 'on' && Boolean(deps.stripe && deps.connect),
        account: account ? stateView(account) : null,
      };
    },
  );

  r.post(
    '/v1/billing/connect/onboarding',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: {
        body: z.strictObject({ displayName: z.string().trim().min(2).max(40) }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const cd = connectDeps(deps);
      const account = await callStripe(req, () =>
        ensureAccount(cd, eventContext(req), userActor(userId), {
          userId,
          displayName: req.body.displayName,
        }),
      );
      const url = await callStripe(req, () =>
        cd.connect.onboardingLink(account.stripeAccountId, studio('refresh'), studio('return')),
      );
      return { url };
    },
  );

  r.post(
    '/v1/billing/connect/refresh',
    { ...auth, config: PAYMENT_RATE_LIMIT, schema: { response: { 200: AccountState } } },
    async (req) => {
      const userId = currentUser(req);
      const cd = connectDeps(deps);
      const account = await accountOf(db, userId);
      if (!account) throw new HttpError(404, 'Ressource introuvable', 'connect_account_not_found');
      await callStripe(req, () =>
        syncAccount(cd, eventContext(req), userActor(userId), account.stripeAccountId),
      );
      return stateView((await accountOf(db, userId))!);
    },
  );

  r.post(
    '/v1/billing/connect/dashboard',
    {
      ...auth,
      config: PAYMENT_RATE_LIMIT,
      schema: { response: { 200: z.object({ url: z.string() }) } },
    },
    async (req) => {
      const userId = currentUser(req);
      const cd = connectDeps(deps);
      const account = await accountOf(db, userId);
      if (!account) throw new HttpError(404, 'Ressource introuvable', 'connect_account_not_found');
      const url = await callStripe(req, () => cd.connect.dashboardLink(account.stripeAccountId));
      return { url };
    },
  );

  r.get(
    '/v1/billing/connect/sales',
    { ...auth, schema: { response: { 200: z.object({ sales: z.array(Sale) }) } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const rows = await db
        .select()
        .from(marketplaceSales)
        .where(eq(marketplaceSales.sellerId, userId))
        .orderBy(desc(marketplaceSales.createdAt))
        .limit(200);
      reply.header('cache-control', 'no-store');
      return {
        sales: rows
          .filter((s) => s.completedAt && s.status !== 'pending' && s.status !== 'expired')
          .map((s) => ({
            id: s.id,
            listingId: s.listingId,
            title: s.title,
            amount: s.amountCents,
            fee: s.feeCents,
            net: s.amountCents - s.feeCents,
            currency: s.currency,
            status: s.status as 'completed' | 'refunded' | 'disputed',
            completedAt: s.completedAt!.toISOString(),
          })),
      };
    },
  );

  // Session de vente : appelée par marketplace seulement (jamais relayée par la gateway)
  const secret = config.INTERNAL_API_SECRET;
  if (secret)
    r.post(
      '/internal/marketplace/checkout',
      {
        preValidation: requireInternalSecret(secret),
        config: { rateLimit: false } as FastifyContextConfig,
        schema: {
          hide: true,
          body: MarketplaceCheckoutRequest,
          response: { 200: z.object({ url: z.string() }) },
        },
      },
      async (req) => {
        const cd = connectDeps(deps);
        const buyer = req.body.buyerId.toLowerCase();
        const customer = await customerOf(db, buyer);
        return callStripe(req, () =>
          startSale(
            cd,
            { ...req.body, buyerId: buyer, sellerId: req.body.sellerId.toLowerCase() },
            checkoutUrls(config, req.body.returnUrl),
            taxParams(config, Boolean(customer?.stripeCustomerId)),
          ),
        );
      },
    );
  else app.log.warn('INTERNAL_API_SECRET absent : vente des packs indisponible');

  // Événements des comptes connectés : corps brut (la signature porte sur ces octets)
  await app.register(async (scoped) => {
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: BODY_LIMIT },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: Buffer) => void) =>
        done(null, body),
    );
    scoped.post(
      '/v1/billing/connect/webhook',
      {
        config: { rateLimit: { max: 600, timeWindow: '1 minute' } } as FastifyContextConfig,
        schema: { hide: true },
      },
      async (req, reply) => {
        const webhookSecret = config.STRIPE_CONNECT_WEBHOOK_SECRET;
        if (!webhookSecret) throw connectDisabled();
        const cd = connectDeps(deps);
        const signature = req.headers['stripe-signature'];
        const raw = req.body;
        if (typeof signature !== 'string' || !Buffer.isBuffer(raw))
          throw HttpError.badRequest('Signature Stripe absente', 'invalid_signature');
        let event: { id: string; type: string };
        try {
          // Vérifie la signature ; événement léger v2 ou instantané v1, même en-tête
          event = verifyWebhook(raw, signature, webhookSecret) as unknown as {
            id: string;
            type: string;
          };
        } catch {
          throw HttpError.badRequest('Signature Stripe invalide', 'invalid_signature');
        }
        if (await alreadyProcessed(db, event.id))
          return reply.send({ received: true, duplicate: true });

        const accountId = accountOfEvent(event);
        let outcome = 'ignored';
        if (accountId) {
          try {
            outcome = await syncAccount(cd, eventContext(req), SYSTEM, accountId);
          } catch (e) {
            req.log.error(
              { stripeEvent: event.type, error: (e as Error).message },
              'événement Connect en échec, relivraison attendue',
            );
            throw new HttpError(500, 'Erreur interne', 'webhook_retry');
          }
        }
        await db
          .insert(processedEvents)
          .values({ stripeEventId: event.id, type: event.type })
          .onConflictDoNothing();
        req.log.info({ stripeEvent: event.type, outcome }, 'événement Connect traité');
        return reply.send({ received: true });
      },
    );
  });
};
