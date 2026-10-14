/**
 * Exécute une commande sur un canal (verrou de ligne, machine d'état, événement) : appelée par
 * la route du MJ et par le consommateur des automatismes (`automation.audio`, docs/automatismes.md).
 * Renvoie l'état, ou `conflict` si `expectedVersion` ne correspond plus. Les erreurs de la
 * machine (`MachineError`) et l'absence d'un son (`HttpError` 404) remontent à l'appelant.
 */
import type { ChannelCommand as Command, ChannelName, ChannelState } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { Deps } from '../../deps.js';
import { applyCommand } from './machine.js';
import {
  buildState,
  loadAssets,
  lockChannel,
  playlistOrder,
  saveTransition,
  toMachine,
} from './repository.js';

/** Commandes qui (re)lancent le son : ancre posée dans le futur. */
const STARTS = new Set<Command['type']>(['play', 'resume', 'seek', 'next', 'previous']);

/** Assets désignés par une commande (à charger avec la file). */
const commandAssets = (c: Command): string[] => (c.type === 'play' && c.assetId ? [c.assetId] : []);

export async function executeChannelCommand(
  deps: Pick<Deps, 'db' | 'config' | 'storage' | 'now' | 'random'>,
  o: {
    campaignId: string;
    channel: ChannelName;
    command: Command;
    actor: { userId: string; role: 'gm' | 'player'; characterId: null };
    ctx: { correlationId: string; traceparent: string | null };
  },
): Promise<{ state: ChannelState } | { conflict: ChannelState }> {
  const { campaignId, channel, command } = o;
  return deps.db.transaction(async (tx) => {
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
      return { conflict: buildState(row, rows, infos, deps.storage) };

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
      actor: o.actor,
      ctx: o.ctx,
      nowMs: now,
    });
    return { state };
  });
}
