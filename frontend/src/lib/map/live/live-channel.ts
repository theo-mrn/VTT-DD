/**
 * Direct de la carte (docs/carte.md § 8) : canal éphémère du service realtime, relayé, jamais
 * stocké. Deux sortes de messages :
 *
 * - `map.live`, émis à 15 Hz au plus pendant un geste, puis une dernière fois avec `end`. Il
 *   regroupe tout ce qui bouge chez l'émetteur (glisser, poignées, tracé, curseur), en **un
 *   message par audience** : public, MJ seulement (`gmOnly`), ou certains joueurs (`toUsers`).
 *   Il pèse moins de 4 Kio : au-delà, les points du tracé partent au message suivant.
 * - `map.ping` : une onde chez tous ; `focus` (MJ) amène la caméra de chacun à ce point.
 *
 * Budget : 12 messages par seconde en tout (seau à jetons) ; un envoi qui dépasse attend son
 * tour, rien n'est perdu (seule la dernière position compte, les points de tracé s'accumulent).
 *
 * Réception : tampon de 100 ms puis interpolation linéaire (un fantôme glisse sans à-coups),
 * élément inconnu ignoré par le moteur, fantôme retiré après 2 s sans nouvelles, ou posé à
 * l'arrivée de l'événement durable (`settle`).
 *
 * Aucune dépendance au DOM ni à Pixi : le transport et l'horloge sont injectés.
 */
import type { Point } from '../engine/geometry';

export const LIVE_KIND = 'map.live';
export const PING_KIND = 'map.ping';

/** Cadence d'émission maximale pendant un geste. */
export const LIVE_RATE_HZ = 15;
/** Messages par seconde, tous genres confondus, côté client. */
export const LIVE_BUDGET_PER_SECOND = 12;
/** Retard de lecture : on interpole entre deux positions reçues. */
export const LIVE_BUFFER_MS = 100;
/** Sans nouvelles, un fantôme (ou un curseur) disparaît. */
export const LIVE_EXPIRE_MS = 2_000;
/** Taille maximale de `data` (le serveur refuse au-delà de 4 Kio, enveloppe comprise). */
export const LIVE_MAX_BYTES = 3_800;
/** Curseur immobile : rappel de sa position, pour qu'il n'expire pas chez les autres. */
export const CURSOR_KEEPALIVE_MS = 1_000;

export type DragEntry = [id: string, x: number, y: number, rotation?: number];
export type TransformEntry = [
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
];

export interface LiveStroke {
  id: string;
  tool: string;
  color: string;
  width: number;
  /** Points ajoutés depuis le dernier envoi, à plat : x0, y0, x1, y1… */
  points: number[];
}

export interface LiveMessage {
  /** Carte. */
  m: string;
  /** Compteur de l'émetteur. */
  s: number;
  drag?: DragEntry[];
  cursor?: [x: number, y: number];
  stroke?: LiveStroke;
  transform?: TransformEntry[];
  end?: true;
}

export interface PingMessage {
  m: string;
  x: number;
  y: number;
  focus?: true;
}

/** Audience d'un élément qui bouge (§ 8, aucune fuite). */
export type LiveAudience = 'public' | 'gm' | { users: readonly string[] };

export interface LiveSendOptions {
  gmOnly?: boolean;
  toUsers?: readonly string[];
}

/** Envoi sur le canal éphémère (`useCampaignEphemeral().send`). */
export interface LiveTransport {
  send(kind: string, data: LiveMessage | PingMessage, options: LiveSendOptions): void;
}

/** Message reçu (forme de `EphemeralMessage` de lib/realtime.ts). */
export interface LiveIncoming {
  kind: string;
  data: unknown;
  from: { userId: string; role: string };
}

export interface RemotePose {
  entityId: string;
  userId: string;
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
  /** Le geste est fini : le fantôme attend l'événement durable pour se poser. */
  ended: boolean;
}

export interface RemoteCursor {
  userId: string;
  x: number;
  y: number;
}

export interface PingEvent {
  userId: string;
  role: string;
  x: number;
  y: number;
  focus: boolean;
}

export interface StrokeEvent {
  userId: string;
  stroke: LiveStroke | null;
  /** Fin du geste de cet utilisateur : son tracé en cours est terminé. */
  end: boolean;
}

export interface LiveChannelOptions {
  mapId: string;
  /** Moi : mes propres messages ne me reviennent pas, mais on filtre par sûreté. */
  selfId: string;
  transport: LiveTransport | null;
  /** Audience d'un élément que je déplace (vision du MJ, masquage…). */
  audienceOf(entityId: string): LiveAudience;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

interface Sample {
  t: number;
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
}

interface Track {
  userId: string;
  samples: Sample[];
  last: number;
  ended: boolean;
}

/** Arrondi à 0,1 pixel : des messages plus courts, une précision bien suffisante. */
const r1 = (n: number) => Math.round(n * 10) / 10;

const audienceKey = (a: LiveAudience) =>
  a === 'public' ? 'public' : a === 'gm' ? 'gm' : `u:${[...a.users].sort().join(',')}`;

const sendOptions = (a: LiveAudience): LiveSendOptions =>
  a === 'public' ? {} : a === 'gm' ? { gmOnly: true } : { toUsers: a.users };

const MAX_SAMPLES = 8;

function lerpAngle(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

export class LiveChannel {
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private transport: LiveTransport | null;
  private seq = 0;

  // Émission
  private drags = new Map<string, DragEntry>();
  private transforms = new Map<string, TransformEntry>();
  private cursorPos: [number, number] | null = null;
  private cursorDirty = false;
  private strokeMeta: Omit<LiveStroke, 'points'> | null = null;
  private strokePoints: number[] = [];
  private ending = false;
  /** Audiences qui ont reçu un message pendant le geste en cours (elles recevront `end`). */
  private gestureAudiences = new Map<string, LiveAudience>();
  private lastFlush = -Infinity;
  private timer: unknown = null;
  private tokens = LIVE_BUDGET_PER_SECOND;
  private lastRefill: number;
  private lastCursorSent = -Infinity;

  // Réception
  private readonly tracks = new Map<string, Track>();
  private readonly cursors = new Map<string, { samples: Sample[]; last: number }>();
  private readonly pingListeners = new Set<(p: PingEvent) => void>();
  private readonly strokeListeners = new Set<(s: StrokeEvent) => void>();
  private readonly activityListeners = new Set<() => void>();

  /** Messages envoyés (tests, diagnostic). */
  sent = 0;

  constructor(private readonly opts: LiveChannelOptions) {
    this.now = opts.now ?? (() => performance.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.transport = opts.transport;
    this.lastRefill = this.now();
  }

  get mapId(): string {
    return this.opts.mapId;
  }

  /** Transport (re)branché : l'abonnement au canal éphémère peut arriver après la carte. */
  setTransport(transport: LiveTransport | null) {
    this.transport = transport;
  }

  // ─── Émission ──────────────────────────────────────────────────────────────

  /** Positions des éléments que je glisse (dernier état). */
  drag(entries: readonly DragEntry[]) {
    for (const [id, x, y, rotation] of entries)
      this.drags.set(
        id,
        rotation === undefined ? [id, r1(x), r1(y)] : [id, r1(x), r1(y), r1(rotation)],
      );
    this.ending = false;
    this.request();
  }

  /** Transformations en cours (poignées de rotation et de taille). */
  transform(entries: readonly TransformEntry[]) {
    for (const [id, x, y, w, h, rot] of entries)
      this.transforms.set(id, [id, r1(x), r1(y), r1(w), r1(h), r1(rot)]);
    this.ending = false;
    this.request();
  }

  /** Mon curseur (seulement si je le partage) ; null : je ne le partage plus. */
  cursor(p: Point | null) {
    this.cursorPos = p ? [r1(p.x), r1(p.y)] : null;
    this.cursorDirty = p !== null;
    if (p) this.request();
  }

  /** Points ajoutés à mon tracé en cours. */
  stroke(meta: Omit<LiveStroke, 'points'>, points: readonly number[]) {
    if (!this.strokeMeta || this.strokeMeta.id !== meta.id) this.strokePoints = [];
    this.strokeMeta = { ...meta };
    for (const n of points) this.strokePoints.push(r1(n));
    this.ending = false;
    this.request();
  }

  /** Fin du geste : un dernier message avec `end` à chaque audience du geste. */
  end() {
    if (
      !this.gestureAudiences.size &&
      !this.drags.size &&
      !this.transforms.size &&
      !this.strokeMeta
    )
      return;
    this.ending = true;
    this.request();
  }

  /** Ping (Alt+clic) ; `focus` (MJ) : la caméra de chacun va à ce point. */
  ping(p: Point, focus = false): boolean {
    if (!this.transport) return false;
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    this.sent += 1;
    this.transport.send(
      PING_KIND,
      { m: this.opts.mapId, x: r1(p.x), y: r1(p.y), ...(focus ? { focus: true as const } : {}) },
      {},
    );
    return true;
  }

  /** Rappel périodique d'un curseur immobile (appelé par le moteur à chaque image active). */
  keepAlive() {
    if (this.cursorPos && this.now() - this.lastCursorSent >= CURSOR_KEEPALIVE_MS) {
      this.cursorDirty = true;
      this.request();
    }
  }

  private hasPending() {
    return (
      this.drags.size > 0 ||
      this.transforms.size > 0 ||
      this.cursorDirty ||
      this.strokePoints.length > 0 ||
      this.ending
    );
  }

  private refill() {
    const now = this.now();
    this.tokens = Math.min(
      LIVE_BUDGET_PER_SECOND,
      this.tokens + ((now - this.lastRefill) / 1000) * LIVE_BUDGET_PER_SECOND,
    );
    this.lastRefill = now;
  }

  /** Programme le prochain envoi (cadence de 15 Hz). */
  private request() {
    if (this.timer !== null || !this.hasPending()) return;
    const wait = Math.max(0, this.lastFlush + 1000 / LIVE_RATE_HZ - this.now());
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  /** Construit les messages de cet envoi, un par audience. */
  private build(): { audience: LiveAudience; msg: LiveMessage }[] {
    const groups = new Map<string, { audience: LiveAudience; msg: LiveMessage }>();
    const group = (a: LiveAudience) => {
      const key = audienceKey(a);
      let g = groups.get(key);
      if (!g) {
        g = { audience: a, msg: { m: this.opts.mapId, s: 0 } };
        groups.set(key, g);
      }
      return g.msg;
    };
    for (const entry of this.drags.values())
      (group(this.opts.audienceOf(entry[0])).drag ??= []).push(entry);
    for (const entry of this.transforms.values())
      (group(this.opts.audienceOf(entry[0])).transform ??= []).push(entry);
    if (this.cursorDirty && this.cursorPos) group('public').cursor = this.cursorPos;
    if (this.strokeMeta && this.strokePoints.length)
      group('public').stroke = { ...this.strokeMeta, points: this.strokePoints };
    if (this.ending) {
      for (const a of this.gestureAudiences.values()) group(a).end = true;
      for (const g of groups.values())
        if (g.msg.drag || g.msg.transform || g.msg.stroke) g.msg.end = true;
    }
    return [...groups.values()];
  }

  /** Découpe un tracé trop long : les points en trop partent au message suivant. */
  private fit(msg: LiveMessage): { msg: LiveMessage; leftover: number[] } {
    if (JSON.stringify(msg).length <= LIVE_MAX_BYTES || !msg.stroke) return { msg, leftover: [] };
    const all = msg.stroke.points;
    let lo = 0;
    let hi = all.length / 2;
    // Plus grand nombre de points (paires) qui tient
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const trial = { ...msg, stroke: { ...msg.stroke, points: all.slice(0, mid * 2) } };
      if (JSON.stringify(trial).length <= LIVE_MAX_BYTES) lo = mid;
      else hi = mid - 1;
    }
    const kept = all.slice(0, lo * 2);
    const leftover = all.slice(lo * 2);
    // Le geste n'est pas fini tant qu'il reste des points
    const { end: _end, ...rest } = msg;
    return { msg: { ...rest, stroke: { ...msg.stroke, points: kept } }, leftover };
  }

  /** Envoie ce qui attend, dans le budget ; sinon reprogramme. */
  flush() {
    if (!this.hasPending()) return;
    if (!this.transport) {
      this.reset();
      return;
    }
    const built = this.build();
    if (!built.length) {
      this.reset();
      return;
    }
    this.refill();
    if (this.tokens < built.length) {
      // Hors budget : on attend assez de jetons (rien n'est perdu)
      const wait = ((built.length - this.tokens) / LIVE_BUDGET_PER_SECOND) * 1000;
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.flush();
      }, Math.ceil(wait));
      return;
    }
    let leftover: number[] = [];
    for (const { audience, msg } of built) {
      const fitted = this.fit(msg);
      if (fitted.leftover.length) leftover = fitted.leftover;
      this.seq += 1;
      fitted.msg.s = this.seq;
      this.tokens -= 1;
      this.sent += 1;
      this.transport.send(LIVE_KIND, fitted.msg, sendOptions(audience));
      if (fitted.msg.drag || fitted.msg.transform || fitted.msg.stroke)
        this.gestureAudiences.set(audienceKey(audience), audience);
      if (fitted.msg.cursor) this.lastCursorSent = this.now();
    }
    this.lastFlush = this.now();
    const ended = this.ending && !leftover.length;
    this.drags.clear();
    this.transforms.clear();
    this.cursorDirty = false;
    this.strokePoints = leftover;
    if (ended) {
      this.ending = false;
      this.strokeMeta = null;
      this.gestureAudiences.clear();
    }
    if (this.hasPending()) this.request();
  }

  private reset() {
    this.drags.clear();
    this.transforms.clear();
    this.cursorDirty = false;
    this.strokePoints = [];
    this.strokeMeta = null;
    this.ending = false;
    this.gestureAudiences.clear();
  }

  // ─── Réception ─────────────────────────────────────────────────────────────

  onPing(listener: (p: PingEvent) => void): () => void {
    this.pingListeners.add(listener);
    return () => void this.pingListeners.delete(listener);
  }

  /** Tracés en cours des autres (le module dessins les dessine). */
  onStroke(listener: (s: StrokeEvent) => void): () => void {
    this.strokeListeners.add(listener);
    return () => void this.strokeListeners.delete(listener);
  }

  /** Quelque chose est arrivé : le moteur relance ses images. */
  onActivity(listener: () => void): () => void {
    this.activityListeners.add(listener);
    return () => void this.activityListeners.delete(listener);
  }

  /** Message du canal éphémère (déjà filtré sur la campagne). */
  receive(m: LiveIncoming) {
    if (m.from.userId === this.opts.selfId) return;
    if (m.kind === PING_KIND) {
      const p = m.data as PingMessage;
      if (!p || p.m !== this.opts.mapId || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      for (const l of this.pingListeners)
        l({
          userId: m.from.userId,
          role: m.from.role,
          x: p.x,
          y: p.y,
          focus: p.focus === true && m.from.role === 'gm',
        });
      return;
    }
    if (m.kind !== LIVE_KIND) return;
    const msg = m.data as LiveMessage;
    if (!msg || msg.m !== this.opts.mapId) return;
    const t = this.now();
    const user = m.from.userId;
    for (const e of msg.drag ?? []) {
      if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
      this.push(e[0], user, {
        t,
        x: e[1],
        y: e[2],
        ...(e[3] !== undefined ? { rotation: e[3] } : {}),
      });
    }
    for (const e of msg.transform ?? []) {
      if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
      this.push(e[0], user, { t, x: e[1], y: e[2], width: e[3], height: e[4], rotation: e[5] });
    }
    if (msg.cursor) {
      const c = this.cursors.get(user) ?? { samples: [], last: t };
      c.samples.push({ t, x: msg.cursor[0], y: msg.cursor[1] });
      if (c.samples.length > MAX_SAMPLES) c.samples.shift();
      c.last = t;
      this.cursors.set(user, c);
    }
    if (msg.stroke || msg.end)
      for (const l of this.strokeListeners)
        l({ userId: user, stroke: msg.stroke ?? null, end: msg.end === true });
    if (msg.end)
      for (const track of this.tracks.values())
        if (track.userId === user) {
          track.ended = true;
          track.last = t;
        }
    for (const l of this.activityListeners) l();
  }

  private push(entityId: string, userId: string, s: Sample) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
    let track = this.tracks.get(entityId);
    // Un autre prend la main sur l'élément : on repart de sa position
    if (!track || track.userId !== userId) {
      track = { userId, samples: [], last: s.t, ended: false };
      this.tracks.set(entityId, track);
    }
    track.samples.push(s);
    if (track.samples.length > MAX_SAMPLES) track.samples.shift();
    track.last = s.t;
    track.ended = false;
  }

  /** L'événement durable de cet élément est arrivé : son fantôme se pose. */
  settle(entityId: string) {
    this.tracks.delete(entityId);
  }

  /** Il y a des fantômes ou des curseurs à animer. */
  get active(): boolean {
    return this.tracks.size > 0 || this.cursors.size > 0;
  }

  /** Positions interpolées des fantômes à l'instant `now` (expire les fantômes muets). */
  poses(now = this.now()): RemotePose[] {
    const out: RemotePose[] = [];
    for (const [entityId, track] of this.tracks) {
      if (now - track.last > LIVE_EXPIRE_MS) {
        this.tracks.delete(entityId);
        continue;
      }
      const s = interpolate(track.samples, now - LIVE_BUFFER_MS);
      if (!s) continue;
      out.push({ entityId, userId: track.userId, ended: track.ended, ...pick(s) });
    }
    return out;
  }

  /** Curseurs des autres, interpolés (expirés après 2 s sans nouvelles). */
  cursorPositions(now = this.now()): RemoteCursor[] {
    const out: RemoteCursor[] = [];
    for (const [userId, c] of this.cursors) {
      if (now - c.last > LIVE_EXPIRE_MS + CURSOR_KEEPALIVE_MS) {
        this.cursors.delete(userId);
        continue;
      }
      const s = interpolate(c.samples, now - LIVE_BUFFER_MS);
      if (s) out.push({ userId, x: s.x, y: s.y });
    }
    return out;
  }

  destroy() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.reset();
    this.tracks.clear();
    this.cursors.clear();
    this.pingListeners.clear();
    this.strokeListeners.clear();
    this.activityListeners.clear();
  }
}

function pick(s: Sample) {
  return {
    x: s.x,
    y: s.y,
    ...(s.rotation !== undefined ? { rotation: s.rotation } : {}),
    ...(s.width !== undefined ? { width: s.width } : {}),
    ...(s.height !== undefined ? { height: s.height } : {}),
  };
}

/** Échantillon à l'instant `t` : interpolation linéaire, tenu au bord. */
export function interpolate(samples: readonly Sample[], t: number): Sample | null {
  if (!samples.length) return null;
  const first = samples[0]!;
  if (t <= first.t) return first;
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return last;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (t < a.t || t > b.t) continue;
    const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
    const lerp = (u?: number, v?: number) =>
      u === undefined || v === undefined ? (v ?? u) : u + (v - u) * k;
    return {
      t,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      ...(a.rotation !== undefined && b.rotation !== undefined
        ? { rotation: lerpAngle(a.rotation, b.rotation, k) }
        : b.rotation !== undefined
          ? { rotation: b.rotation }
          : {}),
      ...(b.width !== undefined ? { width: lerp(a.width, b.width) } : {}),
      ...(b.height !== undefined ? { height: lerp(a.height, b.height) } : {}),
    };
  }
  return last;
}
