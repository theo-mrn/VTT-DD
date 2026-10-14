/**
 * État des outils de la table (docs/automatismes.md § 4), un par campagne, gardé par le service
 * campaign : heure du monde, horloges de progression, minuteur, jetons de destin, ambiance
 * d'écran, pause. Le MJ l'écrit ; tous le lisent (le MJ seul voit l'heure cachée et les horloges
 * secrètes) ; les automatismes réagissent dessus et le changent.
 *
 * Les durées voyagent en instants du serveur (`anchorAt`, `endsAt`) avec `serverTime` : le
 * client en déduit l'écart de son horloge.
 */
import { z } from 'zod';
import { AutomationEffect, AutomationMood } from './automation.js';
import { ExpectedVersion, MapWeather } from './map.js';

const DAY_MS = 86_400_000;

export const TableWorldTime = z.object({
  /** Minutes depuis le jour 1 à 0 h, à l'instant `anchorAt`. */
  minutes: z.number(),
  visible: z.boolean(),
  /** Minutes de jeu par minute réelle ; 0 : figé. */
  rate: z.number(),
  anchorAt: z.string(),
});
export type TableWorldTime = z.infer<typeof TableWorldTime>;

export const TableClock = z.object({
  id: z.string(),
  name: z.string(),
  segments: z.number().int(),
  filled: z.number().int(),
  visible: z.boolean(),
});
export type TableClock = z.infer<typeof TableClock>;

export const TableTimer = z.object({
  label: z.string(),
  durationMs: z.number().int(),
  /** Reste à courir quand le minuteur est en pause. */
  remainingMs: z.number().int(),
  /** Échéance (instant du serveur) ; null : en pause. */
  endsAt: z.string().nullable(),
});
export type TableTimer = z.infer<typeof TableTimer>;

export const TableFate = z.object({
  count: z.number().int(),
  max: z.number().int(),
  /** Dernière dépense : qui, quand (instant du serveur). */
  last: z.object({ userId: z.string(), at: z.string() }).nullable(),
});
export type TableFate = z.infer<typeof TableFate>;

export const TableState = z.object({
  worldTime: TableWorldTime.nullable(),
  clocks: z.array(TableClock),
  timer: TableTimer.nullable(),
  fate: TableFate.nullable(),
  mood: AutomationMood.nullable(),
  /** Ambiances d'un seul joueur, par userId (MJ ; vide pour un joueur). */
  moods: z.record(z.string(), AutomationMood),
  /** Joueur : son ambiance à lui, qui passe devant celle de la table (null pour le MJ). */
  personalMood: AutomationMood.nullable(),
  /** Météos d'un seul joueur, par userId (MJ ; vide pour un joueur) ; null : temps clair. */
  weathers: z.record(z.string(), MapWeather.nullable()),
  /** Joueur : sa météo à lui, qui passe devant celle de la scène ; null : il suit la scène. */
  personalWeather: z.object({ weather: MapWeather.nullable() }).nullable(),
  paused: z.boolean(),
  version: z.number().int(),
  updatedAt: z.string().nullable(),
  /** Heure du serveur à la réponse (écart d'horloge du client). */
  serverTime: z.string(),
});
export type TableState = z.infer<typeof TableState>;

// ─── Écritures (MJ) ──────────────────────────────────────────────────────────

const WorldTimeInput = z.strictObject({
  minutes: z
    .number()
    .finite()
    .min(0)
    .max(1_000_000 * 1440),
  visible: z.boolean(),
  rate: z.number().min(0).max(3600),
});

const ClockInput = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().trim().max(60),
  segments: z.number().int().min(2).max(12),
  filled: z.number().int().min(0).max(12),
  visible: z.boolean(),
});

const TimerInput = z.strictObject({
  label: z.string().trim().max(80),
  durationMs: z.number().int().min(0).max(DAY_MS),
  remainingMs: z.number().int().min(0).max(DAY_MS),
  running: z.boolean(),
});

const FateInput = z.strictObject({
  count: z.number().int().min(0).max(20),
  max: z.number().int().min(1).max(20),
});

/** Chaque clé envoyée remplace la valeur ; absente, elle ne change pas. */
export const UpdateTableState = z.strictObject({
  worldTime: WorldTimeInput.nullable().optional(),
  clocks: z.array(ClockInput).max(20).optional(),
  timer: TimerInput.nullable().optional(),
  fate: FateInput.nullable().optional(),
  mood: AutomationMood.nullable().optional(),
  /** Remplace toutes les ambiances par joueur (userId → ambiance). */
  moods: z
    .record(z.uuid(), AutomationMood)
    .refine((m) => Object.keys(m).length <= 50, 'Trop de joueurs')
    .optional(),
  /** Remplace toutes les météos par joueur (userId → météo, null : temps clair). */
  weathers: z
    .record(z.uuid(), MapWeather.nullable())
    .refine((m) => Object.keys(m).length <= 50, 'Trop de joueurs')
    .optional(),
  paused: z.boolean().optional(),
  version: ExpectedVersion,
});
export type UpdateTableState = z.input<typeof UpdateTableState>;

/** Effet ponctuel joué chez toute la table, ou chez ces joueurs seulement (`table.fx`). */
export const PlayTableFx = z.strictObject({
  effect: AutomationEffect,
  userIds: z.array(z.uuid()).min(1).max(50).optional(),
});

/**
 * Écran d'un joueur changé (`table_state.personal`, envoyé à lui seul) :
 * `{ mood, weather: { weather } | null }` (weather null : il suit la scène).
 */
export const TABLE_STATE_PERSONAL = 'table_state.personal';
export type PlayTableFx = z.input<typeof PlayTableFx>;
