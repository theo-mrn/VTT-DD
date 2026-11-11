/** Aides partagées par les routes : utilisateur, contexte d'événement, limites, erreurs. */
import type { Actor } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import { z } from 'zod';

export const IdParams = z.object({ id: z.uuid().transform((s) => s.toLowerCase()) });

export const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();

/** Session seulement : une clé d'API qui fuite ne doit pas emporter une campagne entière. */
export function sessionUser(req: FastifyRequest): string {
  if (req.user!.roles.includes('api'))
    throw new HttpError(
      403,
      'Accès refusé',
      'api_key_forbidden',
      'Cette action exige une session, pas une clé d’API',
    );
  return currentUser(req);
}

export const eventContext = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const userActor = (userId: string): Actor => ({ userId, role: 'user', characterId: null });
export const gmActor = (userId: string): Actor => ({ userId, role: 'gm', characterId: null });
export const SYSTEM: Actor = { userId: null, role: 'system', characterId: null };

export const perMinute = (max: number) =>
  ({ rateLimit: { max, timeWindow: '1 minute' } }) as FastifyContextConfig;

export const unavailable = () =>
  new HttpError(
    503,
    'Service indisponible',
    'archive_unavailable',
    'Export et import indisponibles',
  );
