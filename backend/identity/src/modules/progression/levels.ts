/**
 * Niveaux du compte et récompenses aux paliers (docs/progression.md § 4 et 5).
 *
 * XP pour passer du niveau n au niveau n + 1 : 100 + 50 (n − 1).
 * XP cumulée pour atteindre le niveau L : 100 (L − 1) + 25 (L − 1)(L − 2).
 */
import { slugDe } from '../titres/catalogue.js';

/** XP cumulée nécessaire pour atteindre `level` (1 → 0). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level)) - 1;
  return 100 * n + 25 * n * (n - 1);
}

/** Niveau atteint avec `xp` (au moins 1). */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  // Racine de 25 n² + 75 n − xp = 0, puis correction des arrondis
  let level = Math.floor((-75 + Math.sqrt(75 * 75 + 100 * xp)) / 50) + 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  return level;
}

export type RewardType = 'title' | 'border';

export interface LevelReward {
  level: number;
  type: RewardType;
  /** Slug du titre ou identifiant de la bordure (profiles.border_type). */
  id: string;
}

/** Paliers. Les titres existent au catalogue (titres/catalogue.ts). */
export const LEVEL_REWARDS: readonly LevelReward[] = [
  { level: 3, type: 'border', id: 'blue' },
  { level: 5, type: 'title', id: slugDe('Aventurier Confirmé') },
  { level: 8, type: 'border', id: 'orange' },
  { level: 10, type: 'title', id: slugDe('Héros Accompli') },
  { level: 15, type: 'border', id: 'magic_green' },
  { level: 20, type: 'title', id: slugDe('Légende Vivante') },
  { level: 25, type: 'border', id: 'magic_red' },
  { level: 30, type: 'title', id: slugDe('Pilier de la Table') },
  { level: 40, type: 'border', id: 'magic_double' },
  { level: 50, type: 'title', id: slugDe('Mythe Vivant') },
];

/** Récompenses gagnées en passant de `from` à `to` (from exclu, to inclus). */
export function rewardsBetween(from: number, to: number): LevelReward[] {
  return LEVEL_REWARDS.filter((r) => r.level > from && r.level <= to);
}

/** Bordures acquises au niveau `level`. */
export function bordersForLevel(level: number): string[] {
  return LEVEL_REWARDS.filter((r) => r.type === 'border' && r.level <= level).map((r) => r.id);
}

/** Prochaine récompense après le niveau `level`, ou null. */
export function nextReward(level: number): LevelReward | null {
  return LEVEL_REWARDS.find((r) => r.level > level) ?? null;
}
