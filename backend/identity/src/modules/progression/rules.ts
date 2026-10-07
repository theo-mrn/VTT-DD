/**
 * Règles d'expérience : ce que rapporte chaque activité et son plafond par jour
 * de Paris (docs/progression.md § 3). Table déclarative, seule source des gains.
 *
 * Au-delà du plafond, l'activité compte encore pour les défis (unités), elle ne
 * rapporte plus d'XP ce jour-là. `dailyXpCap: null` : pas de plafond (activité
 * déjà unique par sa clé, ex. profil complété).
 */

export const ACTIVITY_KINDS = [
  'dice_roll',
  'chat_message',
  'session_played',
  'play_minutes',
  'character_created',
  'campaign_created',
  'campaign_joined',
  'session_scheduled',
  'note_written',
  'friend_added',
  'profile_completed',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface XpRule {
  /** XP par unité (un jet, un message, une minute…). */
  xpPerUnit: number;
  /** XP au plus par jour de Paris ; null : sans plafond. */
  dailyXpCap: number | null;
}

export const XP_RULES: Readonly<Record<ActivityKind, XpRule>> = {
  dice_roll: { xpPerUnit: 2, dailyXpCap: 40 },
  chat_message: { xpPerUnit: 1, dailyXpCap: 20 },
  session_played: { xpPerUnit: 40, dailyXpCap: 80 },
  play_minutes: { xpPerUnit: 1, dailyXpCap: 30 },
  character_created: { xpPerUnit: 30, dailyXpCap: 60 },
  campaign_created: { xpPerUnit: 50, dailyXpCap: 50 },
  campaign_joined: { xpPerUnit: 30, dailyXpCap: 60 },
  session_scheduled: { xpPerUnit: 20, dailyXpCap: 40 },
  note_written: { xpPerUnit: 5, dailyXpCap: 20 },
  friend_added: { xpPerUnit: 25, dailyXpCap: 75 },
  profile_completed: { xpPerUnit: 50, dailyXpCap: null },
};

/**
 * XP gagnée pour `units` unités quand `alreadyToday` XP a déjà été gagnée ce
 * jour-là pour la même activité : jamais négative, jamais au-delà du plafond.
 */
export function cappedXp(kind: ActivityKind, units: number, alreadyToday: number): number {
  const rule = XP_RULES[kind];
  const wanted = Math.max(0, Math.floor(units * rule.xpPerUnit));
  if (rule.dailyXpCap === null) return wanted;
  return Math.max(0, Math.min(wanted, rule.dailyXpCap - alreadyToday));
}
