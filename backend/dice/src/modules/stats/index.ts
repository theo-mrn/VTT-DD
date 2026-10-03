/**
 * Module « stats » : statistiques de jets, avec les calculs de l'ancien
 * composant legacy/src/components/(dices)/dice-stats.tsx, faits côté serveur
 * sur tout l'historique (et plus seulement les 50 derniers jets chargés).
 *
 *   GET /v1/dice/stats?campaignId=&userId=&diceType=1d20&faces=20
 *
 * Comme l'ancienne app : statistiques sur les valeurs brutes des dés (sans
 * modificateurs, dés écartés compris), par joueur et globales ; filtre par
 * type de dé `diceType` (`${diceCount}d${diceFaces}`, premier groupe du jet) ;
 * critiques et échecs critiques comptés sur les jets de 1d20 (20 et 1
 * naturels). En plus : `faces` (tous les jets dont le premier groupe a ce
 * nombre de faces), la série en cours, les critiques et échecs critiques des
 * jets (`outcomes`, même règle que le badge d'un jet) et la répartition par
 * taille de dé (`byFaces` : seulement les dés de cette taille, sans les
 * autres dés du jet).
 *
 * Seuls comptent les jets dont l'appelant voit le résultat : dans une
 * campagne, les jets publics, les siens (sauf ses jets cachés au MJ) et, pour
 * le MJ, les jets privés et cachés. Sans campagne : ses propres jets, toutes
 * campagnes confondues (hors jets cachés au MJ). Les jets à symboles n'ont pas
 * de valeur numérique : ils ne comptent pas.
 */
import { HttpError } from '@vtt/platform';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rolls, type RollRow } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { flatResults } from '../../engine/roll.js';
import { memberRole } from '../rolls/index.js';
import { visibleTo, type Viewer } from '../rolls/repository.js';
import { CampaignId, currentUser, UserId } from '../schemas.js';
import { compareCodeUnits } from '@vtt/contracts';

/** Jets lus au plus (les plus récents) pour un calcul. */
export const MAX_STATS_ROLLS = 10_000;

const PlayerStats = z.object({
  userId: z.string().nullable(),
  userName: z.string(),
  userAvatar: z.string().nullable(),
  totalRolls: z.number().int(),
  averageRoll: z.number(),
  highestRoll: z.number().nullable(),
  lowestRoll: z.number().nullable(),
  totalSum: z.number(),
  criticalSuccesses: z.number().int(),
  criticalFailures: z.number().int(),
  rollDistribution: z.record(z.string(), z.number().int()),
});
type PlayerStats = z.output<typeof PlayerStats>;

const Stats = z.object({
  /** Jets pris en compte (après filtres). */
  rollCount: z.number().int(),
  /** Types de dé présents (`1d20`, `2d6`…), triés, avant le filtre `diceType`. */
  diceTypes: z.array(z.string()),
  /** Par joueur, du plus grand nombre de dés lancés au plus petit. */
  players: z.array(PlayerStats),
  globalDistribution: z.array(z.object({ value: z.number(), count: z.number().int() })),
  /** Évolution : moyenne des dés de chaque jet, du plus ancien au plus récent. */
  timeline: z.array(z.object({ roll: z.number().int(), total: z.number(), notation: z.string() })),
  /** Série en cours : derniers dés tous au-dessus (high) ou en dessous (low) de la moyenne. */
  streak: z.object({ direction: z.enum(['high', 'low']).nullable(), length: z.number().int() }),
  /** Jets critiques et échecs critiques, selon `outcome` de chaque jet (badge de l'historique). */
  outcomes: z.object({ critical: z.number().int(), fumble: z.number().int() }),
  /**
   * Par taille de dé (d20, d6…), seulement les dés de cette taille, écartés
   * compris : nombre, somme, répartition des faces. Triée par taille.
   */
  byFaces: z.array(
    z.object({
      faces: z.number().int(),
      count: z.number().int(),
      sum: z.number(),
      distribution: z.array(z.object({ value: z.number(), count: z.number().int() })),
    }),
  ),
});
export type Stats = z.output<typeof Stats>;

const DiceType = z.string().regex(/^\d{1,3}d\d{1,5}$/, 'Type de dé attendu : 1d20');

type StatRow = Pick<
  RollRow,
  'authorId' | 'authorName' | 'authorAvatarUrl' | 'diceCount' | 'diceFaces' | 'dice' | 'notation'
> &
  Partial<Pick<RollRow, 'outcome'>>;

export function streakOf(
  values: number[],
  faces: number,
): { direction: 'high' | 'low' | null; length: number } {
  const mean = (faces + 1) / 2;
  const side = (v: number) => {
    if (v > mean) return 'high';
    return v < mean ? 'low' : null;
  };
  const direction = values.length ? side(values[0]!) : null;
  if (!direction) return { direction: null, length: 0 };
  let length = 0;
  while (length < values.length && side(values[length]!) === direction) length++;
  return { direction, length };
}

/**
 * Calculs de dice-stats.tsx sur des jets du plus récent au plus ancien.
 * Joueur : compte de l'auteur (ou, pour un jet importé sans compte, son nom).
 */
export function computeStats(
  recentFirst: readonly StatRow[],
  filters: { diceType?: string; faces?: number; userId?: string },
): Stats {
  const typeOf = (r: StatRow) => `${r.diceCount}d${r.diceFaces}`;
  const diceTypes = [...new Set(recentFirst.map(typeOf))].sort(compareCodeUnits);
  const filtered = recentFirst.filter(
    (r) =>
      (!filters.diceType || typeOf(r) === filters.diceType) &&
      (!filters.faces || r.diceFaces === filters.faces),
  );

  const players = new Map<string, PlayerStats>();
  const global = new Map<number, number>();
  const sizes = new Map<number, { count: number; sum: number; values: Map<number, number> }>();
  const outcomes = { critical: 0, fumble: 0 };
  for (const roll of filtered) {
    if (roll.outcome?.critical) outcomes.critical += 1;
    if (roll.outcome?.fumble) outcomes.fumble += 1;
    for (const group of roll.dice) {
      let size = sizes.get(group.faces);
      if (!size) sizes.set(group.faces, (size = { count: 0, sum: 0, values: new Map() }));
      for (const { value } of group.values) {
        size.count += 1;
        size.sum += value;
        size.values.set(value, (size.values.get(value) ?? 0) + 1);
      }
    }
    const key = roll.authorId ?? `name:${roll.authorName}`;
    let p = players.get(key);
    if (!p) {
      // Jets du plus récent au plus ancien : le premier vu donne le nom actuel
      p = {
        userId: roll.authorId,
        userName: roll.authorName,
        userAvatar: roll.authorAvatarUrl,
        totalRolls: 0,
        averageRoll: 0,
        highestRoll: null,
        lowestRoll: null,
        totalSum: 0,
        criticalSuccesses: 0,
        criticalFailures: 0,
        rollDistribution: {},
      };
      players.set(key, p);
    }
    const d20 = roll.diceFaces === 20 && roll.diceCount === 1;
    const first = roll.dice[0];
    for (const [i, value] of flatResults(roll.dice, null).entries()) {
      p.totalRolls += 1;
      p.totalSum += value;
      p.highestRoll = Math.max(p.highestRoll ?? -Infinity, value);
      p.lowestRoll = Math.min(p.lowestRoll ?? Infinity, value);
      // Critiques : seulement le d20 d'un jet de 1d20 (pas les autres dés du jet)
      if (d20 && first && i < first.values.length) {
        if (value === 20) p.criticalSuccesses += 1;
        if (value === 1) p.criticalFailures += 1;
      }
      p.rollDistribution[value] = (p.rollDistribution[value] ?? 0) + 1;
      global.set(value, (global.get(value) ?? 0) + 1);
    }
  }
  for (const p of players.values()) p.averageRoll = p.totalRolls ? p.totalSum / p.totalRolls : 0;

  const timelineRolls = filters.userId
    ? filtered.filter((r) => r.authorId === filters.userId)
    : filtered;
  const timeline = timelineRolls
    .slice()
    .reverse()
    .map((roll, index) => {
      const values = flatResults(roll.dice, null);
      const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      return {
        roll: index + 1,
        total: Number.parseFloat(avg.toFixed(2)),
        notation: roll.notation || typeOf(roll),
      };
    });

  // Série : sur un seul nombre de faces, sinon la moyenne n'a pas de sens
  const faces = filters.faces ?? (filters.diceType ? Number(filters.diceType.split('d')[1]) : 0);
  const streak = faces
    ? streakOf(
        // Du dernier dé lancé au plus ancien
        timelineRolls.flatMap((r) =>
          r.dice
            .filter((g) => g.faces === faces)
            .flatMap((g) => g.values.map((v) => v.value))
            .reverse(),
        ),
        faces,
      )
    : { direction: null, length: 0 };

  return {
    rollCount: filtered.length,
    diceTypes,
    players: [...players.values()].sort((a, b) => b.totalRolls - a.totalRolls),
    globalDistribution: [...global]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value - b.value),
    timeline,
    streak,
    outcomes,
    byFaces: [...sizes]
      .sort(([a], [b]) => a - b)
      .map(([faces, size]) => ({
        faces,
        count: size.count,
        sum: size.sum,
        distribution: [...size.values]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => a.value - b.value),
      })),
  };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.get(
    '/v1/dice/stats',
    {
      preValidation: app.authenticate,
      schema: {
        querystring: z.object({
          campaignId: CampaignId.optional(),
          userId: UserId.optional(),
          diceType: DiceType.optional(),
          faces: z.coerce.number().int().min(1).max(10_000).optional(),
        }),
        response: { 200: Stats },
      },
    },
    async (req) => {
      const me = currentUser(req);
      const { campaignId, userId, diceType, faces } = req.query;

      let where;
      if (campaignId) {
        const viewer: Viewer = { userId: me, role: await memberRole(deps, campaignId, me) };
        where = and(
          visibleTo(viewer, campaignId, true),
          userId ? eq(rolls.authorId, userId) : undefined,
        );
      } else {
        if (userId && userId !== me)
          throw new HttpError(
            403,
            'Accès refusé',
            'campaign_required',
            'Les statistiques d’un autre joueur se consultent dans une campagne commune',
          );
        where = and(eq(rolls.authorId, me), ne(rolls.visibility, 'gm'));
      }

      const recentFirst = await db
        .select({
          authorId: rolls.authorId,
          authorName: rolls.authorName,
          authorAvatarUrl: rolls.authorAvatarUrl,
          diceCount: rolls.diceCount,
          diceFaces: rolls.diceFaces,
          dice: rolls.dice,
          notation: rolls.notation,
          outcome: rolls.outcome,
        })
        .from(rolls)
        .where(and(where, isNull(rolls.symbols)))
        .orderBy(desc(rolls.id))
        .limit(MAX_STATS_ROLLS);

      return computeStats(recentFirst, {
        ...(diceType ? { diceType } : {}),
        ...(faces ? { faces } : {}),
        ...(userId ? { userId } : {}),
      });
    },
  );
};
