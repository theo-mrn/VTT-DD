/**
 * Puces de situation d'un participant (docs/combat.md § 5.7, § 12.3) : ce que le MJ doit voir
 * d'un coup d'œil dans l'ordre du tour et sur les cartes : surpris, a agi, visé ce round,
 * première attaque à venir. Calcul pur sur `CombatParticipant` : `surprised` et `tally` sont
 * facultatifs (réponses d'avant ce contrat), une puce sans donnée n'apparaît simplement pas.
 */
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

const times = (n: number) => `${n} fois`;

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
      label: 'Surpris',
      hint: 'Pris au dépourvu : les règles du système en tiennent compte.',
      tone: 'alerte',
    });
  if (p.hasActed && !opts.current)
    out.push({ kind: 'acted', label: 'A agi', hint: 'A déjà agi ce round.', tone: 'succes' });
  const tally = p.tally;
  if (tally && tally.targetedRound > 0)
    out.push({
      kind: 'targeted',
      label: `Visé ×${tally.targetedRound}`,
      hint: `Visé ${times(tally.targetedRound)} ce round (${times(tally.targeted)} depuis le début du combat).`,
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
      label: '1re attaque à venir',
      hint: 'N’a encore attaqué personne dans ce combat.',
      tone: 'info',
    };
  if (tally.attacksMadeRound > 0)
    return {
      kind: 'attacked',
      label: `${tally.attacksMadeRound} attaque${tally.attacksMadeRound > 1 ? 's' : ''} ce round`,
      hint: `${tally.attacksMade} attaque${tally.attacksMade > 1 ? 's' : ''} depuis le début du combat.`,
      tone: 'neutre',
    };
  return null;
}
