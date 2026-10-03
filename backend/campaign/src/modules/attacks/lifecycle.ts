/**
 * Cycle de vie d'une attaque (docs/combat.md § 5.1), sans base ni réseau : statut de l'attaque
 * et de chaque cible après la préparation, les réactions, la résolution et les décisions ;
 * tour et défauts de la déclaration (§ 5.2, § 9.2).
 *
 *   déclarer ─► awaiting_reactions ─► awaiting_dice ─► pending ─► applied | dismissed
 *   (auteur ou MJ, avant la résolution) ─► cancelled ;   refus de toutes les cibles ─► failed
 *
 * `awaiting_dice` : des étapes de dés sont à lancer (`pendingSteps` : le jet, puis les dégâts
 * des cibles touchées, puis la table), une à la fois, par l'attaquant (§ 6). « Résolution en
 * cours » est à part (`resolvingSince`) : posée par la dernière réaction ou par l'envoi d'une
 * étape, enlevée par la réponse de character ; une seule à la fois.
 */
import type { AttackStatus, AttackVisibility, CombatSettings, RollDiceMode } from '@vtt/contracts';
import type { ActionResolution, PreparedAction } from '../../clients/character.js';
import type { AttackStatusValue } from '../../db/schema.js';
import { currentSlotSide, type CombatState } from '../combat/turns.js';
import type { AttackRow, TargetRow } from './repository.js';

export const isOpen = (status: AttackStatus) =>
  status === 'awaiting_reactions' || status === 'awaiting_dice';

/**
 * Une résolution restée ouverte plus longtemps (panne entre campaign et character) ne bloque
 * plus l'attaque : l'étape peut être renvoyée.
 */
export const RESOLVING_STALE_MS = 30_000;

/** Résolution en cours chez character (ni dés à lancer, ni rapport pour l'instant). */
export const isResolving = (
  attack: Pick<AttackRow, 'resolvingSince'>,
  now: Date = new Date(),
): boolean =>
  !!attack.resolvingSince && now.getTime() - attack.resolvingSince.getTime() < RESOLVING_STALE_MS;

/** Une cible attend une décision du MJ : résolue, pas encore décidée (ou annulée depuis). */
export const undecided = (t: Pick<TargetRow, 'status' | 'decision'>) =>
  t.status === 'resolved' && (t.decision === 'pending' || t.decision === 'reverted');

/** Les coûts de l'attaquant attendent une décision du MJ. */
export const actorUndecided = (actor: AttackRow['actor']) =>
  !!actor &&
  actor.modifications.length > 0 &&
  (actor.decision === 'pending' || actor.decision === 'reverted');

/** Une cible peut réagir (défense active) : paramètres proposés, pas refusée par les règles. */
export const canReact = (t: Pick<TargetRow, 'reactionParams' | 'status'>) =>
  t.reactionParams.length > 0 && t.status !== 'failed';

/**
 * Dés de l'attaque. Étape B (docs/combat.md § 6.6) : le serveur tire toujours (le repli de
 * § 6.3). Étape C : `physical` si demandé, ou par défaut si le combat le permet.
 */
export function effectiveDice(
  _requested: RollDiceMode | undefined,
  _settings: CombatSettings,
): RollDiceMode {
  return 'server';
}

/** Visibilité par défaut : `gm` pour le MJ si `gmRollsHidden`, sinon `public`. */
export function defaultVisibility(
  requested: AttackVisibility | undefined,
  isGm: boolean,
  settings: CombatSettings,
): AttackVisibility {
  return requested ?? (isGm && settings.gmRollsHidden ? 'gm' : 'public');
}

/**
 * Attaque déclarée hors du tour de l'attaquant : pas le participant du tour (individual),
 * pas l'acteur désigné, ou hors du camp du créneau, ou déjà agi (slots) ; hors du combat.
 * Hors combat : jamais.
 */
export function outOfTurnOf(state: CombatState | null, attackerId: string): boolean {
  if (!state) return false;
  const p = state.order.find((x) => x.characterId === attackerId);
  if (!p) return true;
  if (state.mode === 'individual')
    return state.order[state.currentIndex]?.characterId !== attackerId;
  if (state.currentActorId) return state.currentActorId !== attackerId;
  return p.side !== currentSlotSide(state) || p.hasActed;
}

/**
 * Mode slots : la première attaque d'un participant du camp du créneau courant, qui n'a pas
 * encore agi, le désigne acteur du créneau (docs/combat.md § 4.3).
 */
export function implicitSlotActor(state: CombatState | null, attackerId: string): boolean {
  if (state?.mode !== 'slots' || state.currentActorId) return false;
  const p = state.order.find((x) => x.characterId === attackerId);
  return !!p && !p.hasActed && p.side === currentSlotSide(state);
}

/** Cibles après la préparation (et la résolution immédiate s'il y en a une). */
export function preparedTargets(
  targetIds: string[],
  prepared: PreparedAction,
  resolution: ActionResolution | null,
): Omit<TargetRow, 'attackId'>[] {
  return targetIds.map((characterId, position) => {
    const p = prepared.targets.find((t) => t.characterId === characterId);
    const base: Omit<TargetRow, 'attackId'> = {
      characterId,
      position,
      status: 'awaiting_dice',
      decision: 'pending',
      reactionParams: p?.error ? [] : (p?.reactionParams ?? []),
      reaction: null,
      view: null,
      result: null,
      applied: null,
      error: p?.error ?? null,
    };
    if (p?.error) return { ...base, status: 'failed' };
    if (base.reactionParams.length && !resolution) return { ...base, status: 'awaiting_reaction' };
    return resolution ? resolvedTarget(base, resolution) : base;
  });
}

/**
 * Cibles d'une attaque déjà résolue par le navigateur de l'attaquant (`DeclareAttack.resolved`) :
 * rapport et vue repris tels quels, en attente du MJ ; une cible absente du rapport est refusée.
 */
export function reportedTargets(
  targetIds: string[],
  resolution: ActionResolution,
): Omit<TargetRow, 'attackId'>[] {
  return targetIds.map((characterId, position) =>
    resolvedTarget(
      {
        characterId,
        position,
        status: 'awaiting_dice',
        decision: 'pending',
        reactionParams: [],
        reaction: null,
        view: null,
        result: null,
        applied: null,
        error: null,
      },
      resolution,
    ),
  );
}

/** Cible après la résolution. */
export function resolvedTarget<T extends Omit<TargetRow, 'attackId'>>(
  target: T,
  resolution: ActionResolution,
): T {
  const r = resolution.targets.find((x) => x.characterId === target.characterId);
  if (!r) return target.status === 'failed' ? target : { ...target, status: 'failed' };
  return {
    ...target,
    status: r.status,
    result: r.result,
    view: r.view,
    error: r.error ?? target.error,
  };
}

/** Statut de l'attaque une fois résolue : `failed` si toutes les cibles ont échoué. */
export function statusAfterResolution(targets: Pick<TargetRow, 'status'>[]): 'pending' | 'failed' {
  return targets.every((t) => t.status === 'failed') ? 'failed' : 'pending';
}

/** Statut avant la résolution : réactions attendues, ou dés à lancer. */
export function statusBeforeResolution(
  targets: Pick<TargetRow, 'reactionParams' | 'status'>[],
): AttackStatusValue {
  return targets.some(canReact) ? 'awaiting_reactions' : 'awaiting_dice';
}

/**
 * Statut après des décisions : `pending` tant qu'une cible résolue (ou les coûts de
 * l'attaquant) attend ; sinon `applied` si quelque chose a été appliqué, `dismissed` sinon.
 */
export function statusAfterDecision(
  targets: Pick<TargetRow, 'status' | 'decision'>[],
  actor: AttackRow['actor'],
): 'pending' | 'applied' | 'dismissed' {
  if (targets.some(undecided) || actorUndecided(actor)) return 'pending';
  const applied = targets.some((t) => t.decision === 'applied') || actor?.decision === 'applied';
  return applied ? 'applied' : 'dismissed';
}
