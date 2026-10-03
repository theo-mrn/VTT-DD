/**
 * Erreurs des attaques : refus de character traduits pour l'API de campaign, et problèmes qui
 * portent plus que `detail` (chemins en conflit d'une annulation, messages par fiche).
 *
 * Le gestionnaire d'erreurs de la plateforme ne sérialise que les champs d'un `HttpError` : une
 * `ProblemError` est donc renvoyée par la route elle-même (`sendProblem`), au même format
 * (application/problem+json, `instance`, `requestId`) avec ses champs en plus.
 */
import { PROBLEM_CONTENT_TYPE } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CharacterError } from '../../clients/character.js';

export class ProblemError extends HttpError {
  constructor(
    status: number,
    title: string,
    code: string,
    detail: string,
    public readonly extra: Record<string, unknown>,
  ) {
    super(status, title, code, detail);
  }
}

export function sendProblem(reply: FastifyReply, req: FastifyRequest, e: ProblemError) {
  req.log.info({ status: e.status, code: e.code }, 'request rejected');
  return reply
    .code(e.status)
    .type(PROBLEM_CONTENT_TYPE)
    .send({
      type: 'about:blank',
      title: e.title,
      status: e.status,
      code: e.code,
      detail: e.detail,
      ...e.extra,
      instance: req.url,
      requestId: req.id,
    });
}

/** Exécute un traitement de route ; une `ProblemError` part avec ses champs en plus. */
export async function withProblems<T>(
  req: FastifyRequest,
  reply: FastifyReply,
  run: () => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ProblemError) return sendProblem(reply, req, e);
    throw e;
  }
}

/** Messages par fiche d'un refus de character (`errors: [{ characterId, message }]`). */
function errorsOf(problem: Record<string, unknown>) {
  const errors = problem.errors;
  if (!Array.isArray(errors)) return undefined;
  return errors.flatMap((x) => {
    const e = x as { characterId?: unknown; path?: unknown; message?: unknown };
    const path = typeof e.characterId === 'string' ? e.characterId : e.path;
    return typeof e.message === 'string'
      ? [{ path: typeof path === 'string' ? path : '/', message: e.message }]
      : [];
  });
}

/**
 * Refus ou panne de character → erreur de l'API de campaign (rien n'a été écrit) :
 * règles (422 `action_refused`), modification invalide (422 `invalid_modification`), fiche
 * introuvable (422 `character_not_found`), annulation en conflit (409 `revert_conflict`,
 * `conflicts`), panne (502 `character_unavailable`).
 */
export function characterFailure(e: unknown, log: FastifyRequest['log'], what: string): HttpError {
  if (e instanceof HttpError) return e;
  if (!(e instanceof CharacterError)) {
    log.error({ error: (e as Error).message }, `${what} : erreur inattendue`);
    return new HttpError(502, 'Service indisponible', 'character_unavailable');
  }
  if (e.code === 'revert_conflict')
    return new ProblemError(
      409,
      'Conflit',
      'revert_conflict',
      e.message || 'La fiche a changé depuis l’application',
      { conflicts: Array.isArray(e.problem.conflicts) ? e.problem.conflicts : [] },
    );
  if (e.status === 404) return new HttpError(422, 'Refusé', 'character_not_found', e.message);
  if (e.status === 422) {
    const invalid = e.code === 'modification_invalide';
    const errors = errorsOf(e.problem);
    return new ProblemError(
      422,
      invalid ? 'Modification invalide' : 'Action refusée',
      invalid ? 'invalid_modification' : 'action_refused',
      e.message,
      errors ? { errors } : {},
    );
  }
  if (e.rejected) return new HttpError(422, 'Refusé', e.code ?? 'character_rejected', e.message);
  log.error({ status: e.status, error: e.message }, `${what} : character injoignable`);
  return new HttpError(502, 'Service indisponible', 'character_unavailable');
}
