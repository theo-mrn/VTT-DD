/**
 * Progression du compte (docs/progression.md) : niveau, XP, récompenses aux
 * paliers, défis et prochaines étapes, lus sur identity ; temps de jeu envoyé
 * par lots. Les composants passent par ces fonctions et hooks.
 */
import { formatter, translate } from '@/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type ChallengeKind = 'daily' | 'weekly' | 'permanent';
export type ChallengeGroup = 'first_steps' | 'milestone';

/** Défi avec sa progression sur la période en cours. */
export interface Challenge {
  id: string;
  kind: ChallengeKind;
  group: ChallengeGroup | null;
  label: string;
  target: number;
  progress: number;
  xp: number;
  completed: boolean;
}

export interface LevelReward {
  level: number;
  type: 'title' | 'border';
  id: string;
  /** Libellé du titre ; null pour une bordure (libellés du front, BORDURES). */
  label: string | null;
  reached: boolean;
}

/** GET /v1/users/me/progression */
export interface Progression {
  level: number;
  xp: number;
  levelXp: number;
  nextLevelXp: number;
  todayXp: number;
  rewards: LevelReward[];
  nextReward: LevelReward | null;
  borders: string[];
  challenges: { daily: Challenge[]; weekly: Challenge[]; permanent: Challenge[] };
  steps: Challenge[];
  periods: { day: string; week: string; dailyEndsAt: string; weeklyEndsAt: string };
}

/** GET /v1/users/me/progression/history (export des données). */
export interface ProgressionHistory {
  xp: number;
  level: number;
  daily: { day: string; activity: string; units: number; xp: number }[];
  counters: { activity: string; total: number }[];
  challenges: { challengeId: string; period: string; xp: number; completedAt: string }[];
}

export const progressionKeys = {
  root: ['account', 'progression'] as const,
};

export function readProgression() {
  return api<Progression>('/v1/users/me/progression');
}

export function readProgressionHistory() {
  return api<ProgressionHistory>('/v1/users/me/progression/history');
}

/** Progression du compte connecté ; relue aux notifications (niveau, défi). */
export function useProgression(enabled = true) {
  return useQuery({ queryKey: progressionKeys.root, queryFn: readProgression, enabled });
}

/** Part du niveau en cours déjà faite, de 0 à 100. */
export function levelPercent(p: Pick<Progression, 'xp' | 'levelXp' | 'nextLevelXp'>): number {
  const span = p.nextLevelXp - p.levelXp;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, ((p.xp - p.levelXp) / span) * 100));
}

/** Part d'un défi déjà faite, de 0 à 100. */
export function challengePercent(c: Pick<Challenge, 'progress' | 'target' | 'completed'>): number {
  if (c.completed) return 100;
  if (c.target <= 0) return 0;
  return Math.max(0, Math.min(100, (c.progress / c.target) * 100));
}

/** « 1 240 » : nombres à la française (espace fine insécable). */
export function formatXp(n: number): string {
  return formatter().number(n);
}

/** Temps restant jusqu'à `until` : « 3 h 12 min », « 2 j 4 h », « 12 min ». */
export function timeLeft(until: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0)
    return hours
      ? translate('progression.time.daysHours', { days, hours })
      : translate('progression.time.days', { days });
  if (hours > 0)
    return rest
      ? translate('progression.time.hoursMinutes', { hours, minutes: rest })
      : translate('progression.time.hours', { hours });
  return translate('progression.time.minutes', { minutes: rest });
}

/** Lien d'action d'une étape du parcours guidé (défi permanent). */
export function stepHref(challengeId: string): string {
  switch (challengeId) {
    case 'first_profile':
      return '/profil';
    case 'first_character':
    case 'characters_5':
      return '/personnages/nouveau';
    case 'first_campaign':
      return '/campagnes';
    case 'campaigns_3':
      return '/campagnes/nouvelle';
    case 'first_roll':
    case 'rolls_100':
    case 'rolls_1000':
      return '/des';
    case 'first_friend':
    case 'friends_5':
      return '/amis';
    case 'notes_25':
      return '/notes';
    default:
      return '/campagnes';
  }
}

// ─── Temps de jeu ────────────────────────────────────────────────────────────

/** Minutes envoyées par lot (comme l'ancienne app) et maximum accepté par identity. */
export const PLAY_TIME_BATCH = 5;
export const PLAY_TIME_MAX = 60;

/**
 * Compteur des minutes de jeu en attente d'envoi : une minute par minute
 * d'onglet visible ; un lot part à PLAY_TIME_BATCH minutes, ou plus tôt quand
 * l'onglet est masqué. Un envoi raté est rendu (et plafonné à PLAY_TIME_MAX).
 */
export class PlayTimeCounter {
  private pending = 0;

  /** Une minute écoulée ; vrai s'il faut envoyer. */
  tick(visible: boolean): boolean {
    if (visible) this.pending = Math.min(PLAY_TIME_MAX, this.pending + 1);
    return this.pending >= PLAY_TIME_BATCH;
  }

  /** Minutes à envoyer maintenant (0 si rien) ; le compteur repart de zéro. */
  take(): number {
    const n = this.pending;
    this.pending = 0;
    return n;
  }

  /** Remet des minutes dont l'envoi a échoué. */
  restore(n: number): void {
    this.pending = Math.min(PLAY_TIME_MAX, this.pending + n);
  }

  get value(): number {
    return this.pending;
  }
}

/** POST /v1/users/me/time : ajoute des minutes, renvoie les titres débloqués. */
export function addPlayTime(minutes: number) {
  return api<{ timeSpentMinutes: number; unlockedTitles: string[] }>('/v1/users/me/time', {
    method: 'POST',
    body: JSON.stringify({ minutes }),
  });
}
