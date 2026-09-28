/**
 * Machine à états d'un canal (musique, ambiance), docs/audio.md § 3.5.
 * Fonctions pures : l'appelant verrouille la ligne, applique, enregistre.
 *
 * La position n'est jamais écrite périodiquement : elle vaut `positionMs` à
 * `anchorAtMs` (horloge du serveur) et avance d'elle-même en lecture
 * (`positionAt`). `endsAtMs` est la prochaine transition automatique : fin de
 * piste moins le fondu s'il y a une suivante.
 */
import { nextIndex, positionAt, type ChannelCommand, type RepeatMode } from '@vtt/contracts';

export type Status = 'stopped' | 'playing' | 'paused';

export interface MachineState {
  status: Status;
  assetId: string | null;
  playlistId: string | null;
  queue: string[];
  queueIndex: number | null;
  repeat: RepeatMode;
  shuffle: boolean;
  positionMs: number;
  anchorAtMs: number;
  endsAtMs: number | null;
  volume: number;
  crossfadeMs: number;
}

/** Ce que la machine sait d'un asset. */
export interface AssetInfo {
  id: string;
  durationMs: number | null;
  /** Prêt à être joué : `ready` et non supprimé. */
  playable: boolean;
}

export interface MachineContext {
  assets: ReadonlyMap<string, AssetInfo>;
  /** Pistes d'une playlist dans leur ordre (commande play d'une playlist, configure shuffle). */
  playlist?: { id: string; assetIds: string[] } | null;
  random?: () => number;
}

export class MachineError extends Error {
  constructor(
    readonly status: 409 | 422,
    readonly code: 'no_track' | 'asset_not_ready' | 'empty_playlist' | 'invalid_command',
    detail: string,
  ) {
    super(detail);
  }
}

export const INITIAL_STATE = (nowMs: number, channel: 'music' | 'ambience'): MachineState => ({
  status: 'stopped',
  assetId: null,
  playlistId: null,
  queue: [],
  queueIndex: null,
  // L'ambiance boucle sur sa piste ; la musique enchaîne la playlist
  repeat: channel === 'ambience' ? 'track' : 'all',
  shuffle: false,
  positionMs: 0,
  anchorAtMs: nowMs,
  endsAtMs: null,
  volume: 1,
  crossfadeMs: 1500,
});

/** Position courante (même calcul que les clients). */
export function currentPosition(s: MachineState, ctx: MachineContext, nowMs: number): number {
  const d = s.assetId ? (ctx.assets.get(s.assetId)?.durationMs ?? null) : null;
  return Math.round(
    positionAt(
      {
        status: s.status,
        positionMs: s.positionMs,
        anchorAt: new Date(s.anchorAtMs).toISOString(),
        repeat: s.repeat,
        track: { durationMs: d },
      },
      nowMs,
    ).positionMs,
  );
}

const playable = (ctx: MachineContext, id: string | undefined) =>
  !!id && ctx.assets.get(id)?.playable === true;

/**
 * Index de la prochaine piste jouable en partant de `from`, pas à pas avec
 * `step` ; `auto` : enchaînement automatique (repeat respecté), sinon
 * commandes next/previous (toujours en boucle, comme le legacy).
 */
function neighbour(
  s: MachineState,
  ctx: MachineContext,
  from: number,
  step: 1 | -1,
  auto: boolean,
): number | null {
  const n = s.queue.length;
  if (!n) return null;
  if (auto && s.repeat === 'track') return playable(ctx, s.queue[from]) ? from : null;
  let i = from;
  for (let k = 0; k < n; k++) {
    let j: number | null;
    if (auto) j = nextIndex(n, i, s.repeat === 'off' ? 'off' : 'all');
    else j = (i + step + n) % n;
    if (j === null) return null;
    if (playable(ctx, s.queue[j])) return j;
    i = j;
  }
  return null;
}

/** Index de la piste suivante en fin de piste (préchargement, enchaînement), ou null. */
export function autoNextIndex(s: MachineState, ctx: MachineContext): number | null {
  if (s.queueIndex === null) return null;
  return neighbour(s, ctx, s.queueIndex, 1, true);
}

/** Prochaine transition automatique ; null hors lecture, en boucle de piste ou sans durée. */
export function computeEndsAt(s: MachineState, ctx: MachineContext): number | null {
  if (s.status !== 'playing' || !s.assetId || s.repeat === 'track') return null;
  const d = ctx.assets.get(s.assetId)?.durationMs ?? null;
  if (d === null) return null;
  const hasNext = autoNextIndex(s, ctx) !== null;
  const fade = hasNext ? Math.min(s.crossfadeMs, Math.floor(d / 2)) : 0;
  return s.anchorAtMs + Math.max(0, d - s.positionMs - fade);
}

const withEnds = (s: MachineState, ctx: MachineContext): MachineState => ({
  ...s,
  endsAtMs: computeEndsAt(s, ctx),
});

function shuffled<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Même état (hors ancre en lecture, recalculée) : la commande est sans effet. */
export function sameState(a: MachineState, b: MachineState): boolean {
  return (
    a.status === b.status &&
    a.assetId === b.assetId &&
    a.playlistId === b.playlistId &&
    a.queueIndex === b.queueIndex &&
    a.queue.length === b.queue.length &&
    a.queue.every((id, i) => id === b.queue[i]) &&
    a.repeat === b.repeat &&
    a.shuffle === b.shuffle &&
    a.positionMs === b.positionMs &&
    a.anchorAtMs === b.anchorAtMs &&
    a.endsAtMs === b.endsAtMs &&
    a.volume === b.volume &&
    a.crossfadeMs === b.crossfadeMs
  );
}

/** Ré-ancre sur l'instant présent sans rien changer à ce qu'on entend. */
function reanchor(s: MachineState, ctx: MachineContext, nowMs: number): MachineState {
  if (s.status !== 'playing') return s;
  return { ...s, positionMs: currentPosition(s, ctx, nowMs), anchorAtMs: nowMs };
}

/**
 * Applique une commande ; renvoie le nouvel état, ou le même objet si rien
 * ne change (idempotence : `pause` sur un canal en pause…).
 */
export function applyCommand(
  s: MachineState,
  cmd: ChannelCommand,
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  const random = ctx.random ?? Math.random;
  switch (cmd.type) {
    case 'play': {
      if ((cmd.assetId ? 1 : 0) + (cmd.playlistId ? 1 : 0) !== 1)
        throw new MachineError(422, 'invalid_command', 'Indiquez un son ou une playlist');
      if (cmd.assetId) {
        if (!playable(ctx, cmd.assetId))
          throw new MachineError(422, 'asset_not_ready', 'Ce son n’est pas prêt à être joué');
        const d = ctx.assets.get(cmd.assetId)!.durationMs;
        const positionMs = Math.max(0, Math.min(cmd.positionMs ?? 0, d ? d - 1 : Infinity));
        return withEnds(
          {
            ...s,
            status: 'playing',
            assetId: cmd.assetId,
            playlistId: null,
            queue: [cmd.assetId],
            queueIndex: 0,
            positionMs,
            anchorAtMs: nowMs,
          },
          ctx,
        );
      }
      const list = ctx.playlist;
      if (!list || list.id !== cmd.playlistId)
        throw new MachineError(422, 'invalid_command', 'Playlist introuvable');
      if (!list.assetIds.length)
        throw new MachineError(422, 'empty_playlist', 'La playlist est vide');
      const index = cmd.index ?? 0;
      if (index >= list.assetIds.length)
        throw new MachineError(422, 'invalid_command', 'Piste hors de la playlist');
      const chosen = list.assetIds[index]!;
      let queue = [...list.assetIds];
      let queueIndex = index;
      if (s.shuffle) {
        queue = [
          chosen,
          ...shuffled(
            queue.filter((id) => id !== chosen),
            random,
          ),
        ];
        queueIndex = 0;
      }
      const draft: MachineState = { ...s, playlistId: list.id, queue, queueIndex };
      const start = playable(ctx, chosen)
        ? queueIndex
        : neighbour(draft, ctx, queueIndex, 1, false);
      if (start === null)
        throw new MachineError(422, 'asset_not_ready', 'Aucune piste de la playlist n’est prête');
      return withEnds(
        {
          ...draft,
          status: 'playing',
          queueIndex: start,
          assetId: queue[start]!,
          positionMs: 0,
          anchorAtMs: nowMs,
        },
        ctx,
      );
    }

    case 'pause': {
      if (s.status !== 'playing') return s;
      return {
        ...s,
        status: 'paused',
        positionMs: currentPosition(s, ctx, nowMs),
        anchorAtMs: nowMs,
        endsAtMs: null,
      };
    }

    case 'resume': {
      if (s.status === 'playing') return s;
      if (!s.assetId) throw new MachineError(409, 'no_track', 'Aucune piste à reprendre');
      if (!playable(ctx, s.assetId))
        throw new MachineError(422, 'asset_not_ready', 'Ce son n’est plus disponible');
      return withEnds({ ...s, status: 'playing', anchorAtMs: nowMs }, ctx);
    }

    case 'seek': {
      if (!s.assetId) throw new MachineError(409, 'no_track', 'Aucune piste en cours');
      const d = ctx.assets.get(s.assetId)?.durationMs ?? null;
      const positionMs = Math.max(0, Math.min(cmd.positionMs, d ? d - 1 : cmd.positionMs));
      return withEnds({ ...s, positionMs, anchorAtMs: nowMs }, ctx);
    }

    case 'stop': {
      if (s.status === 'stopped' && s.positionMs === 0) return s;
      return { ...s, status: 'stopped', positionMs: 0, anchorAtMs: nowMs, endsAtMs: null };
    }

    case 'next':
    case 'previous': {
      if (!s.queue.length || s.queueIndex === null)
        throw new MachineError(409, 'no_track', 'Aucune piste en file');
      const j = neighbour(s, ctx, s.queueIndex, cmd.type === 'next' ? 1 : -1, false);
      if (j === null) throw new MachineError(422, 'asset_not_ready', 'Aucune piste prête');
      return withEnds(
        { ...s, queueIndex: j, assetId: s.queue[j]!, positionMs: 0, anchorAtMs: nowMs },
        ctx,
      );
    }

    case 'configure': {
      let next: MachineState = {
        ...s,
        volume: cmd.volume ?? s.volume,
        crossfadeMs: cmd.crossfadeMs ?? s.crossfadeMs,
        repeat: cmd.repeat ?? s.repeat,
        shuffle: cmd.shuffle ?? s.shuffle,
      };
      if (next.shuffle !== s.shuffle && s.queue.length > 1) {
        const current = s.assetId;
        if (next.shuffle) {
          const rest = s.queue.filter((id, i) => i !== s.queueIndex);
          next.queue = current ? [current, ...shuffled(rest, random)] : shuffled(s.queue, random);
          next.queueIndex = current ? 0 : null;
        } else {
          // Ordre rétabli : celui de la playlist, la piste courante reste en place
          const order = ctx.playlist?.id === s.playlistId ? ctx.playlist.assetIds : s.queue;
          next.queue = [...order];
          const i = current ? next.queue.indexOf(current) : -1;
          next.queueIndex = i >= 0 ? i : next.queue.length ? 0 : null;
        }
      }
      const unchanged =
        next.volume === s.volume &&
        next.crossfadeMs === s.crossfadeMs &&
        next.repeat === s.repeat &&
        next.shuffle === s.shuffle;
      if (unchanged) return s;
      next = withEnds(reanchor(next, ctx, nowMs), ctx);
      return next;
    }
  }
}

/**
 * Enchaînements automatiques échus à `nowMs` (planificateur, rattrapage après
 * panne : 100 pas au plus). La nouvelle ancre vaut exactement l'ancien
 * `endsAt`, pas l'heure du traitement : la ligne de temps des clients reste juste.
 */
export function advanceUntil(
  s: MachineState,
  nowMs: number,
  ctx: MachineContext,
  maxSteps = 100,
): { state: MachineState; steps: number } {
  let state = s;
  let steps = 0;
  while (
    state.status === 'playing' &&
    state.endsAtMs !== null &&
    state.endsAtMs <= nowMs &&
    steps < maxSteps
  ) {
    const at = state.endsAtMs;
    const j = autoNextIndex(state, ctx);
    steps += 1;
    if (j === null) {
      state = { ...state, status: 'stopped', positionMs: 0, anchorAtMs: at, endsAtMs: null };
      break;
    }
    state = withEnds(
      { ...state, queueIndex: j, assetId: state.queue[j]!, positionMs: 0, anchorAtMs: at },
      ctx,
    );
  }
  return { state, steps };
}

/**
 * Un asset retiré (supprimé, sorti d'une playlist) : on l'enlève de la file ;
 * s'il était en cours, la suivante prend sa place (ou arrêt).
 */
export function removeFromQueue(
  s: MachineState,
  assetId: string,
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  if (!s.queue.includes(assetId)) return s;
  const wasCurrent = s.assetId === assetId;
  const current = s.queueIndex;
  const queue = s.queue.filter((id) => id !== assetId);
  if (!wasCurrent) {
    const queueIndex = s.assetId ? queue.indexOf(s.assetId) : null;
    return withEnds(reanchor({ ...s, queue, queueIndex }, ctx, nowMs), ctx);
  }
  // L'index courant désigne maintenant la piste qui suivait
  const draft: MachineState = { ...s, queue, queueIndex: null, assetId: null };
  if (!queue.length || current === null)
    return { ...draft, status: 'stopped', positionMs: 0, anchorAtMs: nowMs, endsAtMs: null };
  const start = current % queue.length;
  const j = playable(ctx, queue[start])
    ? start
    : neighbour({ ...draft, queueIndex: start }, ctx, start, 1, false);
  if (j === null)
    return { ...draft, status: 'stopped', positionMs: 0, anchorAtMs: nowMs, endsAtMs: null };
  return withEnds(
    { ...draft, queueIndex: j, assetId: queue[j]!, positionMs: 0, anchorAtMs: nowMs },
    ctx,
  );
}

/**
 * Playlist modifiée pendant sa lecture : la file est recalculée autour de la
 * piste courante (qui continue si elle y est encore).
 */
export function replaceQueue(
  s: MachineState,
  assetIds: string[],
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  let queue = [...assetIds];
  if (s.shuffle && s.assetId && queue.includes(s.assetId)) {
    const random = ctx.random ?? Math.random;
    queue = [
      s.assetId,
      ...shuffled(
        queue.filter((id) => id !== s.assetId),
        random,
      ),
    ];
  }
  if (s.assetId && queue.includes(s.assetId)) {
    return withEnds(
      reanchor({ ...s, queue, queueIndex: queue.indexOf(s.assetId) }, ctx, nowMs),
      ctx,
    );
  }
  // Piste courante retirée : même règle qu'une suppression
  const withCurrent = { ...s, queue: s.assetId ? [...queue, s.assetId] : queue };
  return s.assetId
    ? removeFromQueue({ ...withCurrent, queueIndex: queue.length }, s.assetId, nowMs, ctx)
    : { ...s, queue, queueIndex: null };
}
