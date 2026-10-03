/**
 * Module « invoices » : factures Stripe de l'appelant (ancienne route
 * /api/invoices, qui recevait le client Stripe dans le corps : ici, il est
 * lu dans la base à partir du jeton).
 *
 *   GET /v1/billing/invoices  →  { invoices: [{ id, number, date, amount,
 *       currency, status, description, hostedUrl, pdfUrl }] }
 *   24 dernières factures ; date en secondes Unix, montants en centimes.
 */
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { customerOf } from '../../payments/fulfillment.js';
import { callStripe, currentUser, requireStripe } from '../common.js';

const Invoice = z.object({
  id: z.string(),
  number: z.string().nullable(),
  date: z.number(),
  amount: z.number(),
  currency: z.string(),
  status: z.string().nullable(),
  description: z.string().nullable(),
  hostedUrl: z.string().nullable(),
  pdfUrl: z.string().nullable(),
});

const LIMIT = 24;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/billing/invoices',
    {
      preValidation: app.authenticate,
      schema: { response: { 200: z.object({ invoices: z.array(Invoice) }) } },
    },
    async (req, reply) => {
      const row = await customerOf(deps.db, currentUser(req));
      reply.header('cache-control', 'no-store');
      if (!row?.stripeCustomerId) return { invoices: [] };
      const stripe = requireStripe(deps);
      const list = await callStripe(req, () => stripe.listInvoices(row.stripeCustomerId!, LIMIT));
      return {
        invoices: list.map((inv) => ({
          id: inv.id ?? '',
          number: inv.number ?? null,
          date: inv.created,
          amount: inv.amount_paid ?? 0,
          currency: inv.currency,
          status: inv.status ?? null,
          description: inv.lines?.data?.[0]?.description ?? null,
          hostedUrl: inv.hosted_invoice_url ?? null,
          pdfUrl: inv.invoice_pdf ?? null,
        })),
      };
    },
  );
};
