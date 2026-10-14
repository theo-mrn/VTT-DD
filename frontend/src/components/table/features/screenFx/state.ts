/**
 * Effets d'écran : le MJ secoue, éclaire ou assombrit l'écran de toute la table.
 * - Ponctuels (événement `table.fx`, jamais enregistrés) : secousse, séisme, éclair, battement.
 * - Ambiances qui durent (état de la table, serveur) : sombre, danger, froid, rêve ; une seule
 *   à la fois, reprise par les arrivants. Le MJ peut en donner une à un seul joueur : elle passe
 *   devant celle de la table, chez lui seul.
 */
import type { MapWeather } from '@vtt/contracts';
import { createTableSlice } from '../shared/table-state';

/** Effets ponctuels ; libellé : `table.screenFx.effects.<clé>`. */
export const ONE_SHOTS = ['shake', 'quake', 'flash', 'heartbeat'] as const;
export type OneShot = (typeof ONE_SHOTS)[number];

/** Ambiances qui durent ; libellé : `table.screenFx.moods.<clé>`. */
export const MOODS = ['dark', 'danger', 'cold', 'dream'] as const;
export type Mood = (typeof MOODS)[number];

export const isOneShot = (v: unknown): v is OneShot =>
  typeof v === 'string' && (ONE_SHOTS as readonly string[]).includes(v);
export const isMood = (v: unknown): v is Mood =>
  typeof v === 'string' && (MOODS as readonly string[]).includes(v);

/** Ambiance d'écran : tranche de l'état de table (serveur). */
export const mood = createTableSlice<Mood>(
  (s) => s.mood,
  (m) => ({ mood: m }),
);

/** Ambiances d'un seul joueur (MJ) : userId → ambiance. */
export const personalMoods = createTableSlice<Record<string, Mood>>(
  (s) => s.moods,
  (m) => ({ moods: m ?? {} }),
);

/** Ambiance affichée sur cet écran : la sienne, sinon celle de la table. */
export const shownMood = createTableSlice<Mood>(
  (s) => s.personalMood ?? s.mood,
  () => ({}),
);

/** Météos d'un seul joueur (MJ) : userId → météo (null : temps clair). */
export const personalWeathers = createTableSlice<Record<string, MapWeather | null>>(
  (s) => s.weathers,
  (m) => ({ weathers: m ?? {} }),
);
