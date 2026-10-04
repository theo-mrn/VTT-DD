/**
 * Clients HTTP du bot, sans réseau : services Yner (jeton délégué, salle active, dés) et API
 * Discord (messages d'une interaction, enregistrement des commandes), par un fetch simulé.
 */
import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands.js';
import { DISCORD_API, discordApi, DiscordError, registerCommands } from './discord/api.js';
import { YnerError, ynerClient } from './yner.js';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch simulé : relève chaque appel et répond selon `route`. */
function fakeFetch(route: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status, body } = route(call);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const CAMPAIGN = {
  id: 'c1',
  name: 'La Table',
  system: { id: 'dnd-classic', version: '1' },
  role: 'player',
  playedCharacterId: 'p1',
};
const ROLL = {
  id: 'r1',
  userName: 'Aldo',
  total: 12,
  output: '1d20 = 12',
  symbolResult: null,
  notation: '1d20',
  visibility: 'public',
  label: null,
  outcome: null,
  timestamp: 1,
};

function client(route: (c: Call) => { status: number; body?: unknown }) {
  const f = fakeFetch(route);
  const yner = ynerClient({
    identity: 'http://identity.test',
    campaign: 'http://campaign.test',
    dice: 'http://dice.test',
    character: 'http://character.test',
    internalSecret: 'secret-interne-de-test-0123456789abcdef',
    fetch: f.fetch,
  });
  return { yner, calls: f.calls };
}

describe('client des services Yner', () => {
  it('jeton délégué : secret interne envoyé, null sans compte lié', async () => {
    const { yner, calls } = client((c) =>
      (c.body as { discordUserId: string }).discordUserId === '1'
        ? { status: 200, body: { accessToken: 'jeton' } }
        : { status: 404, body: { code: 'discord_not_linked' } },
    );
    expect(await yner.delegate('1')).toBe('jeton');
    expect(await yner.delegate('2')).toBeNull();
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://identity.test/internal/discord/delegate',
      headers: { 'x-internal-secret': 'secret-interne-de-test-0123456789abcdef' },
    });
  });

  it('jeton de liaison : demandé à identity avec le secret interne', async () => {
    const { yner, calls } = client(() => ({
      status: 200,
      body: { token: 'liaison', expiresIn: 600 },
    }));
    expect(await yner.linkToken('1', 'Théo')).toBe('liaison');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://identity.test/internal/discord/link-token',
      body: { discordUserId: '1', discordName: 'Théo' },
      headers: { 'x-internal-secret': 'secret-interne-de-test-0123456789abcdef' },
    });
  });

  it('personnage : son nom, null s’il est introuvable', async () => {
    const { yner, calls } = client((c) =>
      c.url.endsWith('/p1') ? { status: 200, body: { id: 'p1', nom: 'Aldo' } } : { status: 404 },
    );
    expect(await yner.characterName('t', 'p1')).toBe('Aldo');
    expect(await yner.characterName('t', 'supprime')).toBeNull();
    expect(calls[0]).toMatchObject({ url: 'http://character.test/v1/characters/p1' });
  });

  it('compte lié : nom et e-mail du profil', async () => {
    const { yner, calls } = client(() => ({
      status: 200,
      body: { id: 'u1', name: 'Théo', email: 'theo@exemple.fr', emailVerified: true },
    }));
    expect(await yner.me('t')).toEqual({ name: 'Théo', email: 'theo@exemple.fr' });
    expect(calls[0]).toMatchObject({ url: 'http://identity.test/v1/users/me' });
  });

  it('salle active : lue, choisie, absente ; campagnes du joueur', async () => {
    const { yner, calls } = client((c) => {
      if (c.url.endsWith('/v1/campaigns')) return { status: 200, body: [CAMPAIGN] };
      if (c.method === 'PUT')
        return (c.body as { campaignId: string }).campaignId === 'c1'
          ? { status: 200, body: CAMPAIGN }
          : { status: 404 };
      return c.headers.authorization === 'Bearer avec'
        ? { status: 200, body: CAMPAIGN }
        : { status: 404 };
    });
    expect((await yner.myCampaigns('avec')).map((c) => c.id)).toEqual(['c1']);
    expect((await yner.activeCampaign('avec'))?.name).toBe('La Table');
    expect(await yner.activeCampaign('sans')).toBeNull();
    expect((await yner.setActiveCampaign('avec', 'c1'))?.id).toBe('c1');
    expect(await yner.setActiveCampaign('avec', 'autre')).toBeNull();
    expect(calls.every((c) => c.headers.authorization?.startsWith('Bearer '))).toBe(true);
  });

  it('jet : notation ou pool, visibilité, personnage ; liste et statistiques', async () => {
    const { yner, calls } = client((c) => {
      if (c.method === 'POST') return { status: 201, body: ROLL };
      if (c.url.includes('/stats')) return { status: 200, body: { rollCount: 1, players: [] } };
      return { status: 200, body: [ROLL] };
    });
    await yner.roll('t', {
      campaignId: 'c1',
      systemId: 'dnd-classic',
      characterId: 'p1',
      notation: '1d20',
      hidden: false,
    });
    await yner.roll('t', {
      campaignId: 'c1',
      systemId: 'star-wars-eote',
      characterId: null,
      pool: [{ de: 'aptitude', nombre: 2 }],
      hidden: true,
    });
    expect(calls[0]!.body).toEqual({
      campaignId: 'c1',
      systemId: 'dnd-classic',
      characterId: 'p1',
      notation: '1d20',
      visibility: 'public',
    });
    expect(calls[1]!.body).toEqual({
      campaignId: 'c1',
      systemId: 'star-wars-eote',
      pool: [{ de: 'aptitude', nombre: 2 }],
      visibility: 'private',
    });
    expect(await yner.rolls('t', 'c1', 20)).toHaveLength(1);
    expect(calls[2]!.url).toBe('http://dice.test/v1/dice/rolls?campaignId=c1&limit=20');
    expect((await yner.stats('t', 'c1')).rollCount).toBe(1);
  });

  it('erreur d’un service : statut, code et détail RFC 9457', async () => {
    const { yner } = client(() => ({
      status: 429,
      body: { code: 'too_many_rolls', detail: 'Trop de jets' },
    }));
    const err = await yner.myCampaigns('t').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(YnerError);
    expect(err).toMatchObject({ status: 429, code: 'too_many_rolls', detail: 'Trop de jets' });
  });

  it('délier : route interne, délié ou aucun compte', async () => {
    let unlinked = true;
    const { yner, calls } = client(() => ({ status: 200, body: { unlinked } }));
    expect(await yner.unlink('1')).toBe('unlinked');
    unlinked = false;
    expect(await yner.unlink('1')).toBe('not_linked');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://identity.test/internal/discord/unlink',
      body: { discordUserId: '1' },
    });
  });

  it('système de jeu : public, mis en cache, null s’il est inconnu', async () => {
    const system = { systeme: { nom: 'D&D', des: null }, presentation: {} };
    const { yner, calls } = client((c) =>
      c.url.endsWith('/dnd-classic') ? { status: 200, body: system } : { status: 404 },
    );
    expect((await yner.gameSystem('dnd-classic'))?.systeme.nom).toBe('D&D');
    await yner.gameSystem('dnd-classic');
    expect(await yner.gameSystem('inconnu')).toBeNull();
    expect(calls.map((c) => c.url)).toEqual([
      'http://character.test/v1/systems/dnd-classic',
      'http://character.test/v1/systems/inconnu',
    ]);
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });
});

describe('API Discord', () => {
  it('messages d’une interaction : modification, suppression, suite, sans mention', async () => {
    const f = fakeFetch(() => ({ status: 200, body: {} }));
    const api = discordApi({ applicationId: '42', fetch: f.fetch });
    await api.editOriginal('jeton/a', { content: 'a' });
    await api.deleteOriginal('jeton/a');
    await api.followUp('jeton/a', { content: 'b' });
    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PATCH ${DISCORD_API}/webhooks/42/jeton%2Fa/messages/@original`,
      `DELETE ${DISCORD_API}/webhooks/42/jeton%2Fa/messages/@original`,
      `POST ${DISCORD_API}/webhooks/42/jeton%2Fa`,
    ]);
    expect(f.calls[0]!.body).toEqual({ allowed_mentions: { parse: [] }, content: 'a' });
  });

  it('refus de Discord : erreur avec le statut', async () => {
    const f = fakeFetch(() => ({ status: 404 }));
    const api = discordApi({ applicationId: '42', fetch: f.fetch });
    await expect(api.followUp('t', { content: 'x' })).rejects.toBeInstanceOf(DiscordError);
  });

  it('enregistrement des commandes : jeton du bot, raison du refus', async () => {
    const ok = fakeFetch(() => ({ status: 200, body: [] }));
    await registerCommands({
      applicationId: '42',
      botToken: 'bot',
      commands: COMMANDS,
      fetch: ok.fetch,
    });
    expect(ok.calls[0]).toMatchObject({
      method: 'PUT',
      url: `${DISCORD_API}/applications/42/commands`,
      headers: { authorization: 'Bot bot' },
    });
    expect((ok.calls[0]!.body as { name: string }[]).map((c) => c.name)).toEqual([
      'room',
      'roll',
      'tray',
      'history',
      'stats',
      'me',
      'link',
      'unlink',
    ]);

    const refused = fakeFetch(() => ({ status: 403, body: { message: 'Missing Access' } }));
    await expect(
      registerCommands({
        applicationId: '42',
        botToken: 'bot',
        commands: COMMANDS,
        fetch: refused.fetch,
      }),
    ).rejects.toThrow('Missing Access');
  });
});
