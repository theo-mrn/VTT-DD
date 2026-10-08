/**
 * Faux Cloudflare Realtime pour les tests : sessions et pistes en mémoire, réponses SDP
 * factices, et le journal des appels (le service ne doit jamais révéler une session).
 */
import type { Realtime, TrackRequest } from '../clients/cloudflare.js';

export function fakeRealtime() {
  let n = 0;
  const sessions = new Map<
    string,
    { pushed: string[]; pulled: TrackRequest[]; closed: string[] }
  >();
  const calls: string[] = [];
  let down = false;
  const sdp = (type: 'offer' | 'answer') => ({ type, sdp: `v=0 ${type} ${++n}` });

  const realtime: Realtime = {
    async newSession(offer) {
      if (down) throw new Error('panne');
      const sessionId = `s${++n}`;
      sessions.set(sessionId, { pushed: [], pulled: [], closed: [] });
      calls.push(`newSession ${offer ? 'offre' : 'vide'}`);
      return { sessionId, ...(offer ? { answer: sdp('answer') } : {}) };
    },
    async tracks(sessionId, tracks, offer) {
      const s = sessions.get(sessionId)!;
      calls.push(`tracks ${sessionId} ${tracks.map((t) => t.location).join(',')}`);
      const out = tracks.map((t, i) => {
        if (t.location === 'local') {
          s.pushed.push(t.trackName);
          return { mid: t.mid, trackName: t.trackName };
        }
        s.pulled.push(t);
        const exists = sessions.get(t.sessionId)?.pushed.includes(t.trackName);
        return exists
          ? { mid: String(10 + i), trackName: t.trackName, sessionId: t.sessionId }
          : { trackName: t.trackName, sessionId: t.sessionId, errorCode: 'not_found' };
      });
      const remote = tracks.some((t) => t.location === 'remote');
      return {
        tracks: out,
        ...(offer ? { sessionDescription: sdp('answer') } : {}),
        ...(remote
          ? { requiresImmediateRenegotiation: true, sessionDescription: sdp('offer') }
          : {}),
      };
    },
    async closeTracks(sessionId, mids) {
      calls.push(`close ${sessionId} ${mids.join(',')}`);
      const s = sessions.get(sessionId);
      if (s) s.closed.push(...mids);
    },
    async renegotiate(sessionId) {
      calls.push(`renegotiate ${sessionId}`);
    },
    async iceServers(ttl) {
      return {
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478'] },
          { urls: ['turn:turn.cloudflare.com:3478'], username: `u${ttl}`, credential: 'c' },
        ],
      };
    },
  };
  return {
    realtime,
    sessions,
    calls,
    setDown: (v: boolean) => {
      down = v;
    },
  };
}
