/**
 * Rattrapage depuis Stripe : abonnements et factures d'un client recopiés
 * dans la base (clients importés de l'ancienne app, webhook perdu). Sans
 * événement ni e-mail (quiet) : on recopie l'état, on ne rejoue pas l'histoire.
 * Les droits premium suivent l'état réel des abonnements.
 */
import { uuidv7 } from '@vtt/contracts';
import { SYSTEM, type PaymentDeps } from '../payments/common.js';
import { recordInvoice } from '../payments/invoices.js';
import { syncSubscription } from '../payments/subscriptions.js';

/** Factures relues par client : bien au-delà de l'historique d'un joueur. */
const INVOICE_LIMIT = 100;

export async function backfillCustomer(
  deps: PaymentDeps,
  userId: string,
  customerId: string,
): Promise<{ subscriptions: number; invoices: number }> {
  const ctx = { correlationId: uuidv7(), traceparent: null };
  const subs = await deps.stripe.listSubscriptions(customerId);
  for (const sub of subs)
    await syncSubscription(deps, ctx, SYSTEM, sub.id, { userId, quiet: true });
  const list = await deps.stripe.listInvoices(customerId, INVOICE_LIMIT);
  let invoices = 0;
  for (const inv of list)
    if ((await recordInvoice(deps, ctx, SYSTEM, inv, 'updated', { quiet: true })) === 'synced')
      invoices++;
  return { subscriptions: subs.length, invoices };
}
