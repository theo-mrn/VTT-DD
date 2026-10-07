/**
 * Durées décomptées au nombre de tours (docs/combat.md § 18), côté interface : un seul
 * formateur pour les badges de la carte, l'ordre du tour, la fiche de combat et le bloc Bonus de
 * la fiche, la durée par défaut lue dans le système, et la demande envoyée à character.
 *
 * Aucune valeur de jeu : la durée par défaut d'un état est une donnée du catalogue (`duree` de
 * l'entrée) ; le libellé vient du moteur (`libelleDuree`).
 */
import { DURATION_MOMENT_RULES, type AttackModificationInput } from '@vtt/contracts';
import {
  libelleCourtDuree,
  libelleDuree,
  type Decompte,
  type MomentDecompte,
  type SystemeCharge,
} from '@vtt/rules';

/** Durée affichée : décomptes restants (null : jusqu'au retrait) et leur moment. */
export interface Timer {
  duration: number | null;
  timing?: Decompte;
}

/** Moments proposés quand on pose une durée, dans l'ordre. */
export const DURATION_MOMENTS: readonly { value: MomentDecompte; label: string }[] = [
  { value: 'fin-round', label: 'Fin de round' },
  { value: 'debut-tour', label: 'Début de tour' },
  { value: 'fin-tour', label: 'Fin de tour' },
];

/** Le moment se décompte au tour d'un personnage (l'ancre compte). */
export const turnBased = (moment: MomentDecompte) => moment !== 'fin-round';

const minuterie = (t: Timer) => ({
  ...(t.duration !== null ? { duree: t.duration } : {}),
  ...(t.timing ? { decompte: t.timing } : {}),
});

/**
 * Libellé complet : « 2 rounds », « jusqu'à la fin de son prochain tour », « jusqu'au début du
 * prochain tour de Gobelin », « jusqu'au retrait ».
 */
export function durationText(
  t: Timer,
  o: { bearerId?: string; nameOf?: (id: string) => string | undefined } = {},
): string {
  return libelleDuree(minuterie(t), {
    ...(o.bearerId ? { porteur: o.bearerId } : {}),
    ...(o.nameOf ? { nomDe: o.nameOf } : {}),
  });
}

/** Libellé court : « 2 rounds », « 1 tour » ; null : jusqu'au retrait. */
export function durationShort(t: Timer): string | null {
  return libelleCourtDuree(minuterie(t));
}

/** Durée par défaut d'une entrée du catalogue (état, sort actif), si le système en déclare une. */
export function defaultDurationOf(
  systeme: SystemeCharge,
  entryId: string,
): { duration: number; moment: MomentDecompte; anchor: 'porteur' | 'source' } | null {
  const d = systeme.entrees.get(entryId)?.duree;
  return d ? { duration: d.valeur, moment: d.moment, anchor: d.de } : null;
}

/**
 * Décompte demandé à character (`decompte` de `POST /possessions` et `POST /bonus`) : rien pour
 * la fin de round ; l'ancre est omise quand c'est le porteur. L'attente d'une fin de tour est
 * posée par le serveur.
 */
export function timingRequest(
  moment: MomentDecompte,
  anchorId: string | null,
  bearerId: string,
): { moment: MomentDecompte; de?: string } | null {
  if (!turnBased(moment)) return null;
  return anchorId && anchorId !== bearerId ? { moment, de: anchorId } : { moment };
}

// ─── Décisions du MJ (rapports d'attaque) ────────────────────────────────────

type EntryInput = Extract<AttackModificationInput, { kind: 'entry' }>;

/** Durée d'une entrée donnée par une attaque, dans le vocabulaire de l'affichage. */
export function timerOfModification(m: EntryInput): Timer {
  if (!m.duration) return { duration: null };
  if (!m.timing || m.timing.moment === 'round_end') return { duration: m.duration };
  return {
    duration: m.duration,
    timing: {
      moment: DURATION_MOMENT_RULES[m.timing.moment],
      ...(m.timing.anchorId ? { de: m.timing.anchorId } : {}),
      // Posée maintenant : « fin de son prochain tour »
      ...(m.timing.moment === 'turn_end' ? { attente: true } : {}),
    },
  };
}
