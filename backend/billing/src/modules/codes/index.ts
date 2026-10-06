/**
 * Module « codes » : échange d'un code contre un droit (docs/paiement.md, « Codes »).
 *
 *   POST /v1/billing/codes/redeem   { code }  →  { kind, itemId, expiresAt }
 *       404 code_invalid, 409 code_expired | code_exhausted | code_already_redeemed |
 *       already_premium | already_owned. Limité à 10 essais par minute (codes devinés).
 */
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ENTITLEMENT_KINDS } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { userActor } from '../../payments/common.js';
import { redeemCode } from '../../payments/codes.js';
import { currentUser, eventContext } from '../common.js';

const REDEEM_RATE_LIMIT = {
  rateLimit: { max: 10, timeWindow: '1 minute' },
} as FastifyContextConfig;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post(
    '/v1/billing/codes/redeem',
    {
      preValidation: app.authenticate,
      config: REDEEM_RATE_LIMIT,
      schema: {
        body: z.object({ code: z.string().trim().min(1).max(64) }),
        response: {
          200: z.object({
            kind: z.enum(ENTITLEMENT_KINDS),
            itemId: z.string().nullable(),
            expiresAt: z.string().nullable(),
          }),
        },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      return redeemCode(deps.db, eventContext(req), userActor(userId), userId, req.body.code);
    },
  );
};
