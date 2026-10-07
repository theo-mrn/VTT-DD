/**
 * Puces de situation d'un participant (docs/combat.md § 5.7, § 12.3) : ce que le MJ doit voir
 * d'un coup d'œil dans l'ordre du tour et sur les cartes : surpris, a agi, visé ce round,
 * première attaque à venir. Calcul pur sur `CombatParticipant` : `surprised` et `tally` sont
 * facultatifs (réponses d'avant ce contrat), une puce sans donnée n'apparaît simplement pas.
 */
import { translate } from '@/i18n/runtime';
import type { CombatParticipant } from '@vtt/contracts';

export type SituationChipKind = 'surprised' | 'acted' | 'targeted' | 'firstAttack' | 'attacked';

export interface SituationChip {
  kind: SituationChipKind;
  /** Texte court de la puce. */
  label: string;
  /** Phrase de l'infobulle (et du lecteur d'écran). */
  hint: string;
  tone: 'alerte' | 'succes' | 'danger' | 'info' | 'neutre';
}

const times = (n: number) => translate('combat.chips.times', { count: n });

/**
 * Puces d'un participant. `current` : c'est son tour (« A agi » n'a pas de sens). `detailed` :
 * carte ou fiche (plus de place), avec la première attaque à venir et ses attaques du round ;
 * sans lui, les seules puces de la ligne de l'ordre.
 */
export function situationChips(
  p: Pick<CombatParticipant, 'hasActed' | 'surprised' | 'tally' | 'defeated'>,
  opts: { current?: boolean; detailed?: boolean } = {},
): SituationChip[] {
  const out: SituationChip[] = [];
  if (p.surprised)
    out.push({
      kind: 'surprised',
      label: translate('combat.situation.surprised'),
      hint: translate('combat.chips.surprisedHint'),
      tone: 'alerte',
    });
  if (p.hasActed && !opts.current)
    out.push({
      kind: 'acted',
      label: translate('combat.chips.acted'),
      hint: translate('combat.chips.actedHint'),
      tone: 'succes',
    });
  const tally = p.tally;
  if (tally && tally.targetedRound > 0)
    out.push({
      kind: 'targeted',
      label: translate('combat.chips.targeted', { count: tally.targetedRound }),
      hint: translate('combat.chips.targetedHint', {
        round: times(tally.targetedRound),
        total: times(tally.targeted),
      }),
      tone: 'danger',
    });
  const attack = opts.detailed && tally && p.defeated !== true ? attackChip(tally) : null;
  if (attack) out.push(attack);
  return out;
}

/** Attaques du participant : la première à venir, ou celles du round. */
function attackChip(tally: NonNullable<CombatParticipant['tally']>): SituationChip | null {
  if (tally.attacksMade === 0)
    return {
      kind: 'firstAttack',
      label: translate('combat.chips.firstAttack'),
      hint: translate('combat.chips.firstAttackHint'),
      tone: 'info',
    };
  if (tally.attacksMadeRound > 0)
    return {
      kind: 'attacked',
      label: translate('combat.chips.attacksRound', { count: tally.attacksMadeRound }),
      hint: translate('combat.situation.attacksSoFar', { count: tally.attacksMade }),
      tone: 'neutre',
    };
  return null;
}
