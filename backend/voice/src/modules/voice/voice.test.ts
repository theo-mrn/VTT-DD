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
    expect(body.tracks).toEqual([{ userId: mj.id, mid: '10', private: false }]);
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

describe('canal privé MJ ↔ joueur', () => {
  async function table() {
    const [mj, alice, bob] = [await t.user(), await t.user(), await t.user()];
    const c = t.services.campaign({ [mj.id]: 'gm', [alice.id]: 'player', [bob.id]: 'player' });
    for (const u of [mj, alice, bob]) await join(u, c);
    return { mj, alice, bob, c };
  }

  it('le MJ seul l’ouvre ; les deux portent la pastille, vue de toute la table', async () => {
    const { mj, alice, bob, c } = await table();
    expect((await call(alice, 'POST', `${c}/private`, { userId: bob.id })).json().code).toBe(
      'voice_gm_only',
    );
    const res = await call(mj, 'POST', `${c}/private`, { userId: alice.id });
    expect(res.statusCode, res.body).toBe(200);
    const room = (await call(bob, 'GET', c)).json();
    const byId = (id: string) => room.participants.find((p: { userId: string }) => p.userId === id);
    expect(byId(mj.id)).toMatchObject({ privateWith: alice.id, privateLive: false });
    expect(byId(alice.id)).toMatchObject({ privateWith: mj.id, privateLive: false });
    expect(byId(bob.id)).toMatchObject({ privateWith: null });
  });

  it('la voix privée ne se tire que par son correspondant', async () => {
    const { mj, alice, bob, c } = await table();
    await call(mj, 'POST', `${c}/private`, { userId: alice.id });
    const pushed = await call(mj, 'POST', `${c}/private/track`, { offer, mid: '3' });
    expect(pushed.statusCode, pushed.body).toBe(200);
    expect(pushed.json().answer.type).toBe('answer');
    // Un autre joueur : refusé
    const volee = await call(bob, 'POST', `${c}/pull`, { privateUserIds: [mj.id] });
    expect([volee.statusCode, volee.json().code]).toEqual([403, 'voice_private_forbidden']);
    // Le correspondant : la voix privée, marquée comme telle
    const ok = await call(alice, 'POST', `${c}/pull`, { privateUserIds: [mj.id] });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().tracks).toEqual([expect.objectContaining({ userId: mj.id, private: true })]);
    // Le nom de la piste privée ne sort jamais du service
    expect(ok.body).not.toContain('private-');
  });

  it('fermer : les pistes privées sont coupées chez Cloudflare, pour les deux', async () => {
    const { mj, alice, c } = await table();
    await call(mj, 'POST', `${c}/private`, { userId: alice.id });
    await call(mj, 'POST', `${c}/private/track`, { offer, mid: '3' });
    await call(alice, 'POST', `${c}/private/track`, { offer, mid: '4' });
    // Le joueur peut fermer aussi
    const res = await call(alice, 'POST', `${c}/private/close`);
    expect(res.statusCode, res.body).toBe(200);
    const closes = t.cf.calls.filter((x) => x.startsWith('close '));
    expect(closes).toHaveLength(2);
    expect(closes.some((x) => x.endsWith(' 3'))).toBe(true);
    expect(closes.some((x) => x.endsWith(' 4'))).toBe(true);
    expect(res.json().participants.every((p: { privateWith: unknown }) => !p.privateWith)).toBe(
      true,
    );
    // Plus rien à tirer
    const apres = await call(alice, 'POST', `${c}/pull`, { privateUserIds: [mj.id] });
    expect(apres.statusCode).toBe(403);
  });

  it('un nouveau canal ferme l’ancien : un ancien correspondant ne reçoit plus rien', async () => {
    const { mj, alice, bob, c } = await table();
    await call(mj, 'POST', `${c}/private`, { userId: alice.id });
    await call(mj, 'POST', `${c}/private/track`, { offer, mid: '3' });
    await call(mj, 'POST', `${c}/private`, { userId: bob.id });
    expect(t.cf.calls.filter((x) => x.startsWith('close '))).toHaveLength(1);
    expect((await call(alice, 'POST', `${c}/pull`, { privateUserIds: [mj.id] })).statusCode).toBe(
      403,
    );
    const room = (await call(alice, 'GET', c)).json();
    expect(
      room.participants.find((p: { userId: string }) => p.userId === alice.id).privateWith,
    ).toBe(null);
  });

  it('partir ferme le canal privé', async () => {
    const { mj, alice, c } = await table();
    await call(mj, 'POST', `${c}/private`, { userId: alice.id });
    await call(alice, 'POST', `${c}/private/track`, { offer, mid: '4' });
    await call(alice, 'POST', `${c}/leave`);
    expect(t.cf.calls.filter((x) => x.startsWith('close '))).toHaveLength(1);
    const room = (await call(mj, 'GET', c)).json();
    expect(room.participants[0]).toMatchObject({ userId: mj.id, privateWith: null });
  });

  it('envoyer une voix privée sans canal : 409', async () => {
    const { alice, c } = await table();
    const res = await call(alice, 'POST', `${c}/private/track`, { offer, mid: '4' });
    expect([res.statusCode, res.json().code]).toEqual([409, 'voice_not_private']);
  });
});
