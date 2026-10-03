/**
 * Module « premium » : statut premium affiché sur le profil (badge, bordures),
 * posé par le service billing, seule source de vérité de l'abonnement Stripe
 * (ancien champ users/{uid}.premium, écrit par le webhook Stripe).
 *
 *   PUT /internal/users/:userId/premium   { premium }
 *       réservé aux services (en-tête x-internal-secret, comparé à temps
 *       constant), jamais relayé par la gateway. Idempotent : sans changement,
 *       ni écriture ni événement. 404 si le compte n'existe pas. Absent si
 *       INTERNAL_API_SECRET n'est pas configuré.
 */
import { HttpError } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { profiles } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { secretsEgaux } from '../cles-api/cles.js';
import { EN_TETE_SECRET_INTERNE } from '../cles-api/index.js';

const eventContext = (req: FastifyRequest): EventContext => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

/** Pose le statut premium ; null si le compte n'existe pas. */
export async function setPremium(
  db: Db,
  ctx: EventContext,
  userId: string,
  premium: boolean,
): Promise<{ userId: string; premium: boolean } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ premium: profiles.premium })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for('update');
    if (!row) return null;
    if (row.premium !== premium) {
      await tx
        .update(profiles)
        .set({ premium, updatedAt: sql`now()` })
        .where(eq(profiles.userId, userId));
      await appendEvent(tx, ctx, {
        type: 'identity.premium_changed',
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'user', id: userId },
        visibility: 'owner',
        payload: { premium },
      });
    }
    return { userId, premium };
  });
}

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) return;
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.put(
    '/internal/users/:userId/premium',
    {
      // Appels de billing (peu d'IP) : limite large
      config: { rateLimit: { max: 3000, timeWindow: '1 minute' } },
      // Secret vérifié avant la validation : rien ne fuit sans lui
      preValidation: async (req) => {
        const received = req.headers[EN_TETE_SECRET_INTERNE];
        if (!secretsEgaux(typeof received === 'string' ? received : undefined, secret)) {
          throw HttpError.unauthorized('Secret interne invalide');
        }
      },
      schema: {
        hide: true,
        params: z.object({ userId: z.uuid().transform((s) => s.toLowerCase()) }),
        body: z.object({ premium: z.boolean() }),
        response: { 200: z.object({ userId: z.string(), premium: z.boolean() }) },
      },
    },
    async (req) => {
      const result = await setPremium(
        deps.db,
        eventContext(req),
        req.params.userId,
        req.body.premium,
      );
      if (!result) throw new HttpError(404, 'Ressource introuvable', 'user_not_found');
      return result;
    },
  );
};
