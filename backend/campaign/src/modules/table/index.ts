/**
 * Module « table » : état des outils de la table (docs/automatismes.md § 4).
 *
 *   GET   /v1/campaigns/:id/table-state             tous (heure cachée et horloges secrètes : MJ)
 *   PATCH /v1/campaigns/:id/table-state             MJ : chaque clé envoyée remplace la valeur
 *   POST  /v1/campaigns/:id/table-state/fate/spend  un joueur dépense un jeton de destin
 *   POST  /v1/campaigns/:id/table-fx                MJ : effet ponctuel, à tous ou à des joueurs
 *
 * Chaque écriture publie `table_state.updated` (public, vue des joueurs) et
 * `table_state.gm_updated` (MJ, tout) ; un effet publie `table.fx`. L'ambiance d'un seul joueur
 * (`moods`) ne part jamais dans la vue publique : il la reçoit seul (`table_state.personal`) et
 * la relit dans sa vue (`personalMood`). Les instants (`anchorAt`,
 * `endsAt`) sont ceux du serveur, envoyés avec `serverTime`.
 */
import {
  type MapWeather,
  PlayTableFx,
  TABLE_STATE_PERSONAL,
  UpdateTableState,
  type TableClock,
  type TableFate,
  type TableState,
  type TableTimer,
  type TableWorldTime,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import { tableStates } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  mapEvent,
  requestContext,
  requireGm,
  versionConflict,
  type Viewer,
  viewerOf,
} from '../maps/common.js';
import { CampaignId } from '../schemas.js';

/** Ce que garde la base (instants ISO du serveur). */
export interface StoredTableState {
  worldTime: TableWorldTime | null;
  clocks: TableClock[];
  timer: TableTimer | null;
  fate: TableFate | null;
  mood: TableState['mood'];
  moods: Record<string, NonNullable<TableState['mood']>>;
  weathers: Record<string, MapWeather | null>;
  paused: boolean;
}

const EMPTY: StoredTableState = {
  worldTime: null,
  clocks: [],
  timer: null,
  fate: null,
  mood: null,
  moods: {},
  weathers: {},
  paused: false,
};

export const stored = (raw: Record<string, unknown> | undefined): StoredTableState => ({
  ...EMPTY,
  ...(raw as Partial<StoredTableState> | undefined),
});

/** Vue d'un membre : le MJ voit tout, les joueurs ni l'heure cachée ni les horloges secrètes. */
export function tableStateFor(
  s: StoredTableState,
  gm: boolean,
  meta: { version: number; updatedAt: Date | null },
  /** Joueur qui lit : son ambiance à lui. */
  userId?: string,
): TableState {
  return {
    worldTime: s.worldTime && (gm || s.worldTime.visible) ? s.worldTime : null,
    clocks: gm ? s.clocks : s.clocks.filter((c) => c.visible),
    timer: s.timer,
    fate: s.fate,
    mood: s.mood,
    moods: gm ? s.moods : {},
    personalMood: !gm && userId ? (s.moods[userId] ?? null) : null,
    weathers: gm ? s.weathers : {},
    personalWeather:
      !gm && userId && userId in s.weathers ? { weather: s.weathers[userId] ?? null } : null,
    paused: s.paused,
    version: meta.version,
    updatedAt: meta.updatedAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
  };
}

export async function loadTableState(db: Db | Tx, campaignId: string, lock = false) {
  const q = db.select().from(tableStates).where(eq(tableStates.campaignId, campaignId));
  const [row] = lock ? await q.for('update') : await q;
  return row ?? null;
}

/** Enregistre l'état et publie ses deux vues (joueurs, MJ). */
export async function saveTableState(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  next: StoredTableState,
): Promise<TableState> {
  const campaignId = v.access.campaign.id;
  const avant = stored((await loadTableState(tx, campaignId))?.state);
  const [row] = await tx
    .insert(tableStates)
    .values({ campaignId, state: next as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: tableStates.campaignId,
      set: {
        state: next as unknown as Record<string, unknown>,
        version: sql`${tableStates.version} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  const meta = { version: row!.version, updatedAt: row!.updatedAt };
  const aggregate = { type: 'table_state', id: campaignId };
  await mapEvent(tx, ctx, v, {
    type: 'table_state.updated',
    aggregate,
    payload: tableStateFor(next, false, meta),
  });
  await mapEvent(tx, ctx, v, {
    type: 'table_state.gm_updated',
    aggregate,
    payload: tableStateFor(next, true, meta),
    visibility: 'gm_only',
  });
  // Écran d'un seul joueur (ambiance, météo) : à lui seul (et aux MJ, qui l'ignorent)
  const ecran = (x: StoredTableState, uid: string) => ({
    mood: x.moods[uid] ?? null,
    weather: uid in x.weathers ? { weather: x.weathers[uid] ?? null } : null,
  });
  const joueurs = new Set([
    ...Object.keys(avant.moods),
    ...Object.keys(next.moods),
    ...Object.keys(avant.weathers),
    ...Object.keys(next.weathers),
  ]);
  for (const uid of joueurs) {
    const apres = ecran(next, uid);
    if (JSON.stringify(ecran(avant, uid)) !== JSON.stringify(apres))
      await mapEvent(tx, ctx, v, {
        type: TABLE_STATE_PERSONAL,
        aggregate,
        payload: apres,
        visibility: 'gm_only',
        toUsers: [uid],
      });
  }
  return tableStateFor(next, v.isGm, meta, v.userId);
}

const Params = z.object({ id: CampaignId });

export const register: Module = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };

  r.get('/v1/campaigns/:id/table-state', { ...auth, schema: { params: Params } }, async (req) => {
    const { userId } = requestContext(req);
    const v = await viewerOf(db, req.params.id, userId);
    const row = await loadTableState(db, v.access.campaign.id);
    return tableStateFor(
      stored(row?.state),
      v.isGm,
      { version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null },
      v.userId,
    );
  });

  r.patch(
    '/v1/campaigns/:id/table-state',
    { ...auth, schema: { params: Params, body: UpdateTableState } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const row = await loadTableState(tx, v.access.campaign.id, true);
        const { version, ...b } = req.body;
        if (version !== undefined && version !== (row?.version ?? 0)) throw versionConflict();
        const now = Date.now();
        const s = stored(row?.state);
        const next: StoredTableState = {
          ...s,
          ...(b.worldTime !== undefined
            ? {
                worldTime: b.worldTime && {
                  ...b.worldTime,
                  anchorAt: new Date(now).toISOString(),
                },
              }
            : {}),
          ...(b.clocks !== undefined
            ? {
                clocks: b.clocks.map((c) => ({ ...c, filled: Math.min(c.filled, c.segments) })),
              }
            : {}),
          ...(b.timer !== undefined
            ? {
                timer: b.timer && {
                  label: b.timer.label,
                  durationMs: Math.max(b.timer.durationMs, b.timer.remainingMs),
                  remainingMs: b.timer.remainingMs,
                  endsAt: b.timer.running
                    ? new Date(now + b.timer.remainingMs).toISOString()
                    : null,
                },
              }
            : {}),
          ...(b.fate !== undefined
            ? {
                fate: b.fate && {
                  max: b.fate.max,
                  count: Math.min(b.fate.count, b.fate.max),
                  last: s.fate?.last ?? null,
                },
              }
            : {}),
          ...(b.mood !== undefined ? { mood: b.mood } : {}),
          ...(b.moods !== undefined ? { moods: b.moods } : {}),
          ...(b.weathers !== undefined ? { weathers: b.weathers } : {}),
          ...(b.paused !== undefined ? { paused: b.paused } : {}),
        };
        return saveTableState(tx, ctx, v, next);
      });
    },
  );

  r.post(
    '/v1/campaigns/:id/table-state/fate/spend',
    { ...auth, schema: { params: Params } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        if (v.access.role === 'spectator')
          throw HttpError.forbidden('Un spectateur ne dépense pas de jeton');
        const row = await loadTableState(tx, v.access.campaign.id, true);
        const s = stored(row?.state);
        if (!s.fate || s.fate.count <= 0)
          throw HttpError.conflict('Plus aucun jeton de destin', 'no_fate_token');
        return saveTableState(tx, ctx, v, {
          ...s,
          fate: {
            ...s.fate,
            count: s.fate.count - 1,
            last: { userId, at: new Date().toISOString() },
          },
        });
      });
    },
  );

  r.post(
    '/v1/campaigns/:id/table-fx',
    { ...auth, schema: { params: Params, body: PlayTableFx } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const { effect, userIds } = req.body;
        await mapEvent(tx, ctx, v, {
          type: 'table.fx',
          aggregate: { type: 'table_state', id: v.access.campaign.id },
          payload: userIds ? { effect, userIds } : { effect },
          ...(userIds ? { visibility: 'gm_only' as const, toUsers: userIds } : {}),
        });
      });
      reply.code(204);
    },
  );
};
