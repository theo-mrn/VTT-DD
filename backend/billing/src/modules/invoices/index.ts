/**
 * Module « invoices » : factures de l'appelant, lues dans la copie locale
 * (alimentée par le webhook et stripe:backfill), sans appel à Stripe.
 *
 *   GET /v1/billing/invoices  →  { invoices: [{ id, number, date, amount,
 *       currency, status, description, hostedUrl, pdfUrl }] }
 *   Factures finalisées (brouillons exclus), les plus récentes d'abord ;
 *   date en secondes Unix, montants en centimes.
 */
import { and, desc, eq, ne } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { invoices } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { currentUser } from '../common.js';

const Invoice = z.object({
  id: z.string(),
  number: z.string().nullable(),
  date: z.number(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  hostedUrl: z.string().nullable(),
  pdfUrl: z.string().nullable(),
});

const LIMIT = 100;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/billing/invoices',
    {
      preValidation: app.authenticate,
      schema: { response: { 200: z.object({ invoices: z.array(Invoice) }) } },
    },
    async (req, reply) => {
      const rows = await deps.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.userId, currentUser(req)), ne(invoices.status, 'draft')))
        .orderBy(desc(invoices.issuedAt))
        .limit(LIMIT);
      reply.header('cache-control', 'no-store');
      return {
        invoices: rows.map((inv) => ({
          id: inv.id,
          number: inv.number,
          date: Math.floor(inv.issuedAt.getTime() / 1000),
          amount: inv.status === 'paid' ? inv.amountPaid : inv.amountDue,
          currency: inv.currency,
          status: inv.status,
          description: inv.description,
          hostedUrl: inv.hostedUrl,
          pdfUrl: inv.pdfUrl,
        })),
      };
    },
  );
};
