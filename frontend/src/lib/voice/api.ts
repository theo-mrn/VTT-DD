/** Routes du service voice (gateway `/v1/voice`, docs/voix.md § 7). */
import type {
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
} from '@vtt/contracts';

import { api } from '@/lib/api';

import type { VoiceSignaling } from './session';

const base = (campaignId: string) => `/v1/voice/campaigns/${encodeURIComponent(campaignId)}`;
const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const voiceApi: VoiceSignaling = {
  ice: (c) => api<VoiceIceServers>(`${base(c)}/ice`),
  join: (c, body: JoinVoice) => api<JoinVoiceResult>(`${base(c)}/join`, json('POST', body)),
  pull: (c, body: PullVoice) => api<PullVoiceResult>(`${base(c)}/pull`, json('POST', body)),
  renegotiate: (c, body: RenegotiateVoice) =>
    api<void>(`${base(c)}/renegotiate`, json('PUT', body)),
  heartbeat: (c, body: VoiceHeartbeat) =>
    api<VoiceRoom>(`${base(c)}/heartbeat`, json('POST', body)),
  openPrivate: (c, body: OpenPrivateVoice) =>
    api<VoiceRoom>(`${base(c)}/private`, json('POST', body)),
  pushPrivate: (c, body: PushPrivateVoice) =>
    api<PushPrivateVoiceResult>(`${base(c)}/private/track`, json('POST', body)),
  closePrivate: (c) => api<VoiceRoom>(`${base(c)}/private/close`, json('POST', {})),
  // keepalive : le départ part même quand l'onglet se ferme
  leave: (c) => api<void>(`${base(c)}/leave`, { ...json('POST', {}), keepalive: true }),
};

export function getVoiceRoom(campaignId: string): Promise<VoiceRoom> {
  return api<VoiceRoom>(base(campaignId));
}
