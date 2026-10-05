/**
 * Module « webhook » : événements Stripe.
 *
 *   POST /v1/billing/webhook   corps brut + en-tête stripe-signature
 *
 * Public (la gateway le laisse passer sans jeton) : c'est la signature,
 * vérifiée sur les octets exacts reçus avec STRIPE_WEBHOOK_SECRET, qui
 * authentifie Stripe. Signature absente ou fausse : 400, rien n'est lu.
 *
 * Idempotent : Stripe livre au moins une fois. Un événement déjà traité
 * (table processed_events) est acquitté sans aucun effet. Un traitement en
 * échec (Stripe, dice ou identity injoignable…) répond 500 SANS marquer
 * l'événement : Stripe le relivre (jusqu'à 3 jours) et tout est refait.
 *
 * Stripe ne garantit pas l'ordre : abonnements, factures et paiements sont
 * relus chez Stripe, seul leur identifiant est pris dans l'événement.
 *
 *   checkout.session.completed, …async_payment_succeeded   achat livré ou abonnement synchronisé
 *   checkout.session.async_payment_failed, …expired        achat abandonné
 *   customer.subscription.created/updated/deleted/paused/resumed   abonnement synchronisé
 *   invoice.paid, invoice.payment_failed, invoice.finalized, invoice.voided,
 *   invoice.marked_uncollectible                           facture recopiée
 *   charge.refunded                                        achat remboursé : droit retiré
 *   charge.dispute.created                                 achat contesté : droit retiré
 *   customer.updated                                       e-mail de facturation
 */
import { HttpError } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { Db } from '../../db/client.js';
import type { EventContext } from '../../db/outbox.js';
import { customers, processedEvents } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { fulfillCheckoutSession } from '../../payments/checkout.js';
import { SYSTEM, type PaymentDeps } from '../../payments/common.js';
import { syncInvoice, type InvoiceTrigger } from '../../payments/invoices.js';
import { expirePurchase, withdrawPurchase } from '../../payments/purchases.js';
import { syncSubscription } from '../../payments/subscriptions.js';
import { idOf, verifyWebhook, type StripeEvent } from '../../stripe/client.js';
import { eventContext } from '../common.js';

/** Corps d'un événement Stripe : quelques Ko ; au-delà, ce n'est pas Stripe. */
const BODY_LIMIT = 512 * 1024;

async function alreadyProcessed(db: Db, eventId: string): Promise<boolean> {
  const rows = await db.execute<{ one: number }>(
    sql`select 1 as one from ${processedEvents} where ${processedEvents.stripeEventId} = ${eventId}`,
  );
  return rows.rows.length > 0;
}

async function markProcessed(db: Db, event: StripeEvent) {
  await db
    .insert(processedEvents)
    .values({ stripeEventId: event.id, type: event.type })
    .onConflictDoNothing();
}

/** Traite un événement vérifié ; renvoie ce qui a été fait (journal). */
async function handle(deps: PaymentDeps, ctx: EventContext, event: StripeEvent): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return fulfillCheckoutSession(deps, ctx, SYSTEM, event.data.object);

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await expirePurchase(deps.db, event.data.object.id);
      return 'expired';

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return syncSubscription(deps, ctx, SYSTEM, event.data.object.id);

    case 'invoice.paid':
      return invoice(deps, ctx, event.data.object.id, 'paid');
    case 'invoice.payment_failed':
      return invoice(deps, ctx, event.data.object.id, 'payment_failed');
    case 'invoice.finalized':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
      return invoice(deps, ctx, event.data.object.id, 'updated');

    case 'charge.refunded':
      return withdrawPurchase(deps, ctx, SYSTEM, event.data.object.id, 'refund');
    case 'charge.dispute.created': {
      const charge = idOf(event.data.object.charge);
      if (!charge) return 'ignored';
      return withdrawPurchase(deps, ctx, SYSTEM, charge, 'dispute');
    }

    case 'customer.updated': {
      const c = event.data.object;
      await deps.db
        .update(customers)
        .set({ email: c.email ?? null, updatedAt: sql`now()` })
        .where(eq(customers.stripeCustomerId, c.id));
      return 'customer_updated';
    }

    default:
      return 'ignored';
  }
}

function invoice(
  deps: PaymentDeps,
  ctx: EventContext,
  id: string | undefined,
  trigger: InvoiceTrigger,
): Promise<string> {
  return id ? syncInvoice(deps, ctx, SYSTEM, id, trigger) : Promise.resolve('ignored');
}

export const register: Module = async (app, deps) => {
  const secret = deps.config.STRIPE_WEBHOOK_SECRET;

  // Contexte isolé : le corps reste brut (Buffer), la signature porte sur ces octets
  await app.register(async (scoped) => {
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: BODY_LIMIT },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: Buffer) => void) =>
        done(null, body),
    );

    scoped.post(
      '/v1/billing/webhook',
      {
        // Stripe envoie depuis quelques IP, parfois en rafale (relivraisons)
        config: { rateLimit: { max: 600, timeWindow: '1 minute' } } as FastifyContextConfig,
        schema: { hide: true },
      },
      async (req, reply) => {
        if (!secret || !deps.stripe)
          throw new HttpError(503, 'Paiement indisponible', 'billing_unconfigured');
        const pd: PaymentDeps = { db: deps.db, stripe: deps.stripe, effects: deps.effects };
        const signature = req.headers['stripe-signature'];
        const raw = req.body;
        if (typeof signature !== 'string' || !Buffer.isBuffer(raw))
          throw HttpError.badRequest('Signature Stripe absente', 'invalid_signature');

        let event: StripeEvent;
        try {
          event = verifyWebhook(raw, signature, secret);
        } catch {
          throw HttpError.badRequest('Signature Stripe invalide', 'invalid_signature');
        }

        if (await alreadyProcessed(deps.db, event.id)) {
          req.log.info({ stripeEvent: event.type }, 'événement Stripe déjà traité');
          return reply.send({ received: true, duplicate: true });
        }

        let outcome: string;
        try {
          outcome = await handle(pd, eventContext(req), event);
        } catch (e) {
          // Pas marqué : Stripe relivrera, et tout sera refait (effets idempotents)
          req.log.error(
            { stripeEvent: event.type, error: (e as Error).message },
            'événement Stripe en échec, relivraison attendue',
          );
          throw new HttpError(500, 'Erreur interne', 'webhook_retry');
        }
        await markProcessed(deps.db, event);
        req.log.info({ stripeEvent: event.type, outcome }, 'événement Stripe traité');
        return reply.send({ received: true });
      },
    );
  });
};
