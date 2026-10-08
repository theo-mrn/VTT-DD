/**
 * Cloudflare Realtime (docs/voix.md § 3.1) : le SFU et le TURN, par leur API HTTPS. Seul ce
 * service détient les secrets ; le navigateur ne lui parle jamais.
 *
 *   POST /apps/{app}/sessions/new                        session (une RTCPeerConnection)
 *   POST /apps/{app}/sessions/{session}/tracks/new       pousser (local) ou tirer (remote)
 *   PUT  /apps/{app}/sessions/{session}/renegotiate      réponse à une offre du SFU
 *   POST /turn/keys/{key}/credentials/generate-ice-servers   identifiants TURN à durée courte
 */
import { HttpError } from '@vtt/platform';
import type { VoiceIceServers, VoiceSdp } from '@vtt/contracts';
import { z } from 'zod';

const TIMEOUT_MS = 8_000;

const Sdp = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string() });

const TrackResult = z.object({
  mid: z.string().optional(),
  trackName: z.string().optional(),
  sessionId: z.string().optional(),
  errorCode: z.string().optional(),
  errorDescription: z.string().optional(),
});
export type TrackResult = z.infer<typeof TrackResult>;

const TracksResponse = z.object({
  requiresImmediateRenegotiation: z.boolean().optional(),
  sessionDescription: Sdp.optional(),
  tracks: z.array(TrackResult).default([]),
  errorCode: z.string().optional(),
  errorDescription: z.string().optional(),
});
export type TracksResponse = z.infer<typeof TracksResponse>;

const SessionResponse = z.object({
  sessionId: z.string().min(1),
  sessionDescription: Sdp.optional(),
  errorCode: z.string().optional(),
  errorDescription: z.string().optional(),
});

const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
/** `generate-ice-servers` rend une liste ; l'ancien `generate`, un seul serveur. */
const IceResponse = z.object({ iceServers: z.union([z.array(IceServer), IceServer]) });

/** Piste à pousser (la nôtre) ou à tirer (celle d'une autre session). */
export type TrackRequest =
  | { location: 'local'; mid: string; trackName: string }
  | { location: 'remote'; sessionId: string; trackName: string };

export interface Realtime {
  /** Nouvelle session ; avec une offre, la réponse du SFU (connexion sans piste poussée). */
  newSession(offer?: VoiceSdp): Promise<{ sessionId: string; answer?: VoiceSdp }>;
  tracks(sessionId: string, tracks: TrackRequest[], offer?: VoiceSdp): Promise<TracksResponse>;
  renegotiate(sessionId: string, answer: VoiceSdp): Promise<void>;
  /**
   * Ferme des pistes de la session, sans échange SDP (`force`) : une piste publiée cesse pour
   * tous ceux qui la tirent (fin d'un canal privé, docs/voix.md § 5).
   */
  closeTracks(sessionId: string, mids: string[]): Promise<void>;
  iceServers(ttlSeconds: number): Promise<VoiceIceServers>;
}

/**
 * Adresses sur le port 53 retirées : Cloudflare en propose (STUN et TURN), mais des navigateurs
 * les refusent (Firefox lève une erreur dès `new RTCPeerConnection`) ou les laissent expirer.
 */
export function withoutPort53(servers: VoiceIceServers['iceServers']): VoiceIceServers {
  const kept = servers.flatMap((server) => {
    const urls = [server.urls].flat().filter((u) => !/:53(\?|$)/.test(u));
    return urls.length ? [{ ...server, urls }] : [];
  });
  return { iceServers: kept };
}

/** Panne ou refus du SFU : 502, sans révéler la réponse de Cloudflare au navigateur. */
export function realtimeError(detail: string): HttpError {
  return new HttpError(502, 'Voix indisponible', 'voice_upstream', detail);
}

export function cloudflareRealtime(o: {
  url: string;
  appId: string;
  appToken: string;
  turnKeyId: string;
  turnKeyToken: string;
  fetch?: typeof globalThis.fetch;
  onError?: (error: unknown) => void;
}): Realtime {
  const doFetch = o.fetch ?? globalThis.fetch;
  const app = `${o.url.replace(/\/$/, '')}/apps/${encodeURIComponent(o.appId)}`;

  async function call<S extends z.ZodType>(
    method: string,
    url: string,
    token: string,
    body: unknown,
    schema: S,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      o.onError?.(error);
      throw realtimeError('Cloudflare Realtime ne répond pas');
    }
    const text = await res.text();
    if (!res.ok) {
      o.onError?.(new Error(`Cloudflare Realtime ${res.status} : ${text.slice(0, 300)}`));
      throw realtimeError(`Cloudflare Realtime a refusé la demande (${res.status})`);
    }
    const parsed = schema.safeParse(text ? JSON.parse(text) : {});
    if (!parsed.success) {
      o.onError?.(new Error(`Cloudflare Realtime : réponse inattendue ${text.slice(0, 300)}`));
      throw realtimeError('Réponse inattendue de Cloudflare Realtime');
    }
    const data = parsed.data as { errorCode?: string; errorDescription?: string };
    if (data.errorCode) {
      o.onError?.(new Error(`Cloudflare Realtime ${data.errorCode} : ${data.errorDescription}`));
      throw realtimeError(data.errorDescription ?? data.errorCode);
    }
    return parsed.data;
  }

  return {
    async newSession(offer) {
      const r = await call(
        'POST',
        `${app}/sessions/new`,
        o.appToken,
        offer ? { sessionDescription: offer } : undefined,
        SessionResponse,
      );
      return {
        sessionId: r.sessionId,
        ...(r.sessionDescription ? { answer: r.sessionDescription } : {}),
      };
    },
    tracks(sessionId, tracks, offer) {
      return call(
        'POST',
        `${app}/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
        o.appToken,
        { ...(offer ? { sessionDescription: offer } : {}), tracks },
        TracksResponse,
      );
    },
    async closeTracks(sessionId, mids) {
      const r = await call(
        'PUT',
        `${app}/sessions/${encodeURIComponent(sessionId)}/tracks/close`,
        o.appToken,
        { tracks: mids.map((mid) => ({ mid })), force: true },
        TracksResponse,
      );
      // Déjà fermée (close_track_error) : le but est atteint ; toute autre erreur remonte
      const failed = r.tracks.filter((t) => t.errorCode && t.errorCode !== 'close_track_error');
      if (failed.length) throw realtimeError('La voix privée n’a pas pu être coupée');
    },
    async renegotiate(sessionId, answer) {
      await call(
        'PUT',
        `${app}/sessions/${encodeURIComponent(sessionId)}/renegotiate`,
        o.appToken,
        { sessionDescription: answer },
        z.object({ errorCode: z.string().optional(), errorDescription: z.string().optional() }),
      );
    },
    async iceServers(ttl) {
      const r = await call(
        'POST',
        `${o.url.replace(/\/$/, '')}/turn/keys/${encodeURIComponent(o.turnKeyId)}/credentials/generate-ice-servers`,
        o.turnKeyToken,
        { ttl },
        IceResponse,
      );
      return withoutPort53(Array.isArray(r.iceServers) ? r.iceServers : [r.iceServers]);
    },
  };
}
