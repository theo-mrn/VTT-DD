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
 */
import {
  JoinVoice,
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
  return { userId: p.userId, speaker: p.micTrack !== null, muted: p.muted, joinedAt: p.joinedAt };
}

const notFound = () =>
  new HttpError(404, 'Ressource introuvable', 'campaign_not_found', 'Campagne introuvable');
const notJoined = () =>
  new HttpError(409, 'Pas dans la salle vocale', 'voice_not_joined', 'Rejoignez d’abord la voix');
const unconfigured = () =>
  new HttpError(503, 'Voix indisponible', 'voice_unconfigured', 'La voix n’est pas configurée');

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
    return { participants: (await rooms.list(campaignId)).map(participantOf) };
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
      if (!wanted.length) return { tracks: [] };
      const res = await realtime().tracks(
        self.sessionId,
        wanted.map((w) => w.request),
      );
      const tracks = wanted.flatMap((w) => {
        const t = res.tracks.find(
          (x) => x.sessionId === w.request.sessionId && x.trackName === w.request.trackName,
        );
        return t?.mid && !t.errorCode ? [{ userId: w.userId, mid: t.mid }] : [];
      });
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
        await rooms.remove(campaignId, userId);
        await announce({ type: 'voice.left', campaignId, userId, role, correlationId: req.id });
      }
      return { ok: true as const };
    },
  );
};
