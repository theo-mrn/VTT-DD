/**
 * Routes /internal : appelées par les autres services, jamais relayées par la gateway. Elles
 * exigent le secret partagé INTERNAL_API_SECRET dans l'en-tête x-internal-secret, comparé à temps
 * constant.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { HttpError } from './middleware/error-handler.js';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/** Comparaison à temps constant, sur les SHA-256 (la durée ne dépend pas de la longueur). */
export function internalSecretsMatch(received: string | undefined, expected: string): boolean {
  if (typeof received !== 'string') return false;
  const a = createHash('sha256').update(received, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** preValidation : refuse (401) toute requête sans le bon secret, avant de lire le corps. */
export function requireInternalSecret(secret: string) {
  return async (req: FastifyRequest) => {
    const received = req.headers[INTERNAL_SECRET_HEADER];
    if (!internalSecretsMatch(typeof received === 'string' ? received : undefined, secret))
      throw HttpError.unauthorized('Secret interne invalide');
  };
}
