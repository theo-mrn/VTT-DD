/**
 * Initiative (docs/combat.md § 4.4) : character lance l'action d'initiative du système pour
 * chaque participant et renvoie ses clés de tri ; campaign trie et garde le détail
 * (`CombatInitiative` : résumé lisible, paramètres retenus pour la relance, source, date).
 *
 * Paramètres d'un participant : ceux de son camp (`paramsBySide`), remplacés par les siens
 * (`params`, prioritaires) ; une relance individuelle reprend ceux enregistrés.
 */
import type { ActionParams, AttackVisibility, CombatInitiative, SideParams } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import { CharacterError, type CallOrigin, type CharacterClient } from '../../clients/character.js';
import type { Side } from '../../db/schema.js';
import type { Catalog } from '../../systems/catalog.js';

/** Action d'initiative du système de la campagne ; 422 `no_initiative` s'il n'en déclare pas. */
export function initiativeAction(catalog: Catalog, systemId: string): string {
  const action = catalog.system(systemId)?.initiative?.action;
  if (!action)
    throw new HttpError(
      422,
      'Refusé',
      'no_initiative',
      `Le système ${systemId} ne déclare pas d’initiative`,
    );
  return action;
}

/** Paramètres d'un participant : ceux de son camp, puis les siens. */
export function paramsFor(
  characterId: string,
  side: Side,
  input: { params?: Record<string, ActionParams>; paramsBySide?: SideParams },
): ActionParams {
  return {
    ...(input.paramsBySide?.[side] ?? {}),
    ...(input.params?.[characterId] ?? {}),
  };
}

/**
 * Résumé lisible d'un jet d'initiative, lu dans la structure du résultat du moteur (jet
 * numérique : total et formule ; pool : résultats du système), jamais dans une clé de jeu.
 */
export function initiativeSummary(result: unknown, sortKeys: number[]): string {
  const jet = (result as { jet?: Record<string, unknown> } | null)?.jet;
  if (jet && typeof jet.total === 'number') {
    const formula = typeof jet.formule === 'string' ? ` (${jet.formule})` : '';
    return `${jet.total}${formula}`;
  }
  const results = jet?.resultats;
  if (results && typeof results === 'object') {
    const parts = Object.entries(results as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k} ${v}`);
    if (parts.length) return parts.join(', ');
  }
  return sortKeys.join(' / ');
}

/**
 * Visibilité du jet d'initiative dans l'historique des dés (docs/combat.md § 4.4) : public pour
 * un héros vu des joueurs ; caché (MJ) pour un PNJ ou un participant caché, dont le jet trahirait
 * la présence et la statistique d'initiative.
 */
export const initiativeVisibility = (side: Side, visibleToPlayers = true): AttackVisibility =>
  side === 'players' && visibleToPlayers ? 'public' : 'gm';

export interface Rolled {
  characterId: string;
  sortKeys: number[];
  initiative: CombatInitiative;
}

/**
 * Lance l'initiative de ces participants (en parallèle) ; un refus des règles pour l'un
 * d'eux (422 `initiative_rejected`) ou une panne (502) fait tout échouer : rien n'est écrit.
 */
export async function rollInitiatives(
  character: CharacterClient,
  req: FastifyRequest,
  action: string,
  who: { characterId: string; params: ActionParams; visibility: AttackVisibility }[],
  origin: CallOrigin,
): Promise<Rolled[]> {
  const rolls = await Promise.allSettled(
    who.map((p) =>
      character.action(
        p.characterId,
        action,
        {
          apply: true,
          visibility: p.visibility,
          ...(Object.keys(p.params).length ? { params: p.params } : {}),
        },
        origin,
      ),
    ),
  );
  const failures = rolls.flatMap((roll, i) =>
    roll.status === 'rejected' ? [{ characterId: who[i]!.characterId, error: roll.reason }] : [],
  );
  if (failures.length) throw initiativeError(req, failures);
  const rolledAt = new Date().toISOString();
  return who.map((p, i) => {
    const { value } = rolls[i] as PromiseFulfilledResult<{ result: unknown; sortKeys?: number[] }>;
    const sortKeys = value.sortKeys ?? [];
    return {
      characterId: p.characterId,
      sortKeys,
      initiative: {
        summary: initiativeSummary(value.result, sortKeys),
        params: p.params,
        source: 'server',
        rolledAt,
        rollId: null,
      },
    };
  });
}

function initiativeError(
  req: FastifyRequest,
  failures: { characterId: string; error: unknown }[],
): HttpError {
  const rejected = failures.filter((f) => f.error instanceof CharacterError && f.error.rejected);
  if (rejected.length === failures.length) {
    return new HttpError(
      422,
      'Initiative refusée',
      'initiative_rejected',
      rejected.map((f) => `${f.characterId} : ${(f.error as Error).message}`).join(' ; '),
    );
  }
  const outage = failures.find((f) => !(f.error instanceof CharacterError && f.error.rejected))!;
  if (outage.error instanceof HttpError) return outage.error;
  req.log.error({ error: (outage.error as Error).message }, 'initiative : character injoignable');
  return new HttpError(502, 'Service indisponible', 'character_unavailable');
}

/** Initiative saisie par le MJ (dés lancés à la table). */
export const manualInitiative = (sortKeys: number[]): CombatInitiative => ({
  summary: sortKeys.join(' / '),
  params: {},
  source: 'manual',
  rolledAt: new Date().toISOString(),
  rollId: null,
});
