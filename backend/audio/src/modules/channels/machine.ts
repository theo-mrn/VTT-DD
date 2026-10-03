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

/** Pas suivant dans une file de `n` pistes : enchaînement automatique, ou next/previous en boucle. */
function stepFrom(
  n: number,
  i: number,
  step: 1 | -1,
  auto: boolean,
  repeat: RepeatMode,
): number | null {
  if (auto) return nextIndex(n, i, repeat === 'off' ? 'off' : 'all');
  return (i + step + n) % n;
}

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
    const j = stepFrom(n, i, step, auto, s.repeat);
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

type PlayCommand = Extract<ChannelCommand, { type: 'play' }>;
type ConfigureCommand = Extract<ChannelCommand, { type: 'configure' }>;

/** Lecture d'un son seul. */
function playAsset(
  s: MachineState,
  assetId: string,
  cmd: PlayCommand,
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  if (!playable(ctx, assetId))
    throw new MachineError(422, 'asset_not_ready', 'Ce son n’est pas prêt à être joué');
  const d = ctx.assets.get(assetId)!.durationMs;
  const positionMs = Math.max(0, Math.min(cmd.positionMs ?? 0, d ? d - 1 : Infinity));
  return withEnds(
    {
      ...s,
      status: 'playing',
      assetId,
      playlistId: null,
      queue: [assetId],
      queueIndex: 0,
      positionMs,
      anchorAtMs: nowMs,
    },
    ctx,
  );
}

/** File d'une playlist lancée sur la piste `index`, placée en tête en lecture aléatoire. */
function playlistQueue(
  assetIds: string[],
  index: number,
  shuffle: boolean,
  random: () => number,
): { queue: string[]; queueIndex: number } {
  const queue = [...assetIds];
  if (!shuffle) return { queue, queueIndex: index };
  const chosen = assetIds[index]!;
  return {
    queue: [
      chosen,
      ...shuffled(
        queue.filter((id) => id !== chosen),
        random,
      ),
    ],
    queueIndex: 0,
  };
}

/** Lecture d'une playlist à partir de sa piste `index`, ou de la suivante prête. */
function playPlaylist(
  s: MachineState,
  cmd: PlayCommand,
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  const list = ctx.playlist;
  if (!list || list.id !== cmd.playlistId)
    throw new MachineError(422, 'invalid_command', 'Playlist introuvable');
  if (!list.assetIds.length) throw new MachineError(422, 'empty_playlist', 'La playlist est vide');
  const index = cmd.index ?? 0;
  if (index >= list.assetIds.length)
    throw new MachineError(422, 'invalid_command', 'Piste hors de la playlist');
  const chosen = list.assetIds[index]!;
  const { queue, queueIndex } = playlistQueue(
    list.assetIds,
    index,
    s.shuffle,
    ctx.random ?? Math.random,
  );
  const draft: MachineState = { ...s, playlistId: list.id, queue, queueIndex };
  const start = playable(ctx, chosen) ? queueIndex : neighbour(draft, ctx, queueIndex, 1, false);
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

/** Commande play : un son ou une playlist, exactement l'un des deux. */
function play(s: MachineState, cmd: PlayCommand, nowMs: number, ctx: MachineContext): MachineState {
  if ((cmd.assetId ? 1 : 0) + (cmd.playlistId ? 1 : 0) !== 1)
    throw new MachineError(422, 'invalid_command', 'Indiquez un son ou une playlist');
  if (cmd.assetId) return playAsset(s, cmd.assetId, cmd, nowMs, ctx);
  return playPlaylist(s, cmd, nowMs, ctx);
}

/** Commande pause : position figée à l'instant présent. */
function pause(s: MachineState, nowMs: number, ctx: MachineContext): MachineState {
  if (s.status !== 'playing') return s;
  return {
    ...s,
    status: 'paused',
    positionMs: currentPosition(s, ctx, nowMs),
    anchorAtMs: nowMs,
    endsAtMs: null,
  };
}

/** Commande resume : reprise de la piste courante. */
function resume(s: MachineState, nowMs: number, ctx: MachineContext): MachineState {
  if (s.status === 'playing') return s;
  if (!s.assetId) throw new MachineError(409, 'no_track', 'Aucune piste à reprendre');
  if (!playable(ctx, s.assetId))
    throw new MachineError(422, 'asset_not_ready', 'Ce son n’est plus disponible');
  return withEnds({ ...s, status: 'playing', anchorAtMs: nowMs }, ctx);
}

/** Commande seek : position bornée à la durée de la piste. */
function seek(
  s: MachineState,
  positionMs: number,
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  if (!s.assetId) throw new MachineError(409, 'no_track', 'Aucune piste en cours');
  const d = ctx.assets.get(s.assetId)?.durationMs ?? null;
  const bounded = Math.max(0, Math.min(positionMs, d ? d - 1 : positionMs));
  return withEnds({ ...s, positionMs: bounded, anchorAtMs: nowMs }, ctx);
}

/** Commande stop : retour au début. */
function stop(s: MachineState, nowMs: number): MachineState {
  if (s.status === 'stopped' && s.positionMs === 0) return s;
  return { ...s, status: 'stopped', positionMs: 0, anchorAtMs: nowMs, endsAtMs: null };
}

/** Commandes next et previous : piste prête voisine, en boucle. */
function skip(s: MachineState, step: 1 | -1, nowMs: number, ctx: MachineContext): MachineState {
  if (!s.queue.length || s.queueIndex === null)
    throw new MachineError(409, 'no_track', 'Aucune piste en file');
  const j = neighbour(s, ctx, s.queueIndex, step, false);
  if (j === null) throw new MachineError(422, 'asset_not_ready', 'Aucune piste prête');
  return withEnds(
    { ...s, queueIndex: j, assetId: s.queue[j]!, positionMs: 0, anchorAtMs: nowMs },
    ctx,
  );
}

/**
 * File après un changement de lecture aléatoire : mélangée derrière la piste
 * courante, ou remise dans l'ordre de la playlist.
 */
function reorderedQueue(
  s: MachineState,
  shuffle: boolean,
  ctx: MachineContext,
): { queue: string[]; queueIndex: number | null } {
  const random = ctx.random ?? Math.random;
  const current = s.assetId;
  if (shuffle) {
    const rest = s.queue.filter((id, i) => i !== s.queueIndex);
    return {
      queue: current ? [current, ...shuffled(rest, random)] : shuffled(s.queue, random),
      queueIndex: current ? 0 : null,
    };
  }
  // Ordre rétabli : celui de la playlist, la piste courante reste en place
  const order = ctx.playlist?.id === s.playlistId ? ctx.playlist.assetIds : s.queue;
  const queue = [...order];
  const i = current ? queue.indexOf(current) : -1;
  if (i >= 0) return { queue, queueIndex: i };
  return { queue, queueIndex: queue.length ? 0 : null };
}

/** Commande configure : volume, fondu, répétition, lecture aléatoire. */
function configure(
  s: MachineState,
  cmd: ConfigureCommand,
  nowMs: number,
  ctx: MachineContext,
): MachineState {
  let next: MachineState = {
    ...s,
    volume: cmd.volume ?? s.volume,
    crossfadeMs: cmd.crossfadeMs ?? s.crossfadeMs,
    repeat: cmd.repeat ?? s.repeat,
    shuffle: cmd.shuffle ?? s.shuffle,
  };
  if (next.shuffle !== s.shuffle && s.queue.length > 1)
    next = { ...next, ...reorderedQueue(s, next.shuffle, ctx) };
  const unchanged =
    next.volume === s.volume &&
    next.crossfadeMs === s.crossfadeMs &&
    next.repeat === s.repeat &&
    next.shuffle === s.shuffle;
  if (unchanged) return s;
  return withEnds(reanchor(next, ctx, nowMs), ctx);
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
  switch (cmd.type) {
    case 'play':
      return play(s, cmd, nowMs, ctx);
    case 'pause':
      return pause(s, nowMs, ctx);
    case 'resume':
      return resume(s, nowMs, ctx);
    case 'seek':
      return seek(s, cmd.positionMs, nowMs, ctx);
    case 'stop':
      return stop(s, nowMs);
    case 'next':
    case 'previous':
      return skip(s, cmd.type === 'next' ? 1 : -1, nowMs, ctx);
    case 'configure':
      return configure(s, cmd, nowMs, ctx);
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
