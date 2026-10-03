/**
 * Module « channels » : canaux musique et ambiance d'une campagne (§ 3.5).
 *
 *   GET  /v1/audio/campaigns/:id/channels                     membres (spectateurs compris)
 *   POST /v1/audio/campaigns/:id/channels/:channel/commands   MJ
 *
 * Commandes d'intention (play, pause, resume, seek, stop, next, previous,
 * configure) : verrou de ligne, `expectedVersion` facultative (409
 * version_conflict avec l'état courant), sans effet → 200 sans événement.
 */
import {
  ChannelCommand,
  ChannelName,
  ChannelState,
  type ChannelCommand as Command,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import {
  actorOf,
  CampaignParams,
  currentUser,
  eventContext,
  memberRole,
  requireGm,
  sendProblem,
} from '../common.js';
import { applyCommand, MachineError } from './machine.js';
import {
  buildState,
  loadAssets,
  lockChannel,
  playlistOrder,
  readChannel,
  saveTransition,
  toMachine,
} from './repository.js';

/** Fenêtre glissante en mémoire : COMMAND_RATE_PER_CHANNEL commandes par seconde et par canal. */
function rateLimiter(max: number, windowMs = 1_000) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value!);
    return true;
  };
}

/** Commandes qui (re)lancent le son : ancre posée dans le futur. */
const STARTS = new Set<Command['type']>(['play', 'resume', 'seek', 'next', 'previous']);

/** Assets désignés par une commande (à charger avec la file). */
const commandAssets = (c: Command): string[] => (c.type === 'play' && c.assetId ? [c.assetId] : []);

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const allow = rateLimiter(deps.config.COMMAND_RATE_PER_CHANNEL);

  r.get(
    '/v1/audio/campaigns/:id/channels',
    {
      ...auth,
      schema: {
        params: CampaignParams,
        response: {
          200: z.object({
            serverTime: z.number(),
            channels: z.object({ music: ChannelState, ambience: ChannelState }),
          }),
        },
      },
    },
    async (req, reply) => {
      await memberRole(deps, req.params.id, currentUser(req));
      const now = deps.now();
      const [music, ambience] = await Promise.all(
        (['music', 'ambience'] as const).map((c) =>
          readChannel(db, req.params.id, c, deps.storage, now),
        ),
      );
      reply.header('cache-control', 'no-store');
      return { serverTime: deps.now(), channels: { music: music!, ambience: ambience! } };
    },
  );

  r.post(
    '/v1/audio/campaigns/:id/channels/:channel/commands',
    {
      ...auth,
      schema: {
        params: CampaignParams.extend({ channel: ChannelName }),
        body: ChannelCommand,
        response: { 200: ChannelState },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const { id: campaignId, channel } = req.params;
      const role = await requireGm(deps, campaignId, userId);
      const command: Command = req.body;
      if (!allow(`${campaignId}:${channel}`, deps.now()))
        throw new HttpError(
          429,
          'Trop de requêtes',
          'rate_limited',
          'Trop de commandes sur ce canal',
        );

      const outcome = await db
        .transaction(async (tx) => {
          const now = deps.now();
          const row = await lockChannel(tx, campaignId, channel, now);
          const playlistId =
            command.type === 'play' && command.playlistId ? command.playlistId : row.playlistId;
          const playlist = playlistId
            ? { id: playlistId, assetIds: await playlistOrder(tx, playlistId) }
            : null;
          const { rows, infos } = await loadAssets(tx, [
            ...row.queue,
            ...(row.assetId ? [row.assetId] : []),
            ...(playlist?.assetIds ?? []),
            ...commandAssets(command),
          ]);
          // Assets d'une autre campagne : invisibles
          for (const [id, a] of rows)
            if (a.campaignId !== campaignId) {
              rows.delete(id);
              infos.delete(id);
            }
          if (command.type === 'play' && command.assetId && !rows.has(command.assetId))
            throw HttpError.notFound('Son introuvable');
          if (
            command.type === 'play' &&
            command.playlistId &&
            playlist &&
            !playlist.assetIds.every((a) => rows.has(a))
          )
            throw HttpError.notFound('Playlist introuvable');

          if (command.expectedVersion !== undefined && command.expectedVersion !== row.version)
            return { conflict: buildState(row, rows, infos, deps.storage) } as const;

          // Départ différé pour tous les clients (voir CHANNEL_START_LEAD_MS)
          const at = STARTS.has(command.type) ? now + deps.config.CHANNEL_START_LEAD_MS : now;
          const next = applyCommand(toMachine(row), command, at, {
            assets: infos,
            playlist,
            random: deps.random,
          });
          const { state } = await saveTransition(tx, {
            row,
            next,
            rows,
            infos,
            storage: deps.storage,
            cause: command.type,
            actor: actorOf(userId, role),
            ctx: eventContext(req),
            nowMs: now,
          });
          return { state } as const;
        })
        .catch((e: unknown) => {
          if (e instanceof MachineError)
            throw new HttpError(
              e.status,
              e.status === 409 ? 'Conflit' : 'Commande impossible',
              e.code,
              e.message,
            );
          throw e;
        });

      if ('conflict' in outcome)
        return sendProblem(reply, 409, 'Conflit', 'version_conflict', {
          detail: 'Le canal a changé entre-temps',
          current: outcome.conflict,
        });
      return outcome.state;
    },
  );
};
