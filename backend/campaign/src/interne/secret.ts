/**
 * Routes /internal : appelées par les autres services (character), jamais
 * relayées par la gateway. Elles n'ont pas de jeton utilisateur ; elles
 * exigent le secret partagé INTERNAL_API_SECRET dans l'en-tête
 * x-internal-secret, comparé à temps constant.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';

export const EN_TETE_SECRET_INTERNE = 'x-internal-secret';

/**
 * Comparaison à temps constant : les deux valeurs sont d'abord réduites à
 * leur SHA-256, pour que la durée ne dépende pas non plus de leur longueur.
 */
export function secretsEgaux(recu: string | undefined, attendu: string): boolean {
  if (typeof recu !== 'string') return false;
  const a = createHash('sha256').update(recu, 'utf8').digest();
  const b = createHash('sha256').update(attendu, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** preValidation : refuse (401) toute requête sans le bon secret, avant de lire le corps. */
export function exigerSecretInterne(secret: string) {
  return async (req: FastifyRequest) => {
    const recu = req.headers[EN_TETE_SECRET_INTERNE];
    if (!secretsEgaux(typeof recu === 'string' ? recu : undefined, secret)) {
      throw HttpError.unauthorized('Secret interne invalide');
    }
  };
}
