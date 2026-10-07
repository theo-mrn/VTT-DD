/**
 * Module « progression » : lecture de la progression du compte (niveau, XP,
 * récompenses, défis, prochaines étapes) et de son détail pour l'export.
 * Aucune route d'écriture : seul le consommateur identity-progression écrit
 * (docs/progression.md).
 */
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { readProgression, readProgressionHistory } from './service.js';

const Challenge = z.object({
  id: z.string(),
  kind: z.enum(['daily', 'weekly', 'permanent']),
  group: z.enum(['first_steps', 'milestone']).nullable(),
  label: z.string(),
  target: z.number(),
  progress: z.number(),
  xp: z.number(),
  completed: z.boolean(),
});

const Reward = z.object({
  level: z.number(),
  type: z.enum(['title', 'border']),
  id: z.string(),
  label: z.string().nullable(),
  reached: z.boolean(),
});

const ProgressionResponse = z.object({
  level: z.number(),
  xp: z.number(),
  levelXp: z.number(),
  nextLevelXp: z.number(),
  todayXp: z.number(),
  rewards: z.array(Reward),
  nextReward: Reward.nullable(),
  borders: z.array(z.string()),
  challenges: z.object({
    daily: z.array(Challenge),
    weekly: z.array(Challenge),
    permanent: z.array(Challenge),
  }),
  steps: z.array(Challenge),
  periods: z.object({
    day: z.string(),
    week: z.string(),
    dailyEndsAt: z.string(),
    weeklyEndsAt: z.string(),
  }),
});

const HistoryResponse = z.object({
  xp: z.number(),
  level: z.number(),
  daily: z.array(
    z.object({ day: z.string(), activity: z.string(), units: z.number(), xp: z.number() }),
  ),
  counters: z.array(z.object({ activity: z.string(), total: z.number() })),
  challenges: z.array(
    z.object({
      challengeId: z.string(),
      period: z.string(),
      xp: z.number(),
      completedAt: z.string(),
    }),
  ),
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/users/me/progression',
    {
      preHandler: app.authenticate,
      schema: { response: { 200: ProgressionResponse } },
    },
    async (req) =>
      readProgression(deps.db, req.user!.userId, new Date(), {
        correlationId: req.ctx.correlationId,
        traceparent: (req.headers.traceparent as string | undefined) ?? null,
      }),
  );

  r.get(
    '/v1/users/me/progression/history',
    {
      preHandler: app.authenticate,
      schema: { response: { 200: HistoryResponse } },
    },
    async (req) => readProgressionHistory(deps.db, req.user!.userId),
  );
};
