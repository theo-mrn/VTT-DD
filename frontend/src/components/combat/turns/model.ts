/**
 * Logique affichée des tours (docs/combat.md § 4.3, § 9.3, § 12.3, § 12.6) : calculs purs sur
 * l'état du combat (`CombatState`), partagés par le panneau Combat du MJ et le bandeau des
 * joueurs. Rien ici ne décide d'une règle : le serveur tient l'ordre, le tour et le round ; on
 * lit son état pour dire qui joue, qui a joué, et ce que chacun peut faire.
 *
 * La vue d'un joueur est déjà expurgée par le serveur (participants cachés retirés,
 * `currentIndex` à -1 pendant le tour d'un adversaire caché) : ces fonctions n'ajoutent rien
 * qu'elle ne contient.
 */
import { lazyLabels, translate } from '@/i18n/runtime';
import type { CampaignSide, CombatParticipant, CombatState } from '@vtt/contracts';

// ─── Camps ───────────────────────────────────────────────────────────────────

/** Noms des camps (`combat.sides.<camp>`), traduits à la lecture. */
export const SIDE_LABELS: Record<CampaignSide, { name: string; short: string; one: string }> = {
  players: lazyLabels({
    name: 'combat.sides.players.name',
    short: 'combat.sides.players.short',
    one: 'combat.sides.players.one',
  }),
  enemies: lazyLabels({
    name: 'combat.sides.enemies.name',
    short: 'combat.sides.enemies.short',
    one: 'combat.sides.enemies.one',
  }),
  allies: lazyLabels({
    name: 'combat.sides.allies.name',
    short: 'combat.sides.allies.short',
    one: 'combat.sides.allies.one',
  }),
};

export const SIDES: readonly CampaignSide[] = ['players', 'enemies', 'allies'];

// ─── Tour courant ────────────────────────────────────────────────────────────

/**
 * Participant qui agit : `currentActorId` du serveur ; à défaut (réponse d'avant le contrat),
 * celui de `currentIndex` en mode individuel. Null : créneau sans acteur désigné, ou tour d'un
 * participant caché (vue d'un joueur).
 */
export function currentActorOf(state: CombatState): string | null {
  if (state.currentActorId !== undefined) return state.currentActorId ?? null;
  if (state.mode !== 'individual') return null;
  return state.order[state.currentIndex]?.characterId ?? null;
}

/** Créneau courant (mode `slots`), ou null. */
export function currentSlotOf(state: CombatState): { index: number; side: CampaignSide } | null {
  if (state.mode !== 'slots') return null;
  const slot = state.slots?.[state.currentIndex];
  return slot ? { index: state.currentIndex, side: slot.side } : null;
}

/**
 * Le tour est celui d'un participant que la vue expurgée ne montre pas (« Tour d'un
 * adversaire ») : `currentIndex` vaut -1 dans la vue d'un joueur.
 */
export function hiddenTurn(state: CombatState): boolean {
  return state.redacted === true && state.mode === 'individual' && state.currentIndex < 0;
}

// ─── Ordre ───────────────────────────────────────────────────────────────────

export interface TurnRow {
  participant: CombatParticipant;
  characterId: string;
  /** Rang dans l'ordre, à partir de 1. */
  position: number;
  /** C'est son tour (individuel), ou il agit pendant le créneau (slots). */
  current: boolean;
  acted: boolean;
  /** Caché aux joueurs (`visibleToPlayers: false`). */
  hidden: boolean;
  defeated: boolean;
  /** Son initiative lui est demandée (dés physiques), pas encore lancée. */
  pendingInitiative: boolean;
  /** Détail lisible de l'initiative, ou ses clés brutes ; null : pas tirée. */
  initiative: string | null;
  /** Clés de tri principales, pour la colonne compacte ; null : pas tirée. */
  score: string | null;
}

/** Détail d'initiative d'un participant : le résumé du serveur, sinon ses clés de tri. */
export function initiativeLabel(p: CombatParticipant): string | null {
  if (p.initiative?.summary) return p.initiative.summary;
  return p.sortKeys.length ? p.sortKeys.join(' · ') : null;
}

export function turnRows(state: CombatState): TurnRow[] {
  const actor = currentActorOf(state);
  return state.order.map((p, i) => ({
    participant: p,
    characterId: p.characterId,
    position: i + 1,
    current: actor !== null && p.characterId === actor,
    acted: p.hasActed,
    hidden: p.visibleToPlayers === false,
    defeated: p.defeated === true,
    pendingInitiative: p.initiativePending === true,
    initiative: initiativeLabel(p),
    score: p.sortKeys.length ? String(p.sortKeys[0]) : null,
  }));
}

// ─── Créneaux (Star Wars) ────────────────────────────────────────────────────

export interface SlotCell {
  index: number;
  side: CampaignSide;
  current: boolean;
  /** Déjà passé ce round. */
  past: boolean;
}

/** Barre des créneaux J/E du round, le courant surligné. */
export function slotBar(state: CombatState): SlotCell[] {
  if (state.mode !== 'slots') return [];
  return (state.slots ?? []).map((s, index) => ({
    index,
    side: s.side,
    current: index === state.currentIndex,
    past: index < state.currentIndex,
  }));
}

export interface SlotCandidate {
  participant: CombatParticipant;
  characterId: string;
  acted: boolean;
  /** Désigné pour le créneau courant. */
  actor: boolean;
}

/** « Qui agit ? » : les participants du camp du créneau courant (hors de combat exclus). */
export function slotCandidates(state: CombatState): SlotCandidate[] {
  const slot = currentSlotOf(state);
  if (!slot) return [];
  const actor = currentActorOf(state);
  return state.order
    .filter((p) => p.side === slot.side && p.defeated !== true)
    .map((p) => ({
      participant: p,
      characterId: p.characterId,
      acted: p.hasActed,
      actor: p.characterId === actor,
    }));
}

// ─── Ce que je peux faire (joueur) ───────────────────────────────────────────

export type MyTurn =
  /** Un de mes personnages agit : « À vous ! », « Terminer mon tour ». */
  | { kind: 'act'; characterId: string }
  /** Créneau de mon camp sans acteur : « Je prends ce créneau » avec l'un d'eux. */
  | { kind: 'slot'; candidates: string[] }
  | null;

/**
 * Ce que la vue permet à celui qui incarne `mine` : agir (son tour), ou prendre le créneau de
 * son camp (slots, pas encore agi ce round, personne de désigné).
 */
export function myTurn(state: CombatState, mine: ReadonlySet<string>): MyTurn {
  if (!mine.size) return null;
  const actor = currentActorOf(state);
  if (actor && mine.has(actor)) return { kind: 'act', characterId: actor };
  const slot = currentSlotOf(state);
  if (!slot || actor) return null;
  const candidates = state.order
    .filter(
      (p) => mine.has(p.characterId) && p.side === slot.side && !p.hasActed && p.defeated !== true,
    )
    .map((p) => p.characterId);
  return candidates.length ? { kind: 'slot', candidates } : null;
}

/** Mes personnages dont l'initiative m'est demandée. */
export function myPendingInitiatives(state: CombatState, mine: ReadonlySet<string>): string[] {
  return state.order
    .filter((p) => p.initiativePending === true && mine.has(p.characterId))
    .map((p) => p.characterId);
}

// ─── Titre du tour ───────────────────────────────────────────────────────────

/** « Round 2 · Tour de Lyra », « Round 1 · Créneau des Ennemis », « Tour d'un adversaire ». */
export function turnHeadline(state: CombatState, nameOf: (id: string) => string): string {
  const actor = currentActorOf(state);
  const slot = currentSlotOf(state);
  if (slot) {
    const side = SIDE_LABELS[slot.side].name;
    return actor
      ? translate('combat.turn.slotOfActor', { side, name: nameOf(actor) })
      : translate('combat.turn.slotOf', { side });
  }
  if (actor) return translate('combat.turn.of', { name: nameOf(actor) });
  if (hiddenTurn(state)) return translate('combat.turn.opponent');
  return translate(state.initiativeRolled ? 'combat.turn.waiting' : 'combat.turn.rollInitiative');
}

// ─── Réordonner ──────────────────────────────────────────────────────────────

/** Ordre après avoir déplacé `id` à la place `to` (0 = en tête). */
export function reorder(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const next = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(next.length, to));
  next.splice(at, 0, id);
  return next;
}

/** Ordre après avoir monté (-1) ou descendu (+1) `id` d'un rang ; null s'il est déjà au bord. */
export function moveBy(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  return reorder(ids, id, to);
}

// ─── Démarrer un combat ──────────────────────────────────────────────────────

/** Token de la scène, réduit à ce que le démarrage lit. */
export interface SceneToken {
  characterId: string | null | undefined;
  visibility?: string | null;
}

/** Personnage engagé dans la campagne. */
export interface EngagedCharacter {
  characterId: string;
  side: CampaignSide;
  inCreation?: boolean;
}

export interface StartCandidate {
  characterId: string;
  side: CampaignSide;
  /** Un token de ce personnage est sur la scène affichée. */
  onScene: boolean;
  /** Présélectionné : sur la scène. */
  checked: boolean;
  /** Caché aux joueurs au départ : son token est caché ou invisible. */
  hidden: boolean;
}

/** Visibilités de token qui cachent un PNJ aux joueurs (embuscade). */
const HIDDEN_VISIBILITIES = new Set(['hidden', 'invisible']);

/**
 * Participants proposés au démarrage : les personnages engagés, ceux de la scène présélectionnés
 * (docs/combat.md § 4.2) ; un PNJ dont le token est caché ou invisible est pré-coché « caché ».
 * Personnages de la scène d'abord (joueurs, alliés, ennemis), puis les autres engagés.
 */
export function startCandidates(
  engaged: readonly EngagedCharacter[],
  tokens: readonly SceneToken[],
): StartCandidate[] {
  const onScene = new Map<string, boolean>();
  for (const t of tokens) {
    if (!t.characterId) continue;
    const hidden = HIDDEN_VISIBILITIES.has(t.visibility ?? '');
    // Un personnage posé deux fois n'est caché que si tous ses tokens le sont
    onScene.set(t.characterId, (onScene.get(t.characterId) ?? true) && hidden);
  }
  const order = (side: CampaignSide) => SIDES.indexOf(side);
  return engaged
    .filter((c) => !c.inCreation)
    .map((c) => {
      const scene = onScene.has(c.characterId);
      return {
        characterId: c.characterId,
        side: c.side,
        onScene: scene,
        checked: scene,
        hidden: scene && c.side !== 'players' && onScene.get(c.characterId) === true,
      };
    })
    .sort((a, b) => Number(b.onScene) - Number(a.onScene) || order(a.side) - order(b.side));
}
