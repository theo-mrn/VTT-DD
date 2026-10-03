/**
 * Direct de la carte (docs/carte.md § 8) : canal éphémère du service realtime, relayé, jamais
 * stocké. Deux sortes de messages :
 *
 * - `map.live`, émis à 15 Hz au plus pendant un geste, puis une dernière fois avec `end`. Il
 *   regroupe tout ce qui bouge chez l'émetteur (glisser, poignées, tracé, mesure, curseur), en **un
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
import {
  EPHEMERAL_TO_USERS_MAX,
  MAP_LIVE_HZ,
  MAP_LIVE_KIND,
  MAP_LIVE_MAX_BYTES,
  MAP_PING_KIND,
  MapLiveMessage,
  MapPingMessage,
  compareCodeUnits,
} from '@vtt/contracts';
import type { Point } from '../engine/geometry';

export const LIVE_KIND = MAP_LIVE_KIND;
export const PING_KIND = MAP_PING_KIND;

/** Cadence d'émission maximale pendant un geste. */
export const LIVE_RATE_HZ = MAP_LIVE_HZ;
/** Messages par seconde, tous genres confondus, côté client. */
export const LIVE_BUDGET_PER_SECOND = 12;
/** Retard de lecture : on interpole entre deux positions reçues. */
export const LIVE_BUFFER_MS = 100;
/** Sans nouvelles, un fantôme (ou un curseur) disparaît. */
export const LIVE_EXPIRE_MS = 2_000;
/** Taille visée de `data` : sous les 4 Kio du serveur (`MAP_LIVE_MAX_BYTES`), marge comprise. */
export const LIVE_MAX_BYTES = MAP_LIVE_MAX_BYTES - 300;
/** Curseur immobile : rappel de sa position, pour qu'il n'expire pas chez les autres. */
export const CURSOR_KEEPALIVE_MS = 1_000;

/** Messages du contrat (`@vtt/contracts`, docs/carte.md § 8). */
export type LiveMessage = MapLiveMessage;
export type PingMessage = MapPingMessage;
export type DragEntry = NonNullable<LiveMessage['drag']>[number];
export type TransformEntry = NonNullable<LiveMessage['transform']>[number];
export type LiveStroke = NonNullable<LiveMessage['stroke']>;
/** Mesure en cours de l'outil Mesurer (une seule par auteur). */
export type LiveMeasure = NonNullable<LiveMessage['measure']>;

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

export interface MeasureEvent {
  userId: string;
  /** La mesure reçue ; null : effacée ; absente : seulement la fin du geste. */
  measure: LiveMeasure | null | undefined;
  /** Fin du geste de cet utilisateur : sa mesure ne bouge plus. */
  end: boolean;
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
  a === 'public'
    ? 'public'
    : a === 'gm'
      ? 'gm'
      : `u:${[...a.users].sort(compareCodeUnits).join(',')}`;

const sendOptions = (a: LiveAudience): LiveSendOptions =>
  a === 'public' ? {} : a === 'gm' ? { gmOnly: true } : { toUsers: a.users };

/** Le serveur ignore un `toUsers` de plus de 50 noms : on découpe. Liste vide : MJ seulement. */
function expandAudience(a: LiveAudience): LiveAudience[] {
  if (a === 'public' || a === 'gm') return [a];
  const users = [...new Set(a.users)].sort(compareCodeUnits);
  if (!users.length) return ['gm'];
  const out: LiveAudience[] = [];
  for (let i = 0; i < users.length; i += EPHEMERAL_TO_USERS_MAX)
    out.push({ users: users.slice(i, i + EPHEMERAL_TO_USERS_MAX) });
  return out;
}

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
  private readonly drags = new Map<string, DragEntry>();
  private readonly transforms = new Map<string, TransformEntry>();
  private cursorPos: [number, number] | null = null;
  private cursorDirty = false;
  private strokeMeta: Omit<LiveStroke, 'points'> | null = null;
  private strokePoints: number[] = [];
  /** Mesure à envoyer (undefined : rien ; null : effacée) et son audience. */
  private measureState: LiveMeasure | null | undefined = undefined;
  private measureAudience: LiveAudience = 'public';
  private ending = false;
  /** Audiences qui ont reçu un message pendant le geste en cours (elles recevront `end`). */
  private readonly gestureAudiences = new Map<string, LiveAudience>();
  private lastFlush = -Infinity;
  private timer: unknown = null;
  private tokens = LIVE_BUDGET_PER_SECOND;
  private lastRefill: number;
  private lastCursorSent = -Infinity;

  // Réception
  private readonly tracks = new Map<string, Track>();
  private readonly lastSeq = new Map<string, { s: number; t: number }>();
  /** `last` : dernier message (expiration) ; `moved` : dernier déplacement (animation). */
  private readonly cursors = new Map<string, { samples: Sample[]; last: number; moved: number }>();
  private readonly pingListeners = new Set<(p: PingEvent) => void>();
  private readonly strokeListeners = new Set<(s: StrokeEvent) => void>();
  private readonly measureListeners = new Set<(m: MeasureEvent) => void>();
  private readonly activityListeners = new Set<(visible: boolean) => void>();

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
    for (const e of entries) {
      const [id, x, y] = e;
      const rotation = e[3];
      this.drags.set(
        id,
        rotation === undefined ? [id, r1(x), r1(y)] : [id, r1(x), r1(y), r1(rotation)],
      );
    }
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

  /**
   * Ma mesure en cours (outil Mesurer) ; null : effacée. Audience : publique, ou MJ seulement
   * (mesure privée du MJ).
   */
  measure(m: LiveMeasure | null, audience: LiveAudience = 'public') {
    this.measureState = m
      ? { ...m, from: [r1(m.from[0]), r1(m.from[1])], to: [r1(m.to[0]), r1(m.to[1])] }
      : null;
    this.measureAudience = audience;
    this.ending = false;
    this.request();
  }

  /** Fin du geste : un dernier message avec `end` à chaque audience du geste. */
  end() {
    if (
      !this.gestureAudiences.size &&
      !this.drags.size &&
      !this.transforms.size &&
      !this.strokeMeta &&
      this.measureState === undefined
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
      this.measureState !== undefined ||
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
    /** Messages d'une audience (plusieurs si `toUsers` dépasse 50 destinataires). */
    const group = (a: LiveAudience): LiveMessage[] =>
      expandAudience(a).map((part) => {
        const key = audienceKey(part);
        let g = groups.get(key);
        if (!g) {
          g = { audience: part, msg: { m: this.opts.mapId, s: 0 } };
          groups.set(key, g);
        }
        return g.msg;
      });
    for (const entry of this.drags.values())
      for (const msg of group(this.opts.audienceOf(entry[0]))) (msg.drag ??= []).push(entry);
    for (const entry of this.transforms.values())
      for (const msg of group(this.opts.audienceOf(entry[0]))) (msg.transform ??= []).push(entry);
    if (this.cursorDirty && this.cursorPos) group('public')[0]!.cursor = this.cursorPos;
    if (this.strokeMeta && this.strokePoints.length)
      group('public')[0]!.stroke = { ...this.strokeMeta, points: this.strokePoints };
    if (this.measureState !== undefined)
      for (const msg of group(this.measureAudience)) msg.measure = this.measureState;
    if (this.ending) {
      for (const a of this.gestureAudiences.values()) for (const msg of group(a)) msg.end = true;
      for (const g of groups.values())
        if (g.msg.drag || g.msg.transform || g.msg.stroke || g.msg.measure !== undefined)
          g.msg.end = true;
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
      if (
        fitted.msg.drag ||
        fitted.msg.transform ||
        fitted.msg.stroke ||
        fitted.msg.measure !== undefined
      )
        this.gestureAudiences.set(audienceKey(audience), audience);
      if (fitted.msg.cursor) this.lastCursorSent = this.now();
    }
    this.lastFlush = this.now();
    const ended = this.ending && !leftover.length;
    this.drags.clear();
    this.transforms.clear();
    this.cursorDirty = false;
    this.measureState = undefined;
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
    this.measureState = undefined;
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

  /** Mesures en cours des autres (le module mesures les dessine). */
  onMeasure(listener: (m: MeasureEvent) => void): () => void {
    this.measureListeners.add(listener);
    return () => void this.measureListeners.delete(listener);
  }

  /**
   * Quelque chose est arrivé : le moteur relance ses images si `visible` (un simple rappel d'un
   * curseur immobile ne change rien à l'écran, il ne fait que repousser son expiration).
   */
  onActivity(listener: (visible: boolean) => void): () => void {
    this.activityListeners.add(listener);
    return () => void this.activityListeners.delete(listener);
  }

  /** Message du canal éphémère (déjà filtré sur la campagne). */
  receive(m: LiveIncoming) {
    if (m.from.userId === this.opts.selfId) return;
    if (m.kind === PING_KIND) {
      const parsed = MapPingMessage.safeParse(m.data);
      if (!parsed.success || parsed.data.m !== this.opts.mapId) return;
      const p = parsed.data;
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
    // Relayé tel quel depuis un autre client : on vérifie la forme
    const parsed = MapLiveMessage.safeParse(m.data);
    if (!parsed.success || parsed.data.m !== this.opts.mapId) return;
    const msg = parsed.data;
    const t = this.now();
    const user = m.from.userId;
    // Message plus ancien que le dernier reçu de cet émetteur : ignoré (sauf après un silence :
    // l'émetteur a rechargé la page et repart de 1)
    const last = this.lastSeq.get(user);
    if (last && msg.s <= last.s && t - last.t < LIVE_EXPIRE_MS) return;
    this.lastSeq.set(user, { s: msg.s, t });
    for (const e of msg.drag ?? []) {
      this.push(e[0], user, {
        t,
        x: e[1],
        y: e[2],
        ...(e[3] !== undefined ? { rotation: e[3] } : {}),
      });
    }
    for (const e of msg.transform ?? []) {
      this.push(e[0], user, { t, x: e[1], y: e[2], width: e[3], height: e[4], rotation: e[5] });
    }
    let visible =
      msg.drag !== undefined ||
      msg.transform !== undefined ||
      msg.stroke !== undefined ||
      msg.measure !== undefined ||
      msg.end === true;
    if (msg.cursor) {
      const [x, y] = msg.cursor;
      const c = this.cursors.get(user) ?? { samples: [], last: t, moved: -Infinity };
      const prev = c.samples.at(-1);
      if (prev && prev.x === x && prev.y === y) {
        // Rappel d'un curseur immobile : il n'expire pas, mais rien ne bouge (aucune image). Un
        // échantillon ancien est recalé, pour que le prochain déplacement parte de maintenant
        if (t - prev.t > LIVE_BUFFER_MS) c.samples = [{ t, x, y }];
      } else {
        c.samples.push({ t, x, y });
        if (c.samples.length > MAX_SAMPLES) c.samples.shift();
        c.moved = t;
        visible = true;
      }
      c.last = t;
      this.cursors.set(user, c);
    }
    if (msg.stroke || msg.end)
      for (const l of this.strokeListeners)
        l({ userId: user, stroke: msg.stroke ?? null, end: msg.end === true });
    if (msg.measure !== undefined || msg.end)
      for (const l of this.measureListeners)
        l({ userId: user, measure: msg.measure, end: msg.end === true });
    if (msg.end)
      for (const track of this.tracks.values())
        if (track.userId === user) {
          track.ended = true;
          track.last = t;
        }
    for (const l of this.activityListeners) l(visible);
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

  /** Il y a des fantômes ou des curseurs connus. */
  get active(): boolean {
    return this.tracks.size > 0 || this.cursors.size > 0;
  }

  /**
   * Il reste du mouvement à interpoler (un message récent, lu avec 100 ms de retard) : la boucle
   * d'images du moteur tourne ; sinon elle s'arrête, même avec un curseur immobile.
   */
  animating(now = this.now()): boolean {
    const recent = (last: number) => now - last <= LIVE_BUFFER_MS + 250;
    for (const t of this.tracks.values()) if (recent(t.last)) return true;
    for (const c of this.cursors.values()) if (recent(c.moved)) return true;
    return false;
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
    this.measureListeners.clear();
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
  const last = samples.at(-1)!;
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
