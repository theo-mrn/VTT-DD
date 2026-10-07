/**
 * Durées décomptées au nombre de tours (docs/combat.md § 18), côté interface : un seul
 * formateur pour les badges de la carte, l'ordre du tour, la fiche de combat et le bloc Bonus de
 * la fiche, la durée par défaut lue dans le système, et la demande envoyée à character.
 *
 * Aucune valeur de jeu : la durée par défaut d'un état est une donnée du catalogue (`duree` de
 * l'entrée). Les libellés se composent ici, dans la langue de la page, à partir du décompte
 * (nombre, moment, ancre, attente) : ceux du moteur (`libelleDuree`) sont en français et ne
 * servent qu'à ses propres explications (docs/i18n.md § 6).
 */
import { DURATION_MOMENT_RULES, type AttackModificationInput } from '@vtt/contracts';
import type { Decompte, MomentDecompte, SystemeCharge } from '@vtt/rules';
import { translate } from '@/i18n/runtime';

/** Durée affichée : décomptes restants (null : jusqu'au retrait) et leur moment. */
export interface Timer {
  duration: number | null;
  timing?: Decompte;
}

/** Clé du nom de chaque moment (`combat.durations.moments.<clé>`). */
const MOMENT_KEYS = {
  'fin-round': 'roundEnd',
  'debut-tour': 'turnStart',
  'fin-tour': 'turnEnd',
} as const;

/** Nom d'un moment de décompte : « Fin de round », « Début de tour »… */
export const momentLabel = (moment: MomentDecompte) =>
  translate(`combat.durations.moments.${MOMENT_KEYS[moment]}`);

/** Moments proposés quand on pose une durée, dans l'ordre (nom traduit à la lecture). */
export const DURATION_MOMENTS: readonly { value: MomentDecompte; readonly label: string }[] = (
  ['fin-round', 'debut-tour', 'fin-tour'] as const
).map((value) => ({
  value,
  get label() {
    return momentLabel(value);
  },
}));

/** Le moment se décompte au tour d'un personnage (l'ancre compte). */
export const turnBased = (moment: MomentDecompte) => moment !== 'fin-round';

/**
 * Libellé complet : « 2 rounds », « jusqu'à la fin de son prochain tour », « jusqu'au début du
 * prochain tour de Gobelin », « jusqu'au retrait ».
 */
export function durationText(
  t: Timer,
  o: { bearerId?: string; nameOf?: (id: string) => string | undefined } = {},
): string {
  if (t.duration === null) return translate('combat.durations.untilRemoved');
  const d = t.timing;
  if (!d || d.moment === 'fin-round')
    return translate('combat.durations.rounds', { count: t.duration });
  const name =
    d.de && d.de !== o.bearerId
      ? (o.nameOf?.(d.de) ?? translate('combat.durations.anotherCharacter'))
      : null;
  const start = d.moment === 'debut-tour';
  // « prochain » : le tour qui compte n'a pas encore commencé (début, ou fin en attente)
  const next = start || d.attente === true;
  const base = start ? 'untilStart' : 'untilEnd';
  const bound = name
    ? translate(`combat.durations.${base}Of${next ? NEXT : ''}`, { name })
    : translate(`combat.durations.${base}Own${next ? NEXT : ''}`);
  return t.duration === 1
    ? bound
    : translate('combat.durations.turnsUntil', { count: t.duration, bound });
}

/** Suffixe des clés « prochain tour » (`untilEndOfNext`…). */
const NEXT = 'Next'; // i18n-ignore

/** Libellé court : « 2 rounds », « 1 tour » ; null : jusqu'au retrait. */
export function durationShort(t: Timer): string | null {
  if (t.duration === null) return null;
  const moment = t.timing?.moment ?? 'fin-round';
  return translate(moment === 'fin-round' ? 'combat.durations.rounds' : 'combat.durations.turns', {
    count: t.duration,
  });
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
