/**
 * Temps du monde : jour et heure de la fiction, réglés par le MJ, vus de la table (ou gardés
 * pour lui). Il s'écoule seul à la vitesse choisie (minutes de jeu par minute réelle, 0 : figé),
 * chaque appareil le calculant sur sa propre horloge depuis le dernier réglage reçu. Gardé sur
 * le compte du MJ pour la campagne : il retrouve l'heure à la séance suivante, sans que le temps
 * ait coulé entre deux séances.
 */
import { createGmSharedState } from '../shared/gm-state';

export interface WorldTime {
  /** Minutes écoulées depuis le jour 1 à 0 h, à l'instant `since`. */
  minutes: number;
  /** Montré aux joueurs. */
  visible: boolean;
  /** Minutes de jeu par minute réelle ; 0 : le temps est figé. */
  rate: number;
  /** Instant (horloge locale) où `minutes` était juste. */
  since: number;
}

/** Vitesses proposées ; libellé : `table.worldTime.speeds.<clé>`. */
export const SPEEDS = [
  ['stopped', 0],
  ['realtime', 1],
  ['x10', 10],
  ['x60', 60],
  ['x360', 360],
] as const;

export const DAY = 24 * 60;
const MAX = 1_000_000 * DAY;

/** L'heure du monde maintenant (minutes, fractionnaires quand le temps coule). */
export function currentMinutes(t: WorldTime, now = Date.now()) {
  return Math.min(MAX, t.minutes + (t.rate * Math.max(0, now - t.since)) / 60_000);
}

/** Valeur reçue (ou relue) : l'heure qu'elle porte vaut à partir de maintenant. */
export function normalizeWorldTime(raw: unknown, now = Date.now()): WorldTime | null {
  if (!raw || typeof raw !== 'object') return null;
  const { minutes, visible, rate } = raw as Partial<WorldTime>;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  return {
    minutes: Math.max(0, Math.min(MAX, minutes)),
    visible: visible !== false,
    rate: typeof rate === 'number' && rate >= 0 && rate <= 3600 ? rate : 0,
    since: now,
  };
}

export const worldTime = createGmSharedState<WorldTime>('table.worldtime', {
  decode: (raw) => normalizeWorldTime(raw),
  // Voyage (et s'enregistre) en heure présente : chacun repart de son horloge à la réception
  encode: (t) => ({ minutes: currentMinutes(t), visible: t.visible, rate: t.rate }),
  persist: 'worldTime',
});

/** MJ : change le temps, en repartant de l'heure présente. */
export function updateWorldTime(
  t: WorldTime,
  change: Partial<Pick<WorldTime, 'minutes' | 'visible' | 'rate'>>,
) {
  const now = Date.now();
  worldTime.set({
    ...t,
    minutes: currentMinutes(t, now),
    since: now,
    ...change,
    ...(change.minutes !== undefined ? { minutes: Math.max(0, change.minutes) } : {}),
  });
}

export type Period = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';

export function partsOf(total: number) {
  const minutes = Math.floor(total);
  const day = Math.floor(minutes / DAY) + 1;
  const inDay = minutes % DAY;
  const hour = Math.floor(inDay / 60);
  return { day, hour, minute: inDay % 60 };
}

export function periodOf(hour: number): Period {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 21) return 'dusk';
  return 'night';
}

export const clock = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** Prochaine fois qu'il est `hour` h (le lendemain si l'heure est passée). */
export function nextHour(minutes: number, hour: number) {
  const debut = Math.floor(minutes / DAY) * DAY;
  const cible = debut + hour * 60;
  return cible > minutes ? cible : cible + DAY;
}
