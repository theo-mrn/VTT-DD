/**
 * Module « plans » : formules premium et leurs prix TTC, lus dans le
 * catalogue du service (mêmes montants que les prix Stripe de catalog:sync).
 *
 *   GET /v1/billing/plans  →  { currency, plans: [{ id, name, amount, interval }] }
 */
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CURRENCY, PLANS } from '../../catalog/catalog.js';
import type { Module } from '../../deps.js';

const Plan = z.object({
  id: z.enum(['monthly', 'annual']),
  name: z.string(),
  /** Centimes TTC par période. */
  amount: z.number(),
  interval: z.enum(['month', 'year']),
});

export const register: Module = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/v1/billing/plans',
    {
      preValidation: app.authenticate,
      schema: { response: { 200: z.object({ currency: z.string(), plans: z.array(Plan) }) } },
    },
    async () => ({
      currency: CURRENCY,
      plans: Object.values(PLANS).map(({ id, name, amount, interval }) => ({
        id,
        name,
        amount,
        interval,
      })),
    }),
  );
};
