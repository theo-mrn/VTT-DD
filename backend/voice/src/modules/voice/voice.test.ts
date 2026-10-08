import { VOICE_PRESENCE_TTL_S } from '@vtt/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../../test/test-app.js';

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<T['user']>>;

let t: T;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.close();
});

const offer = { type: 'offer' as const, sdp: 'v=0 offre' };

async function call(u: U, method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown) {
  return t.app.inject({
    method,
    url: `/v1/voice/campaigns/${path}`,
    headers: u.auth,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

async function join(u: U, campaign: string, body: object = { offer, micMid: '0' }) {
  const res = await call(u, 'POST', `${campaign}/join`, body);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

describe('salle vocale', () => {
  it('membres seulement ; voix non configurée : 503', async () => {
    const [mj, inconnu] = [await t.user(), await t.user()];
    const c = t.services.campaign({ [mj.id]: 'gm' });
    expect((await call(inconnu, 'GET', c)).statusCode).toBe(404);
    expect((await call(mj, 'GET', c)).json()).toEqual({ participants: [] });
    const sans = await testApp({ configured: false });
    const u = await sans.user();
    const c2 = sans.services.campaign({ [u.id]: 'player' });
    const r = await sans.app.inject({
      method: 'POST',
      url: `/v1/voice/campaigns/${c2}/join`,
      headers: u.auth,
      payload: { offer, micMid: '0' },
    });
    expect([r.statusCode, r.json().code]).toEqual([503, 'voice_unconfigured']);
    await sans.close();
  });

  it('rejoindre : le micro est poussé, la salle et l’arrivée sont annoncées', async () => {
    const mj = await t.user();
    const c = t.services.campaign({ [mj.id]: 'gm' });
    const r = await join(mj, c);
    expect(r.answer.type).toBe('answer');
    expect(r.room.participants).toEqual([
      expect.objectContaining({ userId: mj.id, speaker: true, muted: false }),
    ]);
    expect(t.cf.calls).toEqual(['newSession vide', 'tracks s1 local']);
    expect(t.announced.map((a) => [a.type, a.userId])).toEqual([['voice.joined', mj.id]]);
    // Les identifiants de session Cloudflare ne sortent jamais
    expect(JSON.stringify(r)).not.toContain('"s1"');
  });

  it('un spectateur écoute : pas de micro poussé, connexion par l’offre seule', async () => {
    const [mj, spec] = [await t.user(), await t.user()];
    const c = t.services.campaign({ [mj.id]: 'gm', [spec.id]: 'spectator' });
    const r = await join(spec, c);
    expect(r.room.participants[0]).toMatchObject({ userId: spec.id, speaker: false });
    expect(t.cf.calls).toEqual(['newSession offre']);
  });

  it('tirer les voix des autres : celles qui parlent, sans soi, puis renégocier', async () => {
    const [mj, joueur, spec] = [await t.user(), await t.user(), await t.user()];
    const c = t.services.campaign({ [mj.id]: 'gm', [joueur.id]: 'player', [spec.id]: 'spectator' });
    await join(mj, c);
    await join(joueur, c);
    await join(spec, c);
    const res = await call(joueur, 'POST', `${c}/pull`, { userIds: [mj.id, joueur.id, spec.id] });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.offer.type).toBe('offer');
    expect(body.tracks).toEqual([{ userId: mj.id, mid: '10' }]);
    expect(
      (await call(joueur, 'PUT', `${c}/renegotiate`, { answer: { type: 'answer', sdp: 'x' } }))
        .statusCode,
    ).toBe(200);
    // Personne d'autre : rien à tirer, pas d'appel au SFU
    const seul = await call(mj, 'POST', `${c}/pull`, { userIds: [spec.id] });
    expect(seul.json()).toEqual({ tracks: [] });
  });

  it('hors de la salle : tirer ou renégocier est refusé (409)', async () => {
    const [mj, joueur] = [await t.user(), await t.user()];
    const c = t.services.campaign({ [mj.id]: 'gm', [joueur.id]: 'player' });
    await join(mj, c);
    const r = await call(joueur, 'POST', `${c}/pull`, { userIds: [mj.id] });
    expect([r.statusCode, r.json().code]).toEqual([409, 'voice_not_joined']);
  });

  it('battement : micro coupé annoncé ; sans battement, la présence expire', async () => {
    const [mj, joueur] = [await t.user(), await t.user()];
    const c = t.services.campaign({ [mj.id]: 'gm', [joueur.id]: 'player' });
    await join(mj, c);
    await join(joueur, c);
    const hb = await call(joueur, 'POST', `${c}/heartbeat`, { muted: true });
    expect(hb.json().participants).toContainEqual(
      expect.objectContaining({ userId: joueur.id, muted: true }),
    );
    expect(t.announced.at(-1)).toMatchObject({ type: 'voice.updated', userId: joueur.id });
    // Le MJ bat, le joueur non : il disparaît
    t.advance((VOICE_PRESENCE_TTL_S - 10) * 1000);
    await call(mj, 'POST', `${c}/heartbeat`, {});
    t.advance(20_000);
    const salle = (await call(mj, 'GET', c)).json();
    expect(salle.participants.map((p: { userId: string }) => p.userId)).toEqual([mj.id]);
    expect((await call(joueur, 'POST', `${c}/heartbeat`, {})).statusCode).toBe(409);
  });

  it('quitter : départ annoncé une fois', async () => {
    const mj = await t.user();
    const c = t.services.campaign({ [mj.id]: 'gm' });
    await join(mj, c);
    expect((await call(mj, 'POST', `${c}/leave`)).statusCode).toBe(200);
    expect((await call(mj, 'POST', `${c}/leave`)).statusCode).toBe(200);
    expect(t.announced.filter((a) => a.type === 'voice.left')).toHaveLength(1);
    expect((await call(mj, 'GET', c)).json()).toEqual({ participants: [] });
  });

  it('serveurs ICE à durée courte, pour les membres', async () => {
    const mj = await t.user();
    const c = t.services.campaign({ [mj.id]: 'gm' });
    const r = (await call(mj, 'GET', `${c}/ice`)).json();
    expect(r.iceServers[1]).toMatchObject({ username: 'u3600' });
  });
});
