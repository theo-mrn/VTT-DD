/** Aides partagées par les routes : utilisateur, contexte d'événement, droits, erreurs. */
import type { Actor } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyContextConfig, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';

export const Uuid = (message = 'Identifiant invalide') =>
  z.uuid(message).transform((s) => s.toLowerCase());

export const IdParams = z.object({ id: Uuid() });

export const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();

/**
 * Utilisateur d'une session (pas d'une clé d'API) : acheter, publier, modérer exigent une
 * personne connectée, une clé qui fuite ne doit rien vendre ni rien acheter.
 */
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

/** Auteur d'un événement hors campagne. */
export const userActor = (userId: string): Actor => ({ userId, role: 'user', characterId: null });
/** Auteur d'un événement dans une campagne (installation : le MJ). */
export const gmActor = (userId: string): Actor => ({ userId, role: 'gm', characterId: null });
export const SYSTEM: Actor = { userId: null, role: 'system', characterId: null };

export const isModerator = (deps: Pick<Deps, 'config'>, userId: string) =>
  deps.config.MARKETPLACE_MODERATORS.includes(userId);

/** Modérateur, sinon 403. */
export function requireModerator(deps: Pick<Deps, 'config'>, req: FastifyRequest): string {
  const userId = sessionUser(req);
  if (!isModerator(deps, userId)) throw HttpError.forbidden('Réservé aux modérateurs');
  return userId;
}

export const notFound = (what = 'Pack introuvable') =>
  new HttpError(404, 'Ressource introuvable', 'listing_not_found', what);

/** Écriture concurrente (version périmée) : 409 version_conflict. */
export const versionConflict = () =>
  HttpError.conflict('Modifié entre-temps : rechargez la page', 'version_conflict');

export const PROBLEM = 'application/problem+json';

/** Réponse problem+json avec des champs en plus (422 asset_not_allowed { urls }). */
export function sendProblem(
  reply: FastifyReply,
  status: number,
  title: string,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return reply
    .code(status)
    .type(PROBLEM)
    .send({ type: 'about:blank', title, status, code, ...extra });
}

/** Débit par minute et par IP d'une route. */
export const perMinute = (max: number) =>
  ({ rateLimit: { max, timeWindow: '1 minute' } }) as FastifyContextConfig;
export const perHour = (max: number) =>
  ({ rateLimit: { max, timeWindow: '1 hour' } }) as FastifyContextConfig;

/** Moyenne affichée (une décimale), null sans avis. */
export const averageRating = (count: number, sum: number) =>
  count > 0 ? Math.round((sum / count) * 10) / 10 : null;

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
