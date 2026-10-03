/**
 * Situation du combat dans le menu d'attaque (docs/combat.md § 5.7, § 12.1) : ce que le combat
 * a compté, en puces lisibles pour l'attaquant et pour chaque cible (« Première attaque »,
 * « Déjà visé 2 fois ce round », « N'a pas encore agi », « Surpris »).
 *
 * Tout est lu dans l'état du combat que le serveur m'a donné (vue expurgée pour un joueur :
 * seules les attaques publiques y sont comptées). Les champs `tally` et `surprised` sont
 * facultatifs : absents, leurs puces ne s'affichent pas, rien d'autre ne change.
 */
import type { CombatParticipant, CombatState } from '@vtt/contracts';
import type { IconeEtat, Presentation } from '@vtt/rules';

export type SituationTone = 'positive' | 'warning' | 'info' | 'neutral' | 'danger';

export interface SituationChip {
  /** Identifiant stable (clé React, tests). */
  id: string;
  label: string;
  tone: SituationTone;
  /** Précision montrée en info-bulle. */
  hint?: string;
}

export interface TargetSituation {
  characterId: string;
  chips: SituationChip[];
}

export interface CombatSituation {
  /** Un combat est en cours (sinon rien n'est compté). */
  inCombat: boolean;
  round: number | null;
  attacker: SituationChip[];
  targets: TargetSituation[];
}

const participant = (combat: CombatState, id: string): CombatParticipant | undefined =>
  combat.order.find((p) => p.characterId === id);

const times = (n: number) => (n === 1 ? 'une fois' : `${n} fois`);

/** Puces de l'attaquant : première attaque, attaques déjà faites ce round, surpris. */
export function attackerChips(
  combat: CombatState | null | undefined,
  attackerId: string | null,
): SituationChip[] {
  if (!combat || !attackerId) return [];
  const me = participant(combat, attackerId);
  if (!me)
    return [
      {
        id: 'not-participant',
        label: 'Hors du combat',
        tone: 'neutral',
        hint: 'Ce personnage ne participe pas au combat en cours.',
      },
    ];
  const chips: SituationChip[] = [];
  if (me.surprised)
    chips.push({ id: 'surprised', label: 'Surpris', tone: 'warning', hint: 'Marqué par le MJ.' });
  const t = me.tally;
  if (t) {
    if (t.attacksMade === 0)
      chips.push({
        id: 'first-attack',
        label: 'Première attaque',
        tone: 'positive',
        hint: 'Sa première attaque de ce combat.',
      });
    else if (t.attacksMadeRound > 0)
      chips.push({
        id: 'attacks-round',
        label:
          t.attacksMadeRound === 1
            ? 'A déjà attaqué ce round'
            : `A déjà attaqué ${t.attacksMadeRound} fois ce round`,
        tone: 'info',
        hint: `${t.attacksMade} attaque${t.attacksMade > 1 ? 's' : ''} depuis le début du combat.`,
      });
  }
  return chips;
}

/**
 * Puces d'une cible : elle-même (auto-attaque), hors de combat, surprise, n'a pas encore agi,
 * déjà visée ce round (ou pas encore).
 */
export function targetChips(
  combat: CombatState | null | undefined,
  targetId: string,
  attackerId: string | null,
): SituationChip[] {
  const chips: SituationChip[] = [];
  if (targetId === attackerId)
    chips.push({
      id: 'self',
      label: 'Lui-même',
      tone: 'warning',
      hint: 'L’attaquant se vise lui-même (auto-attaque).',
    });
  if (!combat) return chips;
  const p = participant(combat, targetId);
  if (!p) {
    chips.push({ id: 'not-participant', label: 'Hors du combat', tone: 'neutral' });
    return chips;
  }
  if (p.defeated) chips.push({ id: 'defeated', label: 'Hors de combat', tone: 'danger' });
  if (p.surprised)
    chips.push({ id: 'surprised', label: 'Surpris', tone: 'warning', hint: 'Marqué par le MJ.' });
  if (combat.initiativeRolled && !p.hasActed)
    chips.push({
      id: 'not-acted',
      label: 'N’a pas encore agi',
      tone: 'info',
      hint: `Pas encore joué au round ${combat.round}.`,
    });
  if (p.tally) chips.push(targetedChip(p.tally));
  return chips;
}

/** Déjà visée ce round, sinon pas encore (ou jamais). */
function targetedChip(t: NonNullable<CombatParticipant['tally']>): SituationChip {
  if (t.targetedRound > 0)
    return {
      id: 'targeted-round',
      label: `Déjà visé ${times(t.targetedRound)} ce round`,
      tone: 'warning',
      hint: `Visé ${times(t.targeted)} depuis le début du combat.`,
    };
  return {
    id: 'not-targeted',
    label: t.targeted > 0 ? 'Pas encore visé ce round' : 'Jamais visé',
    tone: 'neutral',
    ...(t.targeted > 0 ? { hint: `Visé ${times(t.targeted)} depuis le début du combat.` } : {}),
  };
}

/** Situation complète : l'attaquant, puis chaque cible dans l'ordre choisi. */
export function combatSituation(
  combat: CombatState | null | undefined,
  attackerId: string | null,
  targetIds: readonly string[],
): CombatSituation {
  return {
    inCombat: Boolean(combat),
    round: combat?.round ?? null,
    attacker: attackerChips(combat, attackerId),
    targets: targetIds.map((id) => ({
      characterId: id,
      chips: targetChips(combat, id, attackerId),
    })),
  };
}

/**
 * Icône d'un paramètre de situation (couvert, cible à terre…), déclarée par la présentation
 * (`combat.situation.icones`) ; null sans icône. Lue sans supposer la présence du champ.
 */
export function situationIconOf(
  presentation: Presentation | null | undefined,
  paramId: string,
): IconeEtat | null {
  const combat = (presentation as { combat?: { situation?: { icones?: unknown } } } | null)?.combat;
  const icons = combat?.situation?.icones;
  if (!icons || typeof icons !== 'object') return null;
  const icon = (icons as Record<string, unknown>)[paramId];
  return typeof icon === 'string' ? (icon as IconeEtat) : null;
}
