/**
 * Vue du combat pour un joueur ou un spectateur (docs/combat.md § 9.3), et charges de
 * `combat.turn_changed` : complète pour les MJ, expurgée pour les autres.
 *
 * Vue expurgée : participants cachés (`visibleToPlayers: false`) retirés ; `currentIndex` =
 * index dans cette liste, ou -1 quand le participant dont c'est le tour est caché ; clés de tri
 * et détail d'initiative des camps autres que `players` vidés (l'initiative d'un PNJ trahit sa
 * statistique) ; acteur caché remplacé par null. Les créneaux ne sont jamais retirés.
 */
import type {
  CombatParticipant,
  CombatState as CombatStateApi,
  CombatTurnChangedPayload,
  CombatTurnReason,
} from '@vtt/contracts';

const hidden = (p: Pick<CombatParticipant, 'visibleToPlayers'>) => p.visibleToPlayers === false;

/** Identifiants des participants cachés aux joueurs. */
export const hiddenIds = (state: CombatStateApi): Set<string> =>
  new Set(state.order.filter(hidden).map((p) => p.characterId));

/** Vue d'un joueur ou d'un spectateur. */
export function redactCombat(full: CombatStateApi): CombatStateApi {
  const visible = full.order.filter((p) => !hidden(p));
  let currentIndex = full.currentIndex;
  if (full.mode === 'individual') {
    const current = full.order[full.currentIndex];
    if (current) currentIndex = hidden(current) ? -1 : visible.indexOf(current);
  }
  const hiddenSet = hiddenIds(full);
  const { canGoBack: _gmOnly, ...rest } = full;
  return {
    ...rest,
    order: visible.map((p) =>
      p.side === 'players' ? p : { ...p, sortKeys: [], initiative: null },
    ),
    currentIndex,
    currentActorId:
      full.currentActorId && !hiddenSet.has(full.currentActorId) ? full.currentActorId : null,
    redacted: true,
  };
}

/** L'état vu par ce rôle. */
export const combatFor = (full: CombatStateApi, isGm: boolean): CombatStateApi =>
  isGm ? full : redactCombat(full);

export interface TurnChange {
  reason: CombatTurnReason;
  /** Participant qui vient d'agir (suivant). */
  acted?: string | null;
  /** Joindre l'ordre et les clés (initiative, ajout, réordonné…) : MJ seulement. */
  withOrder?: boolean;
  added?: string[];
  removed?: string[];
}

/**
 * Charges de `combat.turn_changed` : `gm` (complète) et `players` (expurgée, même version).
 * Identiques quand rien n'est à cacher : un seul événement public suffit alors.
 */
export function turnChangedPayloads(
  full: CombatStateApi,
  change: TurnChange,
): { gm: CombatTurnChangedPayload; players: CombatTurnChangedPayload; same: boolean } {
  const gm: CombatTurnChangedPayload = {
    reason: change.reason,
    round: full.round,
    currentIndex: full.currentIndex,
    version: full.version,
    ...(change.acted !== undefined ? { acted: change.acted } : {}),
    currentActorId: full.currentActorId ?? null,
    turn: full.turn ?? 0,
    ...(change.withOrder
      ? { order: full.order.map((p) => ({ characterId: p.characterId, sortKeys: p.sortKeys })) }
      : {}),
    ...(change.added ? { added: change.added } : {}),
    ...(change.removed ? { removed: change.removed } : {}),
  };
  const view = redactCombat(full);
  const secret = hiddenIds(full);
  const players: CombatTurnChangedPayload = {
    reason: change.reason,
    round: view.round,
    currentIndex: view.currentIndex,
    version: view.version,
    ...(change.acted !== undefined
      ? { acted: change.acted && !secret.has(change.acted) ? change.acted : null }
      : {}),
    currentActorId: view.currentActorId ?? null,
    turn: view.turn ?? 0,
  };
  return { gm, players, same: JSON.stringify(gm) === JSON.stringify(players) };
}
