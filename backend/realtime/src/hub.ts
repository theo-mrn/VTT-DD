/**
 * Cœur du service : connexions Socket.IO, abonnements aux campagnes, rejeu,
 * diffusion des événements du bus, canal éphémère et présence.
 *
 * Plusieurs réplicas : chacun lit TOUT le flux (consommateur éphémère
 * ordonné, `deliver: new`) et n'émet qu'à SES connexions (`io.local`) : un
 * événement n'est donc envoyé qu'une fois par client, quel que soit le nombre
 * de réplicas, sans élection de leader ni point unique de défaillance.
 * L'adaptateur Redis ne sert qu'à ce qui part d'un client (canal éphémère,
 * présence, `fetchSockets`) et doit atteindre les connexions des autres réplicas.
 *
 * Rejeu sans trou ni désordre : pendant qu'une connexion relit le flux
 * (`subscribe` avec `afterSeq`), elle est déjà dans les rooms de la campagne
 * mais aussi dans `replay:<id>`, exclue de la diffusion directe ; ce qui arrive
 * en direct est gardé dans un tampon, puis envoyé après le rejeu (seulement
 * les `seq` plus récents), avant qu'elle quitte `replay:<id>`, sans attente
 * entre les deux. Les `seq` d'une campagne arrivent ainsi toujours croissants ;
 * un doublon (direct en retard sur le rejeu) a un `seq` déjà vu, que le
 * client ignore.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { lazyInstruments, replayEvents, streamLastSeq, type Bus } from '@vtt/platform';
import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import { handshakeToken } from './auth.js';
import type { CampaignRights } from './clients/campaign.js';
import {
  CampaignInput,
  EphemeralInput,
  SubscribeInput,
  type ClientToServerEvents,
  type InterServerEvents,
  type PresenceAck,
  type PresencePayload,
  type PresenceUser,
  type ServerToClientEvents,
  type SocketData,
  type SubscribeAck,
} from './protocol.js';
import { TokenBucket } from './rate-limit.js';

const socketMetrics = lazyInstruments(
  (m) => ({
    connections: m.createUpDownCounter('vtt.realtime.connections', {
      description: 'Connexions WebSocket ouvertes sur ce réplica',
    }),
    rateLimited: m.createCounter('vtt.realtime.rate_limited', {
      description: 'Messages éphémères refusés pour débit excessif',
    }),
  }),
  'realtime',
);
import {
  deliveryFor,
  packet,
  rooms,
  targetsFor,
  type CampaignRole,
  type EventPacket,
} from './routing.js';

export type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface HubLimits {
  replayMax: number;
  maxSubscriptions: number;
  ephemeralRatePerSecond: number;
  ephemeralBurst: number;
  ephemeralMaxBytes: number;
}

export interface HubOptions {
  io: IoServer;
  /** Bus NATS ; null : pas de canal durable (ni curseur, ni rejeu). */
  bus: Pick<Bus, 'js' | 'jsm'> | null;
  rights: CampaignRights;
  /** Vérifie un jeton d'accès : utilisateur et expiration (secondes Unix). */
  verify(token: string): Promise<{ userId: string; exp?: number }>;
  log: FastifyBaseLogger;
  limits: HubLimits;
  /** Délai de regroupement des annonces de présence (ms). */
  presenceDelayMs?: number;
}

export interface Hub {
  /** Diffuse un événement du bus (séquence `seq` du flux) aux connexions de ce réplica. */
  dispatch(event: EventEnvelope, seq: number): void;
}

/** Connexion en cours de rejeu d'une campagne : événements directs mis de côté. */
interface ReplayBuffer {
  socket: IoSocket;
  viewer: { userId: string; role: CampaignRole };
  items: EventPacket[];
  cancelled: boolean;
}

/** Les abonnements se font par rafales (plusieurs onglets, reconnexions) : 20 d'un coup, 2/s ensuite. */
const SUBSCRIBE_RATE = 2;
const SUBSCRIBE_BURST = 20;
/** Plafond d'un minuteur Node (~24,8 jours). */
const MAX_TIMEOUT_MS = 2_147_483_647;

function authError(): Error {
  const err = new Error('unauthorized') as Error & { data?: unknown };
  err.data = { code: 'unauthorized' };
  return err;
}

function reply<T>(ack: unknown, value: T) {
  if (typeof ack === 'function') (ack as (v: T) => void)(value);
}

export function createHub(o: HubOptions): Hub {
  const { io, log, limits } = o;
  const nsp = io.of('/');
  /** campagne → connexions de ce réplica en cours de rejeu */
  const replays = new Map<string, Set<ReplayBuffer>>();
  const presenceTimers = new Map<string, NodeJS.Timeout>();

  /** Connexions de CE réplica dans une room (lecture synchrone de l'adaptateur local). */
  function localSockets(room: string): IoSocket[] {
    const ids = nsp.adapter.rooms.get(room);
    if (!ids) return [];
    return [...ids].map((id) => nsp.sockets.get(id)).filter((s): s is IoSocket => !!s);
  }

  function bufferOf(socket: IoSocket, campaignId: string): ReplayBuffer | undefined {
    for (const b of replays.get(campaignId) ?? []) if (b.socket === socket) return b;
    return undefined;
  }

  function dropBuffer(campaignId: string, buffer: ReplayBuffer) {
    const set = replays.get(campaignId);
    set?.delete(buffer);
    if (set && !set.size) replays.delete(campaignId);
  }

  // ─── Présence ──────────────────────────────────────────────────────────────

  async function presence(campaignId: string): Promise<PresencePayload> {
    const byUser = new Map<string, PresenceUser>();
    // Tous les réplicas (adaptateur Redis) ; en cas d'échec, ce réplica seulement
    const sockets = await io
      .in(rooms.campaign(campaignId))
      .fetchSockets()
      .catch((err) => {
        log.warn({ err, campaignId }, 'présence : réplicas injoignables, vue locale');
        return localSockets(rooms.campaign(campaignId));
      });
    for (const s of sockets) {
      const role = s.data.campaigns?.[campaignId];
      if (!role) continue;
      const u = byUser.get(s.data.userId);
      if (u) {
        u.connections += 1;
        if (role === 'gm') u.role = 'gm';
      } else byUser.set(s.data.userId, { userId: s.data.userId, role, connections: 1 });
    }
    return { campaignId, users: [...byUser.values()] };
  }

  /** Annonce la présence à toute la campagne (tous réplicas), regroupée sur quelques ms. */
  function schedulePresence(campaignId: string) {
    if (presenceTimers.has(campaignId)) return;
    const timer = setTimeout(() => {
      presenceTimers.delete(campaignId);
      presence(campaignId)
        .then((p) => io.to(rooms.campaign(campaignId)).emit('presence', p))
        .catch((err) => log.warn({ err, campaignId }, 'présence non diffusée'));
    }, o.presenceDelayMs ?? 150);
    timer.unref();
    presenceTimers.set(campaignId, timer);
  }

  // ─── Abonnements ───────────────────────────────────────────────────────────

  function unsubscribe(socket: IoSocket, campaignId: string): boolean {
    const buffer = bufferOf(socket, campaignId);
    if (buffer) {
      buffer.cancelled = true;
      dropBuffer(campaignId, buffer);
    }
    if (!(campaignId in socket.data.campaigns)) return false;
    delete socket.data.campaigns[campaignId];
    for (const room of [
      rooms.campaign(campaignId),
      rooms.gm(campaignId),
      rooms.member(campaignId, socket.data.userId),
      rooms.replaying(campaignId),
    ])
      void socket.leave(room);
    schedulePresence(campaignId);
    return true;
  }

  async function subscribe(
    socket: IoSocket,
    input: unknown,
    bucket: TokenBucket,
  ): Promise<SubscribeAck> {
    const parsed = SubscribeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'invalid' };
    const { campaignId, afterSeq } = parsed.data;
    const data = socket.data;
    if (!bucket.take()) return { ok: false, error: 'rate_limited' };
    if (
      !(campaignId in data.campaigns) &&
      Object.keys(data.campaigns).length >= limits.maxSubscriptions
    )
      return { ok: false, error: 'too_many_subscriptions' };
    if (bufferOf(socket, campaignId)) return { ok: false, error: 'busy' };

    let role: CampaignRole | null;
    try {
      role = await o.rights.role(campaignId, data.userId);
    } catch {
      return { ok: false, error: 'unavailable' };
    }
    if (!role) return { ok: false, error: 'forbidden' };
    if (socket.disconnected) return { ok: false, error: 'unavailable' };
    if (bufferOf(socket, campaignId)) return { ok: false, error: 'busy' };

    data.campaigns[campaignId] = role;
    const joined = [rooms.campaign(campaignId), rooms.member(campaignId, data.userId)];
    if (role === 'gm') joined.push(rooms.gm(campaignId));
    else void socket.leave(rooms.gm(campaignId));
    schedulePresence(campaignId);

    // Sans bus : pas de curseur ; un client qui demandait un rejeu recharge son état
    if (!o.bus) {
      void socket.join(joined);
      return { ok: true, campaignId, role, seq: null, replayed: 0, resync: afterSeq !== undefined };
    }

    // Premier abonnement : le curseur est la fin actuelle du flux (le client charge son état en REST)
    if (afterSeq === undefined) {
      void socket.join(joined);
      let seq: number | null = null;
      try {
        seq = await streamLastSeq(o.bus);
      } catch (err) {
        log.warn({ err }, 'bus injoignable : abonnement sans curseur');
      }
      return { ok: true, campaignId, role, seq, replayed: 0, resync: seq === null };
    }

    // Reprise : rejeu depuis afterSeq, direct mis en tampon pendant la lecture du flux
    const buffer: ReplayBuffer = {
      socket,
      viewer: { userId: data.userId, role },
      items: [],
      cancelled: false,
    };
    const set = replays.get(campaignId) ?? new Set<ReplayBuffer>();
    set.add(buffer);
    replays.set(campaignId, set);
    void socket.join([...joined, rooms.replaying(campaignId)]);

    let last = afterSeq;
    let replayed = 0;
    let resync = false;
    try {
      const r = await replayEvents(o.bus, {
        subjects: [`vtt.${campaignId}.>`],
        startSeq: afterSeq + 1,
        max: limits.replayMax,
        handler: (event, msg) => {
          last = msg.seq;
          if (buffer.cancelled) return;
          const d = deliveryFor(event, buffer.viewer);
          if (!d) return;
          socket.emit('event', packet(event, msg.seq, d === 'redacted'));
          replayed += 1;
        },
      });
      // Rejeu impossible : le client recharge son état (REST, lu après cet accusé)
      if (r.truncated) {
        resync = true;
        last = Math.max(last, r.streamLastSeq);
      }
    } catch (err) {
      log.warn({ err, campaignId }, 'rejeu impossible : rechargement demandé au client');
      resync = true;
    } finally {
      // Sans attente jusqu'à la sortie de replay:<id> : aucun événement direct ne peut s'intercaler
      dropBuffer(campaignId, buffer);
      if (!buffer.cancelled) {
        for (const item of buffer.items) {
          if (item.seq <= last) continue;
          socket.emit('event', item);
          last = item.seq;
        }
        void socket.leave(rooms.replaying(campaignId));
      }
    }
    if (buffer.cancelled) return { ok: false, error: 'unavailable' };
    return { ok: true, campaignId, role, seq: last, replayed, resync };
  }

  // ─── Changements de membres (événements de campaign) ─────────────────────────

  function applyMembership(event: EventEnvelope) {
    const campaignId = event.roomId;
    if (!campaignId) return;
    const payload = event.payload;
    const target = typeof payload.userId === 'string' ? payload.userId : null;
    switch (event.type) {
      case 'campaign.member_joined':
        if (target) void o.rights.forget(campaignId, target);
        return;
      case 'campaign.member_left': {
        if (!target) return;
        void o.rights.forget(campaignId, target);
        const reason = payload.kicked === true ? 'removed' : 'left';
        for (const s of localSockets(rooms.user(target))) {
          if (unsubscribe(s, campaignId)) s.emit('unsubscribed', { campaignId, reason });
        }
        return;
      }
      case 'campaign.member_role_changed': {
        if (!target) return;
        void o.rights.forget(campaignId, target);
        const role = payload.role;
        if (role !== 'gm' && role !== 'player' && role !== 'spectator') return;
        for (const s of localSockets(rooms.user(target))) {
          if (!(campaignId in s.data.campaigns)) continue;
          s.data.campaigns[campaignId] = role;
          if (role === 'gm') void s.join(rooms.gm(campaignId));
          else void s.leave(rooms.gm(campaignId));
          const buffer = bufferOf(s, campaignId);
          if (buffer) buffer.viewer.role = role;
        }
        schedulePresence(campaignId);
        return;
      }
      case 'campaign.deleted':
        for (const s of localSockets(rooms.campaign(campaignId))) {
          if (unsubscribe(s, campaignId)) s.emit('unsubscribed', { campaignId, reason: 'deleted' });
        }
        return;
    }
  }

  function dispatch(event: EventEnvelope, seq: number) {
    const { full, redacted } = targetsFor(event);
    const replaying = event.roomId ? rooms.replaying(event.roomId) : null;
    if (full.length) {
      let op = io.local.to(full);
      if (replaying) op = op.except(replaying);
      op.emit('event', packet(event, seq));
    }
    if (redacted.length) {
      let op = io.local.to(redacted).except(full);
      if (replaying) op = op.except(replaying);
      op.emit('event', packet(event, seq, true));
    }
    if (event.roomId) {
      for (const buffer of replays.get(event.roomId) ?? []) {
        const d = deliveryFor(event, buffer.viewer);
        if (d) buffer.items.push(packet(event, seq, d === 'redacted'));
      }
    }
    // Après la diffusion : un membre exclu reçoit encore l'annonce de son exclusion
    applyMembership(event);
  }

  // ─── Connexions ────────────────────────────────────────────────────────────

  io.use(async (socket, next) => {
    const token = handshakeToken(socket.handshake);
    if (!token) return next(authError());
    try {
      const user = await o.verify(token);
      socket.data.userId = user.userId;
      socket.data.campaigns = {};
      if (user.exp) {
        // Jeton expiré : fermeture ; le client se reconnecte avec un jeton renouvelé
        const timer = setTimeout(
          () => {
            socket.emit('session_expired');
            socket.disconnect(true);
          },
          Math.min(Math.max(user.exp * 1000 - Date.now(), 0), MAX_TIMEOUT_MS),
        );
        timer.unref();
        socket.once('disconnect', () => clearTimeout(timer));
      }
      next();
    } catch {
      next(authError());
    }
  });

  io.on('connection', (socket) => {
    socketMetrics().connections.add(1);
    socket.once('disconnect', () => socketMetrics().connections.add(-1));
    void socket.join(rooms.user(socket.data.userId));
    const subscribeBucket = new TokenBucket(SUBSCRIBE_RATE, SUBSCRIBE_BURST);
    const ephemeralBucket = new TokenBucket(limits.ephemeralRatePerSecond, limits.ephemeralBurst);
    let rateLimitedAt = 0;

    socket.on('subscribe', (input, ack) => {
      subscribe(socket, input, subscribeBucket).then(
        (r) => reply(ack, r),
        (err) => {
          log.error({ err }, 'abonnement en échec');
          reply(ack, { ok: false, error: 'unavailable' } satisfies SubscribeAck);
        },
      );
    });

    socket.on('unsubscribe', (input, ack) => {
      const parsed = CampaignInput.safeParse(input);
      if (!parsed.success) return reply(ack, { ok: false });
      reply(ack, { ok: unsubscribe(socket, parsed.data.campaignId) });
    });

    socket.on('presence', (input, ack) => {
      const parsed = CampaignInput.safeParse(input);
      if (!parsed.success || !(parsed.data.campaignId in socket.data.campaigns))
        return reply(ack, { ok: false, error: 'not_subscribed' } satisfies PresenceAck);
      presence(parsed.data.campaignId).then(
        (p) => reply(ack, { ok: true, ...p } satisfies PresenceAck),
        () => reply(ack, { ok: false, error: 'not_subscribed' } satisfies PresenceAck),
      );
    });

    // Canal éphémère : relayé aux autres abonnés, jamais stocké ; perdu si le lien sature
    socket.on('ephemeral', (input) => {
      if (!ephemeralBucket.take()) {
        socketMetrics().rateLimited.add(1);
        const now = Date.now();
        if (now - rateLimitedAt > 1000) {
          rateLimitedAt = now;
          socket.emit('rate_limited', { channel: 'ephemeral' });
        }
        return;
      }
      const parsed = EphemeralInput.safeParse(input);
      if (!parsed.success) return;
      const { campaignId, kind, data, gmOnly, toUsers } = parsed.data;
      const role = socket.data.campaigns[campaignId];
      if (!role) return;
      if (Buffer.byteLength(JSON.stringify(data ?? null)) > limits.ephemeralMaxBytes) return;
      // MJ seulement ; sinon les destinataires nommés abonnés à la campagne et les MJ ; sinon tous
      const audience = gmOnly
        ? [rooms.gm(campaignId)]
        : toUsers
          ? [rooms.gm(campaignId), ...toUsers.map((u) => rooms.member(campaignId, u))]
          : [rooms.campaign(campaignId)];
      socket.to(audience).volatile.emit('ephemeral', {
        campaignId,
        kind,
        data: data ?? null,
        from: { userId: socket.data.userId, role },
        at: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      for (const campaignId of Object.keys(socket.data.campaigns)) {
        const buffer = bufferOf(socket, campaignId);
        if (buffer) {
          buffer.cancelled = true;
          dropBuffer(campaignId, buffer);
        }
        schedulePresence(campaignId);
      }
    });
  });

  return { dispatch };
}
