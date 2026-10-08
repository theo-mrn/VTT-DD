/**
 * Module « voice » : la salle vocale d'une campagne (docs/voix.md § 3). Toutes les routes
 * demandent un jeton d'accès ; l'appelant doit être membre de la campagne (404 sinon). Un MJ ou
 * un joueur parle, un spectateur écoute.
 *
 *   GET  /v1/voice/campaigns/:id/ice          serveurs ICE (TURN à durée courte)
 *   GET  /v1/voice/campaigns/:id              la salle (qui est là, qui parle, qui est muet)
 *   POST /v1/voice/campaigns/:id/join         offre → réponse du SFU ; micro poussé
 *   POST /v1/voice/campaigns/:id/pull         tirer les voix d'autres participants → offre
 *   PUT  /v1/voice/campaigns/:id/renegotiate  réponse à l'offre d'un tirage
 *   POST /v1/voice/campaigns/:id/heartbeat    présence prolongée, micro coupé ou non → la salle
 *   POST /v1/voice/campaigns/:id/leave        départ
 *   POST /v1/voice/campaigns/:id/private        canal privé MJ ↔ joueur ouvert (MJ)
 *   POST /v1/voice/campaigns/:id/private/track  voix privée envoyée → réponse du SFU
 *   POST /v1/voice/campaigns/:id/private/close  canal privé fermé (MJ ou son joueur)
 *
 * Canal privé (docs/voix.md § 5) : chacun des deux envoie une copie de son micro sur une piste
 * au nom unique, que seul son correspondant peut tirer. À la fermeture, ces pistes sont fermées
 * chez Cloudflare : plus personne ne les reçoit, pas même un ancien correspondant.
 */
import { randomUUID } from 'node:crypto';
import {
  JoinVoice,
  OpenPrivateVoice,
  PushPrivateVoice,
  PushPrivateVoiceResult,
  JoinVoiceResult,
  PullVoice,
  PullVoiceResult,
  RenegotiateVoice,
  VoiceHeartbeat,
  VoiceIceServers,
  VoiceRoom,
  type VoiceParticipant,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CampaignRole } from '../../clients/campaign.js';
import { realtimeError, type Realtime, type TrackRequest } from '../../clients/cloudflare.js';
import type { Deps, Module } from '../../deps.js';
import type { Presence } from '../../room/store.js';

const Params = z.object({ id: z.uuid().transform((s) => s.toLowerCase()) });
const Ok = z.object({ ok: z.literal(true) });

/** Nom de la piste du micro dans la session Cloudflare de chacun. */
export const MIC_TRACK = 'mic';

const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();

export function participantOf(p: Presence): VoiceParticipant {
  return {
    userId: p.userId,
    speaker: p.micTrack !== null,
    muted: p.muted,
    joinedAt: p.joinedAt,
    privateWith: p.privateWith ?? null,
    privateLive: !!p.privateTrack,
  };
}

/** Présence sans canal privé. */
const withoutPrivate = (p: Presence): Presence => ({
  ...p,
  privateWith: null,
  privateTrack: null,
  privateMid: null,
});

const notFound = () =>
  new HttpError(404, 'Ressource introuvable', 'campaign_not_found', 'Campagne introuvable');
const notJoined = () =>
  new HttpError(409, 'Pas dans la salle vocale', 'voice_not_joined', 'Rejoignez d’abord la voix');
const unconfigured = () =>
  new HttpError(503, 'Voix indisponible', 'voice_unconfigured', 'La voix n’est pas configurée');
const notPrivate = () =>
  new HttpError(409, 'Pas en privé', 'voice_not_private', 'Aucun canal privé ouvert');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };
  const { rooms, announce } = deps;

  /** Rôle de l'appelant ; 404 s'il n'est pas membre. */
  async function roleOf(campaignId: string, userId: string): Promise<CampaignRole> {
    const role = await deps.campaigns.role(campaignId, userId);
    if (!role) throw notFound();
    return role;
  }

  function realtime(): Realtime {
    if (!deps.realtime) throw unconfigured();
    return deps.realtime;
  }

  async function room(campaignId: string) {
    const all = await rooms.list(campaignId);
    const here = new Set(all.map((p) => p.userId));
    // Correspondant parti sans fermer (présence expirée) : plus de pastille « privé »
    return {
      participants: all.map((p) =>
        participantOf(p.privateWith && !here.has(p.privateWith) ? withoutPrivate(p) : p),
      ),
    };
  }

  /** Annonce l'état d'un participant à la table. */
  async function updated(campaignId: string, p: Presence, role: CampaignRole, req: FastifyRequest) {
    await announce({
      type: 'voice.updated',
      campaignId,
      userId: p.userId,
      role,
      participant: participantOf(p),
      correlationId: req.id,
    });
  }

  /**
   * Ferme le canal privé de `userId` (et celui de son correspondant) : pistes privées fermées
   * chez Cloudflare, présences remises, annonces. Sans canal : rien.
   */
  async function closePrivate(
    campaignId: string,
    userId: string,
    role: CampaignRole,
    req: FastifyRequest,
  ) {
    const self = await rooms.get(campaignId, userId);
    if (!self?.privateWith) return false;
    const other = await rooms.get(campaignId, self.privateWith);
    const pair = [self, ...(other?.privateWith === userId ? [other] : [])];
    for (const p of pair) {
      if (p.privateMid) await realtime().closeTracks(p.sessionId, [p.privateMid]);
    }
    for (const p of pair) {
      const next = withoutPrivate(p);
      await rooms.put(campaignId, next);
      await updated(campaignId, next, role, req);
    }
    return true;
  }

  async function me(campaignId: string, userId: string): Promise<Presence> {
    const p = await rooms.get(campaignId, userId);
    if (!p) throw notJoined();
    return p;
  }

  r.get(
    '/v1/voice/campaigns/:id/ice',
    { ...auth, schema: { params: Params, response: { 200: VoiceIceServers } } },
    async (req) => {
      await roleOf(req.params.id, currentUser(req));
      return realtime().iceServers(deps.config.TURN_TTL_S);
    },
  );

  r.get(
    '/v1/voice/campaigns/:id',
    { ...auth, schema: { params: Params, response: { 200: VoiceRoom } } },
    async (req) => {
      await roleOf(req.params.id, currentUser(req));
      return room(req.params.id);
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/join',
    {
      ...auth,
      schema: { params: Params, body: JoinVoice, response: { 200: JoinVoiceResult } },
    },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      const role = await roleOf(campaignId, userId);
      const rt = realtime();
      // Un spectateur écoute : sa piste de micro éventuelle n'est pas poussée
      const micMid = role === 'spectator' ? undefined : req.body.micMid;
      let sessionId: string;
      let answer;
      if (micMid) {
        sessionId = (await rt.newSession()).sessionId;
        const pushed = await rt.tracks(
          sessionId,
          [{ location: 'local', mid: micMid, trackName: MIC_TRACK }],
          req.body.offer,
        );
        if (pushed.tracks.some((t) => t.errorCode))
          throw realtimeError('Le micro n’a pas pu être envoyé');
        answer = pushed.sessionDescription;
      } else {
        const s = await rt.newSession(req.body.offer);
        sessionId = s.sessionId;
        answer = s.answer;
      }
      if (!answer) throw realtimeError('Le SFU n’a pas répondu à l’offre');

      const before = await rooms.get(campaignId, userId);
      const presence: Presence = {
        userId,
        sessionId,
        micTrack: micMid ? MIC_TRACK : null,
        muted: req.body.muted,
        joinedAt: before?.joinedAt ?? new Date().toISOString(),
      };
      await rooms.put(campaignId, presence);
      await announce({
        type: 'voice.joined',
        campaignId,
        userId,
        role,
        participant: participantOf(presence),
        correlationId: req.id,
      });
      return { answer, room: await room(campaignId) };
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/pull',
    { ...auth, schema: { params: Params, body: PullVoice, response: { 200: PullVoiceResult } } },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      await roleOf(campaignId, userId);
      const self = await me(campaignId, userId);
      // Les voix des autres, qui parlent ; les identifiants de session restent ici
      const wanted: { userId: string; request: TrackRequest & { location: 'remote' } }[] = [];
      for (const id of new Set(req.body.userIds.map((u) => u.toLowerCase()))) {
        if (id === userId) continue;
        const p = await rooms.get(campaignId, id);
        if (p?.micTrack)
          wanted.push({
            userId: id,
            request: { location: 'remote', sessionId: p.sessionId, trackName: p.micTrack },
          });
      }
      // Voix privée : seulement celle de son correspondant, qui l'a envoyée
      const wantedPrivate: typeof wanted = [];
      for (const id of new Set(req.body.privateUserIds.map((u) => u.toLowerCase()))) {
        const p = await rooms.get(campaignId, id);
        if (!p || p.privateWith !== userId || self.privateWith !== id || !p.privateTrack)
          throw new HttpError(
            403,
            'Voix privée refusée',
            'voice_private_forbidden',
            'Cette voix privée ne vous est pas destinée',
          );
        wantedPrivate.push({
          userId: id,
          request: { location: 'remote', sessionId: p.sessionId, trackName: p.privateTrack },
        });
      }
      if (!wanted.length && !wantedPrivate.length) return { tracks: [] };
      const res = await realtime().tracks(
        self.sessionId,
        [...wanted, ...wantedPrivate].map((w) => w.request),
      );
      const found = (w: (typeof wanted)[number], isPrivate: boolean) => {
        const t = res.tracks.find(
          (x) => x.sessionId === w.request.sessionId && x.trackName === w.request.trackName,
        );
        return t?.mid && !t.errorCode ? [{ userId: w.userId, mid: t.mid, private: isPrivate }] : [];
      };
      const tracks = [
        ...wanted.flatMap((w) => found(w, false)),
        ...wantedPrivate.flatMap((w) => found(w, true)),
      ];
      return {
        ...(res.requiresImmediateRenegotiation && res.sessionDescription
          ? { offer: res.sessionDescription }
          : {}),
        tracks,
      };
    },
  );

  r.put(
    '/v1/voice/campaigns/:id/renegotiate',
    { ...auth, schema: { params: Params, body: RenegotiateVoice, response: { 200: Ok } } },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      await roleOf(campaignId, userId);
      const self = await me(campaignId, userId);
      await realtime().renegotiate(self.sessionId, req.body.answer);
      return { ok: true as const };
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/heartbeat',
    { ...auth, schema: { params: Params, body: VoiceHeartbeat, response: { 200: VoiceRoom } } },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      const role = await roleOf(campaignId, userId);
      const self = await me(campaignId, userId);
      const muted = req.body.muted ?? self.muted;
      const next = { ...self, muted };
      await rooms.put(campaignId, next);
      if (muted !== self.muted)
        await announce({
          type: 'voice.updated',
          campaignId,
          userId,
          role,
          participant: participantOf(next),
          correlationId: req.id,
        });
      return room(campaignId);
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/leave',
    { ...auth, schema: { params: Params, response: { 200: Ok } } },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      const role = await roleOf(campaignId, userId);
      if (await rooms.get(campaignId, userId)) {
        await closePrivate(campaignId, userId, role, req).catch((e) => req.log.warn(e));
        await rooms.remove(campaignId, userId);
        await announce({ type: 'voice.left', campaignId, userId, role, correlationId: req.id });
      }
      return { ok: true as const };
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/private',
    { ...auth, schema: { params: Params, body: OpenPrivateVoice, response: { 200: VoiceRoom } } },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      const role = await roleOf(campaignId, userId);
      if (role !== 'gm')
        throw new HttpError(
          403,
          'Réservé au MJ',
          'voice_gm_only',
          'Seul le MJ ouvre un canal privé',
        );
      const target = req.body.userId.toLowerCase();
      if (target === userId) throw HttpError.badRequest('Pas en privé avec soi-même', 'voice_self');
      const self = await me(campaignId, userId);
      const other = await rooms.get(campaignId, target);
      if (!self.micTrack || !other?.micTrack) throw notJoined();
      // Un seul canal à la fois, de chaque côté : l'ancien est fermé d'abord
      if (self.privateWith === target && other.privateWith === userId) return room(campaignId);
      await closePrivate(campaignId, userId, role, req);
      await closePrivate(campaignId, target, role, req);
      for (const p of [
        { ...withoutPrivate((await rooms.get(campaignId, userId))!), privateWith: target },
        { ...withoutPrivate((await rooms.get(campaignId, target))!), privateWith: userId },
      ]) {
        await rooms.put(campaignId, p);
        await updated(campaignId, p, role, req);
      }
      return room(campaignId);
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/private/track',
    {
      ...auth,
      schema: { params: Params, body: PushPrivateVoice, response: { 200: PushPrivateVoiceResult } },
    },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      const role = await roleOf(campaignId, userId);
      const self = await me(campaignId, userId);
      if (!self.privateWith || !self.micTrack) throw notPrivate();
      // Nom unique par canal : un ancien correspondant ne peut rien tirer du suivant
      const trackName = `private-${randomUUID()}`;
      const pushed = await realtime().tracks(
        self.sessionId,
        [{ location: 'local', mid: req.body.mid, trackName }],
        req.body.offer,
      );
      if (pushed.tracks.some((t) => t.errorCode) || !pushed.sessionDescription)
        throw realtimeError('La voix privée n’a pas pu être envoyée');
      // Fermé entre-temps : la piste ne sert à rien, elle est refermée aussitôt
      const now = await rooms.get(campaignId, userId);
      if (now?.privateWith !== self.privateWith) {
        await realtime().closeTracks(self.sessionId, [req.body.mid]);
        throw notPrivate();
      }
      // Voix privée renvoyée (nouvelle négociation) : l'ancienne piste ne reste pas ouverte
      if (now.privateMid && now.privateMid !== req.body.mid)
        await realtime().closeTracks(self.sessionId, [now.privateMid]);
      const next = { ...now, privateTrack: trackName, privateMid: req.body.mid };
      await rooms.put(campaignId, next);
      await updated(campaignId, next, role, req);
      return { answer: pushed.sessionDescription };
    },
  );

  r.post(
    '/v1/voice/campaigns/:id/private/close',
    { ...auth, schema: { params: Params, response: { 200: VoiceRoom } } },
    async (req) => {
      const campaignId = req.params.id;
      const userId = currentUser(req);
      const role = await roleOf(campaignId, userId);
      await me(campaignId, userId);
      await closePrivate(campaignId, userId, role, req);
      return room(campaignId);
    },
  );
};
