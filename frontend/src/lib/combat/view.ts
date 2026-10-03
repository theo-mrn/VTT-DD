/**
 * Ce que le menu d'attaque montre d'une attaque (docs/combat.md § 5.5, § 5.6, § 7.6) : une
 * projection pure, testée, qui garantit qu'un joueur ne voit rien d'un PNJ au-delà de ce que
 * le serveur lui envoie.
 *
 * - Vue d'un joueur (`attack.redacted`) : la vue de l'attaquant (`view`) seule : ses dés, son
 *   total, l'issue, les valeurs que le système lui montre. Jamais `result`, `applied` ni
 *   `actor`, même s'ils arrivaient par erreur.
 * - MJ : le résultat complet (`result`) : issue, jet, modifications proposées, tables.
 * - Le nom d'une cible vient de la liste de la campagne que le serveur m'a donnée ; une cible
 *   que je ne connais pas reste « Adversaire », sans jamais lire sa fiche.
 */
import type {
  Attack,
  AttackDecision,
  AttackModification,
  AttackOutcome,
  AttackRoll,
  AttackTableDraw,
  AttackTarget,
  AttackTargetStatus,
  AttackVisibleValue,
} from '@vtt/contracts';

export interface TargetDisplay {
  characterId: string;
  status: AttackTargetStatus;
  decision: AttackDecision;
  outcome: AttackOutcome | null;
  roll: AttackRoll | null;
  /** Valeurs montrées à l'attaquant (dégâts lancés…), nommées par le système. */
  values: readonly AttackVisibleValue[];
  explanations: readonly string[];
  /** Refus des règles propre à cette cible. */
  error: string | null;
  /** MJ seulement : modifications proposées et tables tirées. */
  modifications: readonly AttackModification[];
  tables: readonly AttackTableDraw[];
  /** Détail complet disponible (MJ). */
  full: boolean;
}

const NONE: readonly never[] = [];

/** Projection d'une cible pour l'affichage, selon ce que le serveur a envoyé. */
export function targetDisplay(attack: Attack, target: AttackTarget): TargetDisplay {
  const base = {
    characterId: target.characterId,
    status: target.status,
    decision: target.decision,
    error: target.error ?? null,
  };
  const view = target.view ?? null;
  if (attack.redacted) {
    return {
      ...base,
      outcome: view?.outcome ?? null,
      roll: view?.roll ?? null,
      values: view?.values ?? NONE,
      explanations: view?.explanations ?? NONE,
      modifications: NONE,
      tables: NONE,
      full: false,
    };
  }
  const result = target.result ?? null;
  return {
    ...base,
    outcome: result?.outcome ?? view?.outcome ?? null,
    roll: result?.roll ?? view?.roll ?? null,
    values: view?.values ?? NONE,
    explanations: result?.explanations ?? view?.explanations ?? NONE,
    modifications: result?.modifications ?? NONE,
    tables: result?.tables ?? NONE,
    full: result !== null,
  };
}

export type OutcomeTone = 'success' | 'critical' | 'fumble' | 'failure' | 'neutral';

/**
 * Issue lisible (§ 12.1) : Touché, Raté, Critique, Échec critique. Sans condition de réussite
 * dans l'action, seuls critique et échec critique ont un sens.
 */
export function outcomeLabel(
  outcome: AttackOutcome | null,
  hasSuccessRule: boolean,
): { label: string; tone: OutcomeTone } | null {
  if (!outcome) return null;
  if (outcome.critical) return { label: 'Critique', tone: 'critical' };
  if (outcome.fumble) return { label: 'Échec critique', tone: 'fumble' };
  if (!hasSuccessRule) return null;
  return outcome.success
    ? { label: 'Touché', tone: 'success' }
    : { label: 'Raté', tone: 'failure' };
}

/** Décision du MJ vue par l'auteur (sans montants, § 5.6). */
export function decisionLabel(decision: AttackDecision): string | null {
  switch (decision) {
    case 'applied':
      return 'Appliqué';
    case 'skipped':
      return 'Non appliqué';
    case 'reverted':
      return 'Application annulée';
    default:
      return null;
  }
}

/** Personnage tel que la table le connaît (liste filtrée par le serveur). */
export interface KnownCharacter {
  id: string;
  name: string | null;
  portraitUrl: string | null;
}

/** Nom d'une cible pour moi : celui de la liste de la campagne, sinon « Adversaire ». */
export function targetName(
  characterId: string,
  known: ReadonlyMap<string, KnownCharacter>,
): string {
  return known.get(characterId)?.name ?? 'Adversaire';
}

/** Cibles qui doivent encore répondre (défense active). */
export const awaitingReaction = (attack: Attack) =>
  attack.targets.filter((t) => t.status === 'awaiting_reaction');

/** Total affichable d'un jet numérique ; null pour un pool à symboles. */
export const numericTotal = (roll: AttackRoll | null) =>
  roll?.kind === 'numeric' ? roll.total : null;
