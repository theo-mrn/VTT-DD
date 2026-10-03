/**
 * Module « webhook » : événements Stripe (ancienne route /api/stripe-webhook).
 *
 *   POST /v1/billing/webhook   corps brut + en-tête stripe-signature
 *
 * Public (la gateway le laisse passer sans jeton) : c'est la signature,
 * vérifiée sur les octets exacts reçus avec STRIPE_WEBHOOK_SECRET, qui
 * authentifie Stripe. Signature absente ou fausse : 400, rien n'est lu.
 *
 * Idempotent : Stripe livre au moins une fois. Un événement déjà traité
 * (table processed_events) est acquitté sans aucun effet. Un traitement en
 * échec (dice ou identity injoignable…) répond 500 SANS marquer l'événement :
 * Stripe le relivre (jusqu'à 3 jours) et les effets, tous idempotents, sont
 * refaits. L'événement n'est marqué qu'une fois tout réussi.
 *
 *   checkout.session.completed, checkout.session.async_payment_succeeded
 *       achat payé (skin ajouté à l'inventaire) ou abonnement payé (premium)
 *   checkout.session.expired        achat en attente abandonné
 *   customer.subscription.updated   résiliation programmée ou annulée (portail)
 *   customer.subscription.deleted   fin du premium
 *   invoice.paid                    événement billing.invoice_paid (e-mail de facture à venir)
 *   invoice.payment_failed          journalisé
 */
import { HttpError } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { processedEvents } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import {
  customerByStripeId,
  endSubscription,
  expirePurchase,
  fulfillCheckoutSession,
  SYSTEM,
  syncSubscription,
} from '../../payments/fulfillment.js';
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
async function handle(deps: Deps, ctx: EventContext, event: StripeEvent): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return fulfillCheckoutSession(deps, ctx, SYSTEM, event.data.object);

    case 'checkout.session.expired':
      await expirePurchase(deps.db, event.data.object.id);
      return 'expired';

    case 'customer.subscription.updated':
      return syncSubscription(deps, ctx, event.data.object);

    case 'customer.subscription.deleted':
      return endSubscription(deps, ctx, event.data.object);

    case 'invoice.paid': {
      const invoice = event.data.object;
      const customerId = idOf(invoice.customer);
      const row = customerId ? await customerByStripeId(deps.db, customerId) : undefined;
      if (!row || !invoice.id) return 'unknown';
      await deps.db.transaction((tx) =>
        appendEvent(tx, ctx, {
          type: 'billing.invoice_paid',
          actor: SYSTEM,
          aggregate: { type: 'billing_customer', id: row.userId },
          // TODO(worker) : e-mail de facture (ancien InvoiceEmail) ; le worker relit
          // la facture chez Stripe (lien, PDF) : aucune URL de facture sur le bus
          payload: {
            userId: row.userId,
            invoiceId: invoice.id,
            number: invoice.number ?? null,
            amountPaid: invoice.amount_paid ?? 0,
            currency: invoice.currency,
          },
        }),
      );
      return 'recorded';
    }

    case 'invoice.payment_failed':
      return 'payment_failed';

    default:
      return 'ignored';
  }
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
          outcome = await handle(deps, eventContext(req), event);
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
