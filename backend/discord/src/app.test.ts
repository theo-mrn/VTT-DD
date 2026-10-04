/**
 * Route des interactions de bout en bout, avec une vraie paire de clés Ed25519, des services
 * Yner simulés et une API Discord simulée (messages relevés en mémoire).
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { loadConfig } from '@vtt/platform';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDiscord } from './app.js';
import { DiscordConfig } from './config.js';
import type { DiscordApi } from './discord/api.js';
import type { Message } from './discord/types.js';
import {
  YnerError,
  type Campaign,
  type GameSystem,
  type RollInput,
  type YnerClient,
} from './yner.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_HEX = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

const DISCORD_ID = '111111111111111111';
const CAMPAIGN: Campaign = {
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  name: 'La Table',
  system: { id: 'dnd-classic' },
  role: 'player',
  playedCharacterId: 'perso-1',
};
const DND: GameSystem = {
  systeme: { nom: 'D&D classique', des: null },
  presentation: { des: { sortes: { d20: { couleur: '#d0ad8b' } } } },
};

const publicRoll = {
  id: 'r',
  userName: '',
  total: 0,
  output: '',
  symbolResult: null,
  notation: null,
  visibility: 'public',
  label: null,
  outcome: null,
  timestamp: 0,
};

function fakes() {
  const sent: { kind: string; message?: Message }[] = [];
  const rolls: RollInput[] = [];
  let active: Campaign | null = CAMPAIGN;
  const yner: YnerClient = {
    delegate: async (id) => (id === DISCORD_ID ? 'jeton' : null),
    linkToken: async (id, name) => `liaison-${id}-${name}`,
    me: async () => ({ name: 'Théo', email: 'theo@exemple.fr' }),
    myCampaigns: async () => [CAMPAIGN],
    activeCampaign: async () => active,
    setActiveCampaign: async (_t, id) => (id === CAMPAIGN.id ? (active = CAMPAIGN) : null),
    roll: async (_t, input) => {
      if (input.characterId === 'supprime')
        throw new YnerError(404, 'character_not_found', undefined);
      rolls.push(input);
      return {
        id: 'r1',
        userName: 'Aldo',
        total: 17,
        output: '1d20+3 = [14] + 3 = 17',
        symbolResult: null,
        notation: input.notation ?? null,
        visibility: input.hidden ? 'private' : 'public',
        label: null,
        outcome: null,
        timestamp: 0,
      };
    },
    rolls: async () => [
      { ...publicRoll, userName: 'Aldo', total: 15, notation: '1d20' },
      { ...publicRoll, userName: 'Bria', total: 3, notation: '1d6' },
      { ...publicRoll, userName: 'MJ', total: 20, visibility: 'gm' },
    ],
    stats: async () => ({
      rollCount: 2,
      players: [
        {
          userName: 'Aldo',
          totalRolls: 2,
          averageRoll: 9.5,
          highestRoll: 15,
          lowestRoll: 4,
          criticalSuccesses: 1,
          criticalFailures: 0,
        },
      ],
    }),
    unlink: async () => 'unlinked',
    gameSystem: async (id) => (id === 'dnd-classic' ? DND : null),
  };
  const discord: DiscordApi = {
    editOriginal: async (_t, message) => void sent.push({ kind: 'edit', message }),
    deleteOriginal: async () => void sent.push({ kind: 'delete' }),
    followUp: async (_t, message) => void sent.push({ kind: 'followUp', message }),
  };
  return { yner, discord, sent, rolls, setActive: (c: Campaign | null) => (active = c) };
}

describe('POST /v1/discord/interactions', () => {
  let f: ReturnType<typeof fakes>;
  let app: Awaited<ReturnType<typeof buildDiscord>>;

  beforeAll(async () => {
    f = fakes();
    const config = loadConfig(DiscordConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DISCORD_APPLICATION_ID: '1495752182837018764',
      DISCORD_PUBLIC_KEY: PUBLIC_HEX,
      INTERNAL_API_SECRET: 'secret-interne-de-test-0123456789abcdef',
      IDENTITY_URL: 'http://identity.test',
      CAMPAIGN_URL: 'http://campaign.test',
      DICE_URL: 'http://dice.test',
      CHARACTER_URL: 'http://character.test',
      APP_URL: 'https://staging.yner.fr',
    });
    app = await buildDiscord(config, { yner: f.yner, discord: f.discord });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    f.sent.length = 0;
    f.rolls.length = 0;
    f.setActive(CAMPAIGN);
  });

  function post(body: unknown, opts: { badSignature?: boolean } = {}) {
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(timestamp + raw), privateKey).toString('hex');
    return app.inject({
      method: 'POST',
      url: '/v1/discord/interactions',
      headers: {
        'content-type': 'application/json',
        'x-signature-ed25519': opts.badSignature ? '0'.repeat(128) : signature,
        'x-signature-timestamp': timestamp,
      },
      payload: raw,
    });
  }

  const interaction = (type: number, data: unknown, user = DISCORD_ID) => ({
    id: '1',
    application_id: '1495752182837018764',
    type,
    token: 'jeton-interaction',
    member: { user: { id: user, username: 'theo', global_name: 'Théo' } },
    data,
  });

  /** Laisse le travail différé (setImmediate) se terminer. */
  const settle = () => vi.waitFor(() => expect(f.sent.length).toBeGreaterThan(0));

  it('refuse une signature invalide (401) et répond au PING', async () => {
    expect((await post({ type: 1 }, { badSignature: true })).statusCode).toBe(401);
    const ping = await post({ id: '1', application_id: 'a', type: 1, token: 't' });
    expect(ping.json()).toEqual({ type: 1 });
  });

  it('/roll 1d20+3 : jet avec le personnage de la salle active, publié dans le salon', async () => {
    const res = await post(
      interaction(2, { name: 'roll', options: [{ name: 'dice', type: 3, value: '1d20+3' }] }),
    );
    expect(res.json()).toEqual({ type: 5, data: { flags: 64 } });
    await vi.waitFor(() =>
      expect(f.sent.map((s) => s.kind)).toEqual(['edit', 'followUp', 'delete']),
    );
    expect(f.rolls[0]).toMatchObject({
      campaignId: CAMPAIGN.id,
      systemId: 'dnd-classic',
      characterId: 'perso-1',
      notation: '1d20+3',
      hidden: false,
    });
    expect(f.sent[1]!.message!.embeds![0]!.description).toContain('**17**');
  });

  it('/roll caché : résultat éphémère, visibilité privée', async () => {
    await post(
      interaction(2, {
        name: 'roll',
        options: [
          { name: 'dice', type: 3, value: '1d20' },
          { name: 'hidden', type: 5, value: true },
        ],
      }),
    );
    await settle();
    expect(f.rolls[0]!.hidden).toBe(true);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({ kind: 'edit', message: { flags: 64 } });
  });

  it('/tray : plateau des dés du système, puis lancer depuis le plateau', async () => {
    await post(interaction(2, { name: 'tray' }));
    await settle();
    const tray = f.sent[0]!.message!;
    const d20 = tray.components![0]!.components[0]!;
    expect(d20.label).toBe('d20');

    const click = await post({
      ...interaction(3, { custom_id: d20.custom_id }),
      message: { content: tray.content },
    });
    const updated = click.json() as { type: number; data: Message };
    expect(updated.type).toBe(7);
    const roll = updated.data
      .components!.flatMap((r) => r.components)
      .find((b) => b.label === 'Lancer')!;
    expect(roll.disabled).toBe(false);

    f.sent.length = 0;
    expect((await post(interaction(3, { custom_id: roll.custom_id }))).json()).toEqual({ type: 6 });
    await vi.waitFor(() => expect(f.sent.map((s) => s.kind)).toEqual(['followUp', 'edit']));
    expect(f.rolls.at(-1)).toMatchObject({ notation: '1d20' });
  });

  it('sans compte lié : bouton « Lier mon compte », jamais de jet', async () => {
    await post(
      interaction(2, { name: 'roll', options: [{ name: 'dice', type: 3, value: '1d20' }] }, '999'),
    );
    await settle();
    const button = f.sent[0]!.message!.components![0]!.components[0]!;
    expect(button.url).toBe('https://staging.yner.fr/discord/lier?jeton=liaison-999-Th%C3%A9o');
    expect(f.rolls).toEqual([]);
  });

  it('sans salle active : propose /room ; /room choisit parmi ses campagnes', async () => {
    f.setActive(null);
    await post(
      interaction(2, { name: 'roll', options: [{ name: 'dice', type: 3, value: '1d20' }] }),
    );
    await settle();
    expect(f.sent[0]!.message!.content).toContain('/room');

    const auto = await post(
      interaction(4, {
        name: 'room',
        options: [{ name: 'campaign', type: 3, value: 'tab', focused: true }],
      }),
    );
    expect(auto.json()).toEqual({
      type: 8,
      data: { choices: [{ name: 'La Table · D&D classique · Joueur', value: CAMPAIGN.id }] },
    });

    f.sent.length = 0;
    await post(
      interaction(2, {
        name: 'room',
        options: [{ name: 'campaign', type: 3, value: CAMPAIGN.id }],
      }),
    );
    await settle();
    expect(f.sent[0]!.message!.content).toBe('Salle active : **La Table** · Joueur');
  });

  it('/history : seulement les jets publics, filtrés par joueur, publiés dans le salon', async () => {
    await post(
      interaction(2, { name: 'history', options: [{ name: 'player', type: 3, value: 'ald' }] }),
    );
    await vi.waitFor(() =>
      expect(f.sent.map((s) => s.kind)).toEqual(['edit', 'followUp', 'delete']),
    );
    const description = f.sent[1]!.message!.embeds![0]!.description!;
    expect(description).toContain('**Aldo** · **15** · `1d20`');
    expect(description).not.toContain('Bria');
    expect(description).not.toContain('MJ');
  });

  it('/stats : réponse éphémère par joueur', async () => {
    await post(interaction(2, { name: 'stats' }));
    await settle();
    const embed = f.sent[0]!.message!.embeds![0]!;
    expect(f.sent[0]!.message!.flags).toBe(64);
    expect(embed.fields![0]).toMatchObject({ name: 'Aldo' });
    expect(embed.fields![0]!.value).toContain('2 jets · moyenne 9.5');
    expect(embed.fields![0]!.value).toContain('1 critiques');
  });

  it('/link et /unlink', async () => {
    await post(interaction(2, { name: 'link' }));
    await settle();
    expect(f.sent[0]!.message!.content).toBe('Lié à **Théo**.');
    expect(f.sent[0]!.message!.components![0]!.components[0]!.label).toBe('Lier mon compte');

    f.sent.length = 0;
    await post(interaction(2, { name: 'link' }, '999'));
    await settle();
    expect(f.sent[0]!.message!.components![0]!.components[0]!.label).toBe('Lier mon compte');

    f.sent.length = 0;
    await post(interaction(2, { name: 'unlink' }));
    await settle();
    expect(f.sent[0]!.message!.content).toBe('Compte délié.');
  });

  it('/room sans argument : affiche la salle active', async () => {
    await post(interaction(2, { name: 'room' }));
    await settle();
    expect(f.sent[0]!.message!.content).toBe('Salle active : **La Table** · Joueur');
  });

  it('autocomplétion de /roll : dés du système de la salle active', async () => {
    const res = await post(
      interaction(4, {
        name: 'roll',
        options: [{ name: 'dice', type: 3, value: '', focused: true }],
      }),
    );
    expect(res.json()).toEqual({ type: 8, data: { choices: [{ name: '1d20', value: '1d20' }] } });
  });

  it('/me : compte lié et salle active ; sans lien, bouton « Lier mon compte »', async () => {
    await post(interaction(2, { name: 'me' }));
    await settle();
    expect(f.sent[0]!.message!.content).toBe(
      'Compte Yner : **Théo** · theo@exemple.fr\nSalle active : **La Table** · Joueur',
    );
    expect(f.sent[0]!.message!.flags).toBe(64);

    f.sent.length = 0;
    await post(interaction(2, { name: 'me' }, '999'));
    await settle();
    expect(f.sent[0]!.message!.components![0]!.components[0]!.label).toBe('Lier mon compte');
  });

  it('personnage joué supprimé : le jet part au nom du joueur au lieu d’échouer', async () => {
    f.setActive({ ...CAMPAIGN, playedCharacterId: 'supprime' });
    await post(
      interaction(2, { name: 'roll', options: [{ name: 'dice', type: 3, value: '1d20' }] }),
    );
    await vi.waitFor(() =>
      expect(f.sent.map((s) => s.kind)).toEqual(['edit', 'followUp', 'delete']),
    );
    expect(f.rolls.at(-1)).toMatchObject({ characterId: null, notation: '1d20' });
  });
});
