/**
 * Temps réel (service realtime, docs/api-realtime.md) : une seule connexion
 * Socket.IO par onglet, ouverte tant qu'un hook s'en sert, par la gateway
 * (`/v1/realtime/socket.io`, WebSocket seulement).
 *
 * - Jeton : relu à chaque (re)connexion par `GET /v1/realtime/token`, porté
 *   et renouvelé par le client API (le jeton d'accès reste dans `api.ts`).
 * - Canal durable : chaque campagne suivie garde son dernier `seq` ; à la
 *   reconnexion, le serveur rejoue ce qui a suivi. Un `seq` déjà vu est ignoré.
 * - `generation` change quand l'état doit être relu en REST : premier
 *   abonnement, rejeu impossible (`resync`), reconnexion pour les événements
 *   personnels (sans rejeu).
 *
 * Les composants passent par des hooks de domaine construits sur ceux-ci
 * (historique des dés, carte…), jamais directement par le socket.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, refreshSession } from './api';

const PATH = '/v1/realtime/socket.io';

/**
 * Où ouvrir la WebSocket. En production, la même origine (l'ingress relaie les WebSocket).
 * En développement, le serveur Next ne relaie pas l'upgrade WebSocket de ses rewrites : la
 * connexion n'aboutissait jamais et aucun événement n'arrivait. On vise alors directement
 * la gateway, sur le même hôte que la page (aussi depuis un autre appareil du réseau).
 * `NEXT_PUBLIC_REALTIME_ORIGIN` force une origine précise.
 */
function realtimeOrigin(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_REALTIME_ORIGIN;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return undefined;
  const port = process.env.NEXT_PUBLIC_GATEWAY_PORT ?? '8080';
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}
/** Sans hook monté, la connexion reste ouverte un moment (navigation, remontage). */
const IDLE_CLOSE_MS = 10_000;
/** Désabonnement différé : un démontage suivi d'un remontage (StrictMode) ne coupe rien. */
const UNSUBSCRIBE_DELAY_MS = 2_000;
const ACK_TIMEOUT_MS = 10_000;
const RETRY_MS = 5_000;
/** Un jeton qui expire plus tôt est renouvelé avant le handshake (sinon coupure aussitôt). */
const MIN_TOKEN_LIFETIME_MS = 30_000;

// ─── Types du contrat ────────────────────────────────────────────────────────

export type RealtimeVisibility = 'public' | 'gm_only' | 'owner';
export type RealtimeRole = 'gm' | 'player' | 'spectator';

/** Enveloppe commune des événements du bus (`@vtt/contracts`). */
export interface RealtimeEnvelope<P = Record<string, unknown>> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  /** Campagne ; null pour un événement personnel (compte, jets hors campagne). */
  roomId: string | null;
  actor: { userId: string | null; role: string; characterId: string | null };
  aggregate: { type: string; id: string };
  visibility: RealtimeVisibility;
  payload: P;
  correlationId: string;
}

export interface RealtimeEvent<P = Record<string, unknown>> {
  /** Séquence du flux : curseur de reprise. */
  seq: number;
  event: RealtimeEnvelope<P>;
  /**
   * Charge utile retirée : événement réservé au MJ, reçu par son auteur (il
   * sait que son action a eu lieu). Relire la donnée en REST.
   */
  redacted: boolean;
}

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface PresenceUser {
  userId: string;
  role: RealtimeRole;
  /** Onglets ou appareils connectés. */
  connections: number;
}

export interface EphemeralMessage<D = unknown> {
  campaignId: string;
  kind: string;
  data: D;
  from: { userId: string; role: RealtimeRole };
  /** Horodatage du serveur (ms) : un message plus ancien que le dernier reçu peut être ignoré. */
  at: number;
}

type SubscribeAck =
  | { ok: true; campaignId: string; role: RealtimeRole; seq: number | null; resync: boolean }
  | { ok: false; error: string };

interface Subscription {
  campaignId: string;
  refs: number;
  /** Dernier `seq` appliqué ; null avant le premier abonnement réussi. */
  lastSeq: number | null;
  live: boolean;
  generation: number;
  presence: PresenceUser[];
  pending: boolean;
  /** Tentative d'abonnement en cours : une réponse d'une connexion perdue est ignorée. */
  attempt: number;
  unsubscribeTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const NO_PRESENCE: PresenceUser[] = [];

/**
 * Jeton du handshake : celui que porte le client API (renouvelé par lui sur
 * un 401). Proche de l'expiration, la session est d'abord renouvelée : le
 * serveur ferme la connexion à l'expiration du jeton.
 */
async function handshakeToken(): Promise<string> {
  const r = await api<{ token: string; expiresAt: string | null }>('/v1/realtime/token');
  if (r.expiresAt && Date.parse(r.expiresAt) - Date.now() < MIN_TOKEN_LIFETIME_MS) {
    if (await refreshSession()) return (await api<{ token: string }>('/v1/realtime/token')).token;
  }
  return r.token;
}

// ─── Client (un par onglet) ──────────────────────────────────────────────────

class RealtimeClient {
  private socket: Socket | null = null;
  status: RealtimeStatus = 'idle';
  /** Incrémenté à chaque connexion établie (événements personnels : pas de rejeu). */
  connections = 0;
  private users = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subs = new Map<string, Subscription>();
  private readonly eventListeners = new Set<(e: RealtimeEvent) => void>();
  private readonly ephemeralListeners = new Set<(m: EphemeralMessage) => void>();
  private readonly changeListeners = new Set<() => void>();

  // ── État observable (useSyncExternalStore) ──

  onChange = (listener: () => void) => {
    this.changeListeners.add(listener);
    return () => void this.changeListeners.delete(listener);
  };

  private changed() {
    for (const l of this.changeListeners) l();
  }

  subscription(campaignId: string): Subscription | undefined {
    return this.subs.get(campaignId);
  }

  // ── Connexion ──

  /** Un hook s'en sert : connexion ouverte (ou gardée). */
  retain(): () => void {
    this.users += 1;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.open();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users -= 1;
      if (this.users > 0) return;
      this.idleTimer = setTimeout(() => this.close(), IDLE_CLOSE_MS);
    };
  }

  private setStatus(status: RealtimeStatus) {
    if (this.status === status) return;
    this.status = status;
    this.changed();
  }

  private open() {
    if (this.socket) return;
    const origin = realtimeOrigin();
    const socket = io(origin ?? undefined, {
      path: PATH,
      // Pas de long polling : il exigerait des sessions collantes entre réplicas
      transports: ['websocket'],
      autoConnect: false,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      auth: (cb) => {
        handshakeToken().then(
          (token) => cb({ token }),
          () => cb({}),
        );
      },
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.connections += 1;
      this.setStatus('connected');
      for (const sub of this.subs.values()) if (sub.refs > 0) void this.subscribeOnServer(sub);
      this.changed();
    });
    socket.on('disconnect', (reason) => {
      for (const sub of this.subs.values()) {
        sub.live = false;
        // Abonnement sans réponse sur la connexion perdue : refait à la reconnexion
        sub.pending = false;
        sub.attempt += 1;
      }
      this.setStatus('disconnected');
      this.changed();
      // Fermée par le serveur (jeton expiré) : pas de reconnexion automatique
      if (reason === 'io server disconnect' && this.users > 0) this.retryConnect(0);
    });
    socket.on('connect_error', () => {
      this.setStatus('disconnected');
      // Refus du handshake (jeton absent ou invalide) : pas de nouvelle tentative automatique
      if (!socket.active && this.users > 0) this.retryConnect(RETRY_MS);
    });
    socket.on('event', (p: { seq: number; event: RealtimeEnvelope; redacted?: boolean }) =>
      this.onEvent({ seq: p.seq, event: p.event, redacted: p.redacted === true }),
    );
    socket.on('presence', (p: { campaignId: string; users: PresenceUser[] }) => {
      const sub = this.subs.get(p.campaignId);
      if (!sub) return;
      sub.presence = p.users;
      this.changed();
    });
    socket.on('unsubscribed', (p: { campaignId: string }) => {
      const sub = this.subs.get(p.campaignId);
      if (!sub) return;
      sub.live = false;
      sub.presence = NO_PRESENCE;
      this.changed();
    });
    socket.on('ephemeral', (m: EphemeralMessage) => {
      for (const l of this.ephemeralListeners) l(m);
    });

    this.setStatus('connecting');
    socket.connect();
  }

  private retryConnect(delay: number) {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.socket && !this.socket.connected && this.users > 0) {
        this.setStatus('connecting');
        this.socket.connect();
      }
    }, delay);
  }

  private close() {
    this.idleTimer = null;
    if (this.users > 0 || !this.socket) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    for (const sub of this.subs.values()) sub.live = false;
    this.setStatus('idle');
  }

  // ── Campagnes suivies ──

  acquire(campaignId: string): () => void {
    let sub = this.subs.get(campaignId);
    if (!sub) {
      sub = {
        campaignId,
        refs: 0,
        lastSeq: null,
        live: false,
        generation: 0,
        presence: NO_PRESENCE,
        pending: false,
        attempt: 0,
        unsubscribeTimer: null,
        retryTimer: null,
      };
      this.subs.set(campaignId, sub);
    }
    sub.refs += 1;
    if (sub.unsubscribeTimer) clearTimeout(sub.unsubscribeTimer);
    sub.unsubscribeTimer = null;
    if (this.socket?.connected && !sub.live) void this.subscribeOnServer(sub);
    const current = sub;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      current.refs -= 1;
      if (current.refs > 0) return;
      current.unsubscribeTimer = setTimeout(() => {
        if (current.refs > 0) return;
        if (current.retryTimer) clearTimeout(current.retryTimer);
        this.subs.delete(campaignId);
        if (this.socket?.connected) this.socket.emit('unsubscribe', { campaignId });
        this.changed();
      }, UNSUBSCRIBE_DELAY_MS);
    };
  }

  private async subscribeOnServer(sub: Subscription) {
    const socket = this.socket;
    if (!socket?.connected || sub.pending) return;
    sub.pending = true;
    const attempt = ++sub.attempt;
    const hadCursor = sub.lastSeq !== null;
    let ack: SubscribeAck | null = null;
    try {
      ack = (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('subscribe', {
        campaignId: sub.campaignId,
        ...(sub.lastSeq !== null ? { afterSeq: sub.lastSeq } : {}),
      })) as SubscribeAck;
    } catch {
      ack = null;
    }
    if (attempt !== sub.attempt) return;
    sub.pending = false;
    if (this.subs.get(sub.campaignId) !== sub || socket !== this.socket) return;
    if (!ack?.ok) {
      sub.live = false;
      this.changed();
      // Refus définitif (pas membre) : on n'insiste pas ; panne passagère : nouvel essai
      if (ack?.error !== 'forbidden' && ack?.error !== 'invalid' && !sub.retryTimer) {
        sub.retryTimer = setTimeout(() => {
          sub.retryTimer = null;
          if (sub.refs > 0) void this.subscribeOnServer(sub);
        }, RETRY_MS);
      }
      return;
    }
    if (ack.seq !== null) sub.lastSeq = Math.max(sub.lastSeq ?? 0, ack.seq);
    sub.live = true;
    // Premier abonnement ou rejeu impossible : l'état doit être relu en REST
    if (!hadCursor || ack.resync) sub.generation += 1;
    this.changed();
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('presence', { campaignId: sub.campaignId })
      .then((p: { ok: boolean; users?: PresenceUser[] }) => {
        if (!p.ok || !p.users || this.subs.get(sub.campaignId) !== sub) return;
        sub.presence = p.users;
        this.changed();
      })
      .catch(() => undefined);
  }

  private onEvent(e: RealtimeEvent) {
    const campaignId = e.event.roomId;
    const sub = campaignId ? this.subs.get(campaignId) : undefined;
    if (sub) {
      // Déjà reçu (direct en retard sur le rejeu, ou rejoué deux fois)
      if (sub.lastSeq !== null && e.seq <= sub.lastSeq) return;
      sub.lastSeq = e.seq;
    }
    for (const l of this.eventListeners) l(e);
  }

  listen(listener: (e: RealtimeEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  listenEphemeral(listener: (m: EphemeralMessage) => void): () => void {
    this.ephemeralListeners.add(listener);
    return () => void this.ephemeralListeners.delete(listener);
  }

  sendEphemeral(campaignId: string, kind: string, data: unknown, gmOnly = false) {
    // Volatile : perdu plutôt que mis en file si la connexion est coupée
    this.socket?.volatile.emit('ephemeral', {
      campaignId,
      kind,
      data,
      ...(gmOnly ? { gmOnly } : {}),
    });
  }
}

let client: RealtimeClient | null = null;

/** Client de l'onglet, créé au premier usage (jamais côté serveur). */
function realtime(): RealtimeClient {
  client ??= new RealtimeClient();
  return client;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** État de la connexion temps réel. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    (l) => realtime().onChange(l),
    () => client?.status ?? 'idle',
    () => 'idle',
  );
}

function useSubscriptionState(campaignId: string | null) {
  const live = useSyncExternalStore(
    (l) => realtime().onChange(l),
    () =>
      campaignId
        ? (client?.subscription(campaignId)?.live ?? false)
        : client?.status === 'connected',
    () => false,
  );
  const generation = useSyncExternalStore(
    (l) => realtime().onChange(l),
    () =>
      campaignId ? (client?.subscription(campaignId)?.generation ?? 0) : (client?.connections ?? 0),
    () => 0,
  );
  return { live, generation };
}

/** Garde la connexion ouverte et, pour une campagne, l'abonnement actif. */
function useRetain(campaignId: string | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const c = realtime();
    const release = c.retain();
    const releaseSub = campaignId ? c.acquire(campaignId) : null;
    return () => {
      releaseSub?.();
      release();
    };
  }, [campaignId, enabled]);
}

/**
 * Événements du canal durable d'une campagne (`campaignId`), ou événements
 * personnels hors campagne (`null` : jets personnels, compte…), filtrés par
 * type (`dice.rolled`, ou `dice.*` pour tout un domaine).
 *
 * `live` : abonnement actif (sinon, relire l'état en REST de temps en temps).
 * `generation` : change quand l'état doit être relu en REST (premier
 * abonnement, rejeu impossible, reconnexion sans rejeu).
 */
export function useCampaignEvents<P = Record<string, unknown>>(
  campaignId: string | null,
  types: readonly string[],
  handler: (e: RealtimeEvent<P>) => void,
  options: { enabled?: boolean } = {},
): { live: boolean; generation: number } {
  const enabled = options.enabled ?? true;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const typesKey = types.join('|');

  useRetain(campaignId, enabled);

  useEffect(() => {
    if (!enabled) return;
    const wanted = typesKey.split('|').filter(Boolean);
    const matches = (type: string) =>
      wanted.some((w) => (w.endsWith('.*') ? type.startsWith(w.slice(0, -1)) : w === type));
    return realtime().listen((e) => {
      if (e.event.roomId !== campaignId) return;
      if (!matches(e.event.type)) return;
      handlerRef.current(e as RealtimeEvent<P>);
    });
  }, [campaignId, enabled, typesKey]);

  const state = useSubscriptionState(campaignId);
  return enabled ? state : { live: false, generation: 0 };
}

const presenceOf = (campaignId: string | null) =>
  (campaignId && client?.subscription(campaignId)?.presence) || NO_PRESENCE;

/** Qui est connecté à la campagne (tous onglets et appareils confondus). */
export function useCampaignPresence(campaignId: string | null): {
  users: PresenceUser[];
  live: boolean;
} {
  useRetain(campaignId, !!campaignId);
  const users = useSyncExternalStore(
    (l) => realtime().onChange(l),
    () => presenceOf(campaignId),
    () => NO_PRESENCE,
  );
  const { live } = useSubscriptionState(campaignId);
  return { users: campaignId ? users : NO_PRESENCE, live: !!campaignId && live };
}

/**
 * Canal éphémère d'une campagne (curseurs, jeton en cours de glissement,
 * pings) : jamais enregistré, perdu si la connexion sature, débit limité par
 * le serveur. `send` n'envoie rien tant que l'abonnement n'est pas actif.
 */
export function useCampaignEphemeral<D = unknown>(
  campaignId: string | null,
  kinds: readonly string[],
  handler: (m: EphemeralMessage<D>) => void,
): { send(kind: string, data: D, options?: { gmOnly?: boolean }): void; live: boolean } {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const kindsKey = kinds.join('|');
  useRetain(campaignId, !!campaignId);

  useEffect(() => {
    if (!campaignId) return;
    const wanted = new Set(kindsKey.split('|').filter(Boolean));
    return realtime().listenEphemeral((m) => {
      if (m.campaignId === campaignId && (!wanted.size || wanted.has(m.kind)))
        handlerRef.current(m as EphemeralMessage<D>);
    });
  }, [campaignId, kindsKey]);

  const { live } = useSubscriptionState(campaignId);
  return {
    live,
    send(kind, data, options) {
      if (campaignId && live) realtime().sendEphemeral(campaignId, kind, data, options?.gmOnly);
    },
  };
}
