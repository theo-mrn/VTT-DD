import { describe, expect, it } from 'vitest';
import { cloudflareRealtime } from './cloudflare.js';

function fake(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; method: string; body: unknown; auth: string }[] = [];
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('authorization') ?? '',
    });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof globalThis.fetch;
  const rt = cloudflareRealtime({
    url: 'https://rtc.test/v1',
    appId: 'app',
    appToken: 'jeton-app',
    turnKeyId: 'cle',
    turnKeyToken: 'jeton-turn',
    fetch,
  });
  return { rt, calls };
}

describe('Cloudflare Realtime', () => {
  it('session, pistes, renégociation : adresses, jeton et corps', async () => {
    const { rt, calls } = fake([
      { body: { sessionId: 's1' } },
      {
        body: {
          sessionDescription: { type: 'answer', sdp: 'a' },
          tracks: [{ mid: '0', trackName: 'mic' }],
        },
      },
      { body: {} },
    ]);
    expect(await rt.newSession()).toEqual({ sessionId: 's1' });
    const offer = { type: 'offer' as const, sdp: 'o' };
    const r = await rt.tracks('s1', [{ location: 'local', mid: '0', trackName: 'mic' }], offer);
    expect(r.sessionDescription).toEqual({ type: 'answer', sdp: 'a' });
    await rt.renegotiate('s1', { type: 'answer', sdp: 'b' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://rtc.test/v1/apps/app/sessions/new',
      'POST https://rtc.test/v1/apps/app/sessions/s1/tracks/new',
      'PUT https://rtc.test/v1/apps/app/sessions/s1/renegotiate',
    ]);
    expect(calls[1]!.body).toEqual({
      sessionDescription: offer,
      tracks: [{ location: 'local', mid: '0', trackName: 'mic' }],
    });
    expect(calls.every((c) => c.auth === 'Bearer jeton-app')).toBe(true);
  });

  it('TURN : la liste de serveurs, ou un seul serveur (ancienne forme)', async () => {
    const { rt, calls } = fake([
      { status: 201, body: { iceServers: [{ urls: ['turn:a'], username: 'u', credential: 'c' }] } },
      { status: 201, body: { iceServers: { urls: ['turn:b'], username: 'u', credential: 'c' } } },
    ]);
    expect((await rt.iceServers(3600)).iceServers).toHaveLength(1);
    expect((await rt.iceServers(3600)).iceServers[0]!.urls).toEqual(['turn:b']);
    expect(calls[0]).toMatchObject({
      url: 'https://rtc.test/v1/turn/keys/cle/credentials/generate-ice-servers',
      body: { ttl: 3600 },
      auth: 'Bearer jeton-turn',
    });
  });

  it('refus ou erreur de Cloudflare : 502 sans sa réponse brute', async () => {
    const { rt } = fake([
      { status: 401, body: { error: 'jeton secret invalide' } },
      { body: { sessionId: 's', errorCode: 'bad', errorDescription: 'offre invalide' } },
    ]);
    await expect(rt.newSession()).rejects.toMatchObject({ status: 502, code: 'voice_upstream' });
    await expect(rt.newSession()).rejects.toMatchObject({ status: 502, detail: 'offre invalide' });
  });
});
