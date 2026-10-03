/**
 * Logique pure de la synchronisation audio (docs/audio.md § 3.7 et 3.8),
 * partagée par le service audio et le moteur du front : horloge, ligne de
 * temps, dérive, effets, réconciliation des états, planification des
 * enchaînements, spatialisation et reprise de l'ancien mixeur.
 *
 * Aucune dépendance à l'exécution (types seulement) : le front l'importe par
 * `@vtt/contracts/audio-sync` sans embarquer zod.
 */
import type { BusName, ChannelState, PlaybackAsset, RepeatMode } from './audio.js';

/** Bus du mixeur, dans l'ordre d'affichage. */
export const AUDIO_BUSES = ['master', 'music', 'ambience', 'sfx', 'zones', 'dice'] as const;

export const DEFAULT_MIXER: {
  volumes: Record<BusName, number>;
  muted: Record<BusName, boolean>;
} = {
  volumes: { master: 1, music: 1, ambience: 1, sfx: 1, zones: 1, dice: 1 },
  muted: { master: false, music: false, ambience: false, sfx: false, zones: false, dice: false },
};

/** Délai au-delà duquel un effet reçu n'est plus joué (rejeu, onglet endormi). */
export const CUE_TTL_MS = 3_000;

// ─── Ligne de temps ──────────────────────────────────────────────────────────

type TimelineState = Pick<ChannelState, 'status' | 'positionMs' | 'anchorAt' | 'repeat'> & {
  track: Pick<PlaybackAsset, 'durationMs'> | null;
};

/** Position à l'instant serverNowMs (horloge serveur). Même calcul côté serveur et front. */
export function positionAt(
  s: TimelineState,
  serverNowMs: number,
): { positionMs: number; ended: boolean } {
  if (s.status !== 'playing') return { positionMs: s.positionMs, ended: false };
  const p = s.positionMs + Math.max(0, serverNowMs - Date.parse(s.anchorAt));
  const d = s.track?.durationMs ?? null;
  if (d === null) return { positionMs: p, ended: false };
  if (s.repeat === 'track') return { positionMs: p % d, ended: false };
  return p >= d ? { positionMs: d, ended: true } : { positionMs: p, ended: false };
}

/**
 * Index suivant en fin de piste (enchaînement automatique) ; null : arrêt.
 * Les commandes next/previous reviennent toujours au début ou à la fin.
 */
export function nextIndex(length: number, index: number, repeat: RepeatMode): number | null {
  if (length <= 0) return null;
  if (repeat === 'track') return Math.min(Math.max(index, 0), length - 1);
  if (index + 1 < length) return index + 1;
  return repeat === 'all' ? 0 : null;
}

/** Boucle déterministe (zones, ambiance sans ancre) : deux clients entendent le même passage. */
export function loopPosition(serverNowMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return ((serverNowMs % durationMs) + durationMs) % durationMs;
}

// ─── Horloge ─────────────────────────────────────────────────────────────────

/** Un aller-retour vers GET /v1/audio/clock, mesuré avec une horloge monotone. */
export interface ClockSample {
  /** Envoi (ms, horloge locale). */
  t0: number;
  /** Réception (ms, horloge locale). */
  t1: number;
  /** Heure du serveur dans la réponse (ms). */
  serverTime: number;
}

export interface ClockEstimate {
  /** serveur − local : `serverNow = localNow + offsetMs`. */
  offsetMs: number;
  /** Aller-retour de l'échantillon retenu : l'erreur est au plus sa moitié. */
  rttMs: number;
}

/**
 * Décalage d'horloge (algorithme de Cristian) : l'échantillon de plus petit
 * aller-retour, qui borne le mieux l'erreur (± rtt / 2). Les échantillons
 * invalides (aller-retour négatif, valeurs non finies) sont ignorés.
 */
export function estimateOffset(samples: readonly ClockSample[]): ClockEstimate | null {
  let best: ClockSample | null = null;
  for (const s of samples) {
    if (![s.t0, s.t1, s.serverTime].every(Number.isFinite) || s.t1 < s.t0) continue;
    if (!best || s.t1 - s.t0 < best.t1 - best.t0) best = s;
  }
  if (!best) return null;
  return { offsetMs: best.serverTime - (best.t0 + best.t1) / 2, rttMs: best.t1 - best.t0 };
}

// ─── Dérive ──────────────────────────────────────────────────────────────────

export const DRIFT = {
  /** En deçà, rien (inaudible, et un seek s'entendrait). */
  toleranceMs: 50,
  /** Fin d'une correction par la vitesse : on vise plus près que la tolérance (hystérésis). */
  settleMs: 15,
  /** Au-delà, seek ; entre les deux, vitesse de lecture ajustée. */
  seekAboveMs: 300,
  /** Écart de vitesse appliqué (2 %, avec preservesPitch). */
  rateDelta: 0.02,
} as const;

export type DriftAction =
  { type: 'none' } | { type: 'rate'; rate: number } | { type: 'seek'; positionMs: number };

/**
 * Correction d'un lecteur : `expectedMs` d'après la ligne de temps, `actualMs`
 * lu sur l'élément. La ligne de temps fait foi : un client en retard (mise en
 * mémoire tampon) accélère ou saute en avant, il ne ralentit jamais les autres.
 * `correcting` : une correction par la vitesse est en cours (elle continue
 * jusqu'à `settleMs`, puis la vitesse revient à 1).
 */
export function driftAction(expectedMs: number, actualMs: number, correcting = false): DriftAction {
  const diff = expectedMs - actualMs;
  const abs = Math.abs(diff);
  if (abs > DRIFT.seekAboveMs) return { type: 'seek', positionMs: Math.max(0, expectedMs) };
  const threshold = correcting ? DRIFT.settleMs : DRIFT.toleranceMs;
  if (abs <= threshold) return { type: 'none' };
  // En retard (diff > 0) : plus vite ; en avance : plus lentement
  return { type: 'rate', rate: 1 + Math.sign(diff) * DRIFT.rateDelta };
}

/** Écart toléré avec un lecteur YouTube (iframe) avant un seek : sa position est grossière. */
export const YOUTUBE_SEEK_ABOVE_MS = 2_000;

// ─── Effets ponctuels ────────────────────────────────────────────────────────

/**
 * Un effet reçu est joué depuis le début s'il a été lancé il y a moins de
 * `ttlMs` (horloge du serveur) ; un `startAt` futur retarde son départ.
 * Rejeu après reconnexion ou onglet endormi : ignoré.
 */
export function cueDecision(
  startAtMs: number,
  serverNowMs: number,
  ttlMs = CUE_TTL_MS,
): { play: true; delayMs: number } | { play: false } {
  const elapsed = serverNowMs - startAtMs;
  if (!Number.isFinite(elapsed) || elapsed > ttlMs) return { play: false };
  return { play: true, delayMs: Math.max(0, -elapsed) };
}

// ─── Réconciliation ──────────────────────────────────────────────────────────

/**
 * État d'un canal à garder : celui de plus grande version. Doublons, échos de
 * nos propres commandes et rejeux plus anciens sont ignorés (même référence
 * renvoyée : rien à faire).
 */
export function reduceChannel<S extends Pick<ChannelState, 'version'>>(
  local: S | null,
  incoming: S | null,
): S | null {
  if (!incoming) return local;
  if (!local) return incoming;
  return incoming.version > local.version ? incoming : local;
}

// ─── Planification ───────────────────────────────────────────────────────────

type PlanState = Pick<
  ChannelState,
  'status' | 'positionMs' | 'anchorAt' | 'repeat' | 'endsAt' | 'crossfadeMs'
> & {
  track: PlaybackAsset | null;
  next: PlaybackAsset | null;
};

export interface PlannedVoice {
  asset: PlaybackAsset;
  /** Position à jouer à `serverNowMs`. */
  positionMs: number;
  /** Instant (serveur) où la voix démarre ; ≤ serverNowMs si elle joue déjà. */
  startAtMs: number;
  /** Fondu d'entrée (enchaînement) ou 0. */
  fadeInMs: number;
  /** Instant (serveur) où la voix s'éteint en fondu ; null : jusqu'au prochain état. */
  fadeOutAtMs: number | null;
  loop: boolean;
}

export interface ChannelPlan {
  /** Voix qui doivent sonner à `serverNowMs` (deux pendant un fondu enchaîné). */
  voices: PlannedVoice[];
  /** Piste à précharger (20 s avant l'enchaînement), sinon null. */
  preload: PlaybackAsset | null;
  /** Prochain instant (serveur) où le plan change ; null : stable. */
  nextChangeAtMs: number | null;
}

/** Préchargement de la piste suivante avant l'enchaînement. */
export const PRELOAD_BEFORE_MS = 20_000;

/**
 * Ce que doit jouer un client à `serverNowMs`, prévision comprise : à
 * `endsAt`, la suivante démarre à 0 avec le fondu, comme le fera le serveur
 * (nouvelle ancre = ancien `endsAt`), sans attendre son événement. Pure et
 * déterministe : deux clients à la même heure serveur planifient la même chose.
 */
export function planChannel(s: PlanState, serverNowMs: number): ChannelPlan {
  if (s.status !== 'playing' || !s.track || s.track.deleted) return emptyPlan();
  const track = s.track;
  if (!s.endsAt) return planWithoutEnd(s, track, serverNowMs);
  const endsAt = Date.parse(s.endsAt);
  const next = s.next && !s.next.deleted ? s.next : null;
  if (serverNowMs < endsAt) return planBeforeEnd(s, track, next, endsAt, serverNowMs);
  // Après endsAt : enchaînement prévu, ou fin (repeat off)
  return next ? planAfterEnd(s, track, next, endsAt, serverNowMs) : emptyPlan();
}

/** Plan vide : rien ne sonne, rien ne change. */
function emptyPlan(): ChannelPlan {
  return { voices: [], preload: null, nextChangeAtMs: null };
}

/** Voix de la piste en cours, éteinte en fondu à `fadeOutAtMs` (null : jusqu'au prochain état). */
function currentVoice(
  s: PlanState,
  track: PlaybackAsset,
  serverNowMs: number,
  fadeOutAtMs: number | null,
): PlannedVoice {
  return {
    asset: track,
    positionMs: positionAt(s, serverNowMs).positionMs,
    startAtMs: Date.parse(s.anchorAt) - s.positionMs,
    fadeInMs: 0,
    fadeOutAtMs,
    loop: s.repeat === 'track',
  };
}

/** Sans `endsAt` : la piste joue jusqu'à sa fin réelle (ou en boucle). */
function planWithoutEnd(s: PlanState, track: PlaybackAsset, serverNowMs: number): ChannelPlan {
  const { ended } = positionAt(s, serverNowMs);
  if (ended) return emptyPlan();
  return {
    voices: [currentVoice(s, track, serverNowMs, null)],
    preload: null,
    nextChangeAtMs: null,
  };
}

/** Avant `endsAt` : la piste en cours, et la suivante préchargée à l'approche. */
function planBeforeEnd(
  s: PlanState,
  track: PlaybackAsset,
  next: PlaybackAsset | null,
  endsAt: number,
  serverNowMs: number,
): ChannelPlan {
  const preloadAt = endsAt - PRELOAD_BEFORE_MS;
  return {
    voices: [currentVoice(s, track, serverNowMs, next ? endsAt : null)],
    preload: next && serverNowMs >= preloadAt ? next : null,
    nextChangeAtMs: next && serverNowMs < preloadAt ? preloadAt : endsAt,
  };
}

/** Après `endsAt` : la suivante démarre avec le fondu, la piste en cours s'éteint pendant le fondu. */
function planAfterEnd(
  s: PlanState,
  track: PlaybackAsset,
  next: PlaybackAsset,
  endsAt: number,
  serverNowMs: number,
): ChannelPlan {
  // Le fondu n'existe que s'il y a une suivante (sinon endsAt est la fin réelle)
  const fade = Math.max(0, s.crossfadeMs);
  const trackEnd = endsAt + fade;
  const voices: PlannedVoice[] = [];
  if (serverNowMs < trackEnd) voices.push(currentVoice(s, track, serverNowMs, endsAt));
  voices.push({
    asset: next,
    positionMs: serverNowMs - endsAt,
    startAtMs: endsAt,
    fadeInMs: fade,
    fadeOutAtMs: null,
    loop: s.repeat === 'track',
  });
  return { voices, preload: null, nextChangeAtMs: serverNowMs < trackEnd ? trackEnd : null };
}

// ─── Spatialisation ──────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}
export interface SpatialSourceLike extends Point {
  id: string;
  radius: number;
  volume: number;
}

/** Courbes du legacy : volume `v × (1 − (d/r)²)`, panoramique `clamp(dx / 0,6r)`. */
export function zoneMix(
  listener: Point | null,
  source: SpatialSourceLike,
): { gain: number; pan: number } {
  if (!listener || !(source.radius > 0)) return { gain: 0, pan: 0 };
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const d = Math.hypot(dx, dy);
  if (d >= source.radius) return { gain: 0, pan: 0 };
  const gain = Math.max(0, Math.min(1, source.volume)) * (1 - (d / source.radius) ** 2);
  const pan = Math.max(-1, Math.min(1, dx / (0.6 * source.radius)));
  return { gain, pan };
}

/**
 * Sources à faire sonner : les `max` plus fortes. Hystérésis : une source déjà
 * active garde sa place face à une nouvelle à peine plus forte (+10 %), pour
 * ne pas couper et relancer une voix à chaque image.
 */
export function selectActiveSources<S extends SpatialSourceLike>(
  listener: Point | null,
  sources: readonly S[],
  max = 8,
  previous: ReadonlySet<string> = new Set(),
): { source: S; gain: number; pan: number }[] {
  const audible = sources
    .map((source) => ({ source, ...zoneMix(listener, source) }))
    .filter((s) => s.gain > 0);
  const score = (s: (typeof audible)[number]) => s.gain * (previous.has(s.source.id) ? 1.1 : 1);
  return audible
    .toSorted((a, b) => score(b) - score(a) || a.source.id.localeCompare(b.source.id))
    .slice(0, Math.max(0, max));
}

// ─── Mixeur ──────────────────────────────────────────────────────────────────

const LEGACY_KEYS: Record<string, BusName> = {
  quickSounds: 'sfx',
  musicZones: 'zones',
  backgroundMusic: 'music',
  dice3d: 'dice',
};

/**
 * Anciens réglages du navigateur (`localStorage.audioMixerVolumes`, JSON) vers
 * les bus du mixeur ; null si rien d'exploitable.
 */
export function migrateLegacyMixer(
  raw: string | null | undefined,
): Partial<Record<BusName, number>> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Partial<Record<BusName, number>> = {};
  for (const [key, bus] of Object.entries(LEGACY_KEYS)) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[bus] = Math.max(0, Math.min(1, v));
  }
  return Object.keys(out).length ? out : null;
}

/** Gain effectif d'un bus : volume × master, 0 si l'un des deux est coupé. */
export function busGain(
  mixer: { volumes: Record<BusName, number>; muted: Record<BusName, boolean> },
  bus: BusName,
): number {
  if (mixer.muted.master || mixer.muted[bus]) return 0;
  return bus === 'master' ? mixer.volumes.master : mixer.volumes[bus] * mixer.volumes.master;
}

/** Gain linéaire d'une normalisation en dB. */
export const dbToGain = (db: number) => 10 ** (db / 20);
