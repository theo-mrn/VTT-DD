/**
 * Défis (docs/progression.md § 6) : quotidiens et hebdomadaires tirés d'un lot
 * par une rotation déterministe propre à chaque joueur, et permanents (Premiers
 * pas, qui forment le parcours guidé, et jalons).
 *
 * Rien n'est stocké pour savoir quels défis sont actifs : le même calcul sert
 * au consommateur (accomplissement) et à la lecture (écran).
 */
import type { ActivityKind } from './rules.js';

export type ChallengeKind = 'daily' | 'weekly' | 'permanent';
export type ChallengeGroup = 'first_steps' | 'milestone';

export interface ChallengeDefinition {
  /** Identifiant stable (colonne challenge_id) : ne jamais renommer un défi publié. */
  id: string;
  kind: ChallengeKind;
  label: string;
  /** Activités dont les unités s'additionnent. */
  activities: readonly ActivityKind[];
  target: number;
  xp: number;
  /** Permanents seulement. */
  group?: ChallengeGroup;
}

/** Nombre de défis actifs par période. */
export const ACTIVE_COUNT: Readonly<Record<'daily' | 'weekly', number>> = { daily: 3, weekly: 2 };

/** Période d'un défi permanent (colonne period). */
export const PERMANENT_PERIOD = 'permanent';

const daily = (
  id: string,
  label: string,
  activity: ActivityKind,
  target: number,
  xp: number,
): ChallengeDefinition => ({ id, kind: 'daily', label, activities: [activity], target, xp });

const weekly = (
  id: string,
  label: string,
  activity: ActivityKind,
  target: number,
  xp: number,
): ChallengeDefinition => ({ id, kind: 'weekly', label, activities: [activity], target, xp });

const permanent = (
  group: ChallengeGroup,
  id: string,
  label: string,
  activities: readonly ActivityKind[],
  target: number,
  xp: number,
): ChallengeDefinition => ({ id, kind: 'permanent', group, label, activities, target, xp });

export const CHALLENGES: readonly ChallengeDefinition[] = [
  // Quotidiens (lot)
  daily('daily_rolls_10', 'Lancer 10 jets de dés', 'dice_roll', 10, 20),
  daily('daily_rolls_25', 'Lancer 25 jets de dés', 'dice_roll', 25, 35),
  daily('daily_messages_5', 'Envoyer 5 messages', 'chat_message', 5, 15),
  daily('daily_messages_15', 'Envoyer 15 messages', 'chat_message', 15, 25),
  daily('daily_session', 'Jouer une séance', 'session_played', 1, 30),
  daily('daily_play_30', 'Jouer 30 minutes', 'play_minutes', 30, 20),
  daily('daily_note', 'Écrire une note', 'note_written', 1, 15),

  // Hebdomadaires (lot)
  weekly('weekly_sessions_2', 'Jouer 2 séances', 'session_played', 2, 80),
  weekly('weekly_rolls_100', 'Lancer 100 jets de dés', 'dice_roll', 100, 60),
  weekly('weekly_messages_50', 'Envoyer 50 messages', 'chat_message', 50, 50),
  weekly('weekly_play_180', 'Jouer 3 heures', 'play_minutes', 180, 60),
  weekly('weekly_notes_5', 'Écrire 5 notes', 'note_written', 5, 40),
  weekly('weekly_friend', 'Ajouter un ami', 'friend_added', 1, 40),

  // Premiers pas, dans l'ordre du parcours guidé
  permanent('first_steps', 'first_profile', 'Compléter votre profil', ['profile_completed'], 1, 50),
  permanent(
    'first_steps',
    'first_character',
    'Créer votre premier personnage',
    ['character_created'],
    1,
    50,
  ),
  permanent(
    'first_steps',
    'first_campaign',
    'Créer ou rejoindre une campagne',
    ['campaign_created', 'campaign_joined'],
    1,
    50,
  ),
  permanent('first_steps', 'first_roll', 'Lancer vos premiers dés', ['dice_roll'], 1, 25),
  permanent(
    'first_steps',
    'first_session',
    'Jouer votre première séance',
    ['session_played'],
    1,
    50,
  ),
  permanent('first_steps', 'first_friend', 'Ajouter un ami', ['friend_added'], 1, 50),

  // Jalons
  permanent('milestone', 'rolls_100', 'Lancer 100 jets de dés', ['dice_roll'], 100, 100),
  permanent('milestone', 'rolls_1000', 'Lancer 1 000 jets de dés', ['dice_roll'], 1000, 300),
  permanent('milestone', 'sessions_10', 'Jouer 10 séances', ['session_played'], 10, 150),
  permanent('milestone', 'sessions_50', 'Jouer 50 séances', ['session_played'], 50, 400),
  permanent('milestone', 'campaigns_3', 'Créer 3 campagnes', ['campaign_created'], 3, 150),
  permanent('milestone', 'scheduled_5', 'Planifier 5 séances', ['session_scheduled'], 5, 100),
  permanent('milestone', 'characters_5', 'Créer 5 personnages', ['character_created'], 5, 100),
  permanent('milestone', 'friends_5', 'Se faire 5 amis', ['friend_added'], 5, 100),
  permanent('milestone', 'messages_500', 'Envoyer 500 messages', ['chat_message'], 500, 150),
  permanent('milestone', 'play_10h', 'Jouer 10 heures', ['play_minutes'], 600, 150),
  permanent('milestone', 'play_50h', 'Jouer 50 heures', ['play_minutes'], 3000, 400),
  permanent('milestone', 'notes_25', 'Écrire 25 notes', ['note_written'], 25, 100),
];

const BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

export function challengeById(id: string): ChallengeDefinition | undefined {
  return BY_ID.get(id);
}

export const PERMANENT_CHALLENGES = CHALLENGES.filter((c) => c.kind === 'permanent');

/** FNV-1a 32 bits : graine stable de la rotation. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Défis actifs de `kind` pour un joueur et une période : le lot trié par
 * fnv1a(userId:période:id), en gardant les premiers d'activités différentes.
 */
export function activeChallenges(
  userId: string,
  kind: 'daily' | 'weekly',
  period: string,
): ChallengeDefinition[] {
  const pool = CHALLENGES.filter((c) => c.kind === kind)
    .map((c) => ({ c, rank: fnv1a(`${userId.toLowerCase()}:${period}:${c.id}`) }))
    .sort((a, b) => a.rank - b.rank || a.c.id.localeCompare(b.c.id));
  const chosen: ChallengeDefinition[] = [];
  const used = new Set<string>();
  for (const { c } of pool) {
    const activity = c.activities[0]!;
    if (used.has(activity)) continue;
    used.add(activity);
    chosen.push(c);
    if (chosen.length === ACTIVE_COUNT[kind]) break;
  }
  return chosen;
}

/** Défis qui avancent avec l'une de ces activités. */
export function touches(challenge: ChallengeDefinition, kinds: ReadonlySet<ActivityKind>) {
  return challenge.activities.some((a) => kinds.has(a));
}

export interface StepCandidate {
  challenge: ChallengeDefinition;
  progress: number;
  completed: boolean;
}

/**
 * Prochaines étapes du parcours guidé (§ 7) : les Premiers pas non faits dans
 * l'ordre, puis les jalons les plus avancés.
 */
export function nextSteps(candidates: readonly StepCandidate[], limit = 3): StepCandidate[] {
  const open = candidates.filter((c) => !c.completed && c.challenge.kind === 'permanent');
  const firstSteps = open.filter((c) => c.challenge.group === 'first_steps');
  const milestones = open
    .filter((c) => c.challenge.group === 'milestone')
    .map((c, i) => ({ c, ratio: Math.min(1, c.progress / c.challenge.target), i }))
    .sort((a, b) => b.ratio - a.ratio || a.i - b.i)
    .map((x) => x.c);
  return [...firstSteps, ...milestones].slice(0, limit);
}
