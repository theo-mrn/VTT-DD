/**
 * Factures Stripe : copie locale (liste du compte, e-mails) relue chez Stripe
 * à chaque événement. Événements : facture payée (une fois), échec d'un
 * prélèvement (à chaque tentative). Aucun lien de facture sur le bus : le
 * lecteur relit la ligne locale.
 */
import type { Actor } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { invoices, subscriptions, type InvoiceStatus } from '../db/schema.js';
import { idOf, type Invoice } from '../stripe/client.js';
import {
  customerAggregate,
  customerByStripeId,
  fromUnix,
  isUuid,
  type PaymentDeps,
} from './common.js';

const isMissing = (e: unknown) => (e as { code?: unknown })?.code === 'resource_missing';

/** Abonnement d'une facture (API 2025+ : porté par `parent`). */
export function subscriptionOfInvoice(invoice: Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (fromParent) return idOf(fromParent);
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  return idOf(legacy ?? null);
}

export type InvoiceTrigger = 'paid' | 'payment_failed' | 'updated';

/**
 * Recopie une facture relue chez Stripe. `unknown` : facture absente, ou
 * client Stripe inconnu du service (autre application du compte Stripe).
 */
export async function syncInvoice(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  invoiceId: string,
  trigger: InvoiceTrigger,
  opts: { quiet?: boolean } = {},
): Promise<'synced' | 'unknown'> {
  let invoice: Invoice;
  try {
    invoice = await deps.stripe.retrieveInvoice(invoiceId);
  } catch (e) {
    if (isMissing(e)) return 'unknown';
    throw e;
  }
  return recordInvoice(deps, ctx, actor, invoice, trigger, opts);
}

export async function recordInvoice(
  deps: Pick<PaymentDeps, 'db'>,
  ctx: EventContext,
  actor: Actor,
  invoice: Invoice,
  trigger: InvoiceTrigger,
  opts: { quiet?: boolean } = {},
): Promise<'synced' | 'unknown'> {
  if (!invoice.id) return 'unknown';
  const subscriptionId = subscriptionOfInvoice(invoice);
  const userId = await ownerOf(deps.db, invoice, subscriptionId);
  if (!userId) return 'unknown';
  const invoiceId = invoice.id;
  const line = invoice.lines?.data?.[0];

  await deps.db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .for('update');
    const values = {
      userId,
      subscriptionId,
      number: invoice.number ?? null,
      status: (invoice.status ?? 'draft') as InvoiceStatus,
      amountDue: invoice.amount_due ?? 0,
      amountPaid: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? 'eur',
      description: line?.description ?? invoice.description ?? null,
      hostedUrl: invoice.hosted_invoice_url ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
      periodStart: fromUnix(line?.period?.start),
      periodEnd: fromUnix(line?.period?.end),
    };
    await tx
      .insert(invoices)
      .values({ id: invoiceId, ...values, issuedAt: fromUnix(invoice.created) ?? new Date() })
      .onConflictDoUpdate({ target: invoices.id, set: { ...values, updatedAt: sql`now()` } });

    if (opts.quiet) return;
    const payload = {
      userId,
      invoiceId,
      subscriptionId,
      number: values.number,
      currency: values.currency,
    };
    // Facture devenue payée, quel que soit l'événement qui l'apprend : celle d'un achat est
    // créée déjà payée, et invoice.finalized arrive avant invoice.paid
    if (values.status === 'paid' && prev?.status !== 'paid')
      await appendEvent(tx, ctx, {
        type: 'billing.invoice_paid',
        actor,
        aggregate: customerAggregate(userId),
        payload: {
          ...payload,
          amountPaid: values.amountPaid,
          billingReason: invoice.billing_reason ?? null,
        },
      });
    if (trigger === 'payment_failed')
      await appendEvent(tx, ctx, {
        type: 'billing.invoice_payment_failed',
        actor,
        aggregate: customerAggregate(userId),
        payload: {
          ...payload,
          amountDue: values.amountDue,
          attemptCount: invoice.attempt_count ?? 0,
          nextAttemptAt: fromUnix(invoice.next_payment_attempt)?.toISOString() ?? null,
        },
      });
  });
  return 'synced';
}

/**
 * Utilisateur d'une facture : métadonnée posée par le service (sur la facture
 * d'un achat, ou recopiée de l'abonnement), sinon client Stripe, sinon
 * abonnement connus. La première facture d'un abonnement peut arriver avant
 * la session Checkout : la métadonnée suffit alors.
 */
async function ownerOf(
  db: PaymentDeps['db'],
  invoice: Invoice,
  subscriptionId: string | null,
): Promise<string | null> {
  const tagged = invoice.metadata?.userId ?? invoice.parent?.subscription_details?.metadata?.userId;
  if (isUuid(tagged)) return tagged.toLowerCase();
  const customerId = idOf(invoice.customer);
  const customer = customerId ? await customerByStripeId(db, customerId) : undefined;
  if (customer) return customer.userId;
  if (!subscriptionId) return null;
  const [sub] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId));
  return sub?.userId ?? null;
}
