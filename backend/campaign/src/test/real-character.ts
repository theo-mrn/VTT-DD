/**
 * campaign contre le VRAI service character (docs/combat.md § 16, intégration des lots) : les
 * deux applications tournent dans ce processus, chacune sur un port libre, et se parlent par
 * leurs vraies routes HTTP :
 *  - campaign → character : résumé, initiative, décompte des durées, attaques (`prepare`,
 *    `resolve`), décisions (`modifications/apply`, `revert`), PNJ de la carte ;
 *  - character → campaign : droits, camp d'un PNJ (Q4), règles optionnelles.
 * Les jetons sont signés par une clé de test acceptée par les deux services. Les dés tirés par
 * character sont pilotés (`imposer`) ; les jets qu'il transmet à dice sont gardés (`jets`).
 *
 * Bases : TEST_DATABASE_URL (campaign, rôle campaign_svc) et CHARACTER_TEST_DATABASE_URL
 * (character, rôle characters_svc), celles de la base Docker de dev :
 *
 *   TEST_DATABASE_URL="$(grep '^DATABASE_URL=' backend/campaign/.env | cut -d= -f2-)" \
 *   CHARACTER_TEST_DATABASE_URL="$(grep '^DATABASE_URL=' backend/character/.env | cut -d= -f2-)" \
 *   pnpm --filter @vtt/campaign exec vitest run src/modules/combat/real-character.int.test.ts
 *
 * Utilisateurs neufs ; à la fermeture, tout ce qu'ils ont créé est supprimé des deux bases
 * (campagnes, personnages, applications et décomptes, événements des outbox).
 *
 * Le code de character est chargé par son chemin (import dynamique) : campaign n'en dépend
 * pas, et son typage reste le sien.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { buildCampaign } from '../app.js';
import { characterClient, type CharacterClient } from '../clients/character.js';
import type { ProfilesClient } from '../clients/profiles.js';
import { CampaignConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { campaigns, outbox } from '../db/schema.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const CHARACTER_TEST_DATABASE_URL = process.env.CHARACTER_TEST_DATABASE_URL;

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

/** Sources de character, chargées par leur chemin. */
const CHARACTER_SRC = new URL('../../../character/src/', import.meta.url);

/** Jet d'action transmis par character à dice (contrat de dice, `POST /internal/rolls`). */
export interface ForwardedRoll {
  campaignId?: string;
  authorId: string;
  characterId: string;
  characterName: string;
  actionId: string;
  visibility: string;
  dice: { faces: number; values: { value: number }[] }[];
  total?: number;
  outcome: { success: boolean | null; critical: boolean; fumble: boolean };
  explanations: string[];
}

interface CharacterModules {
  buildCharacter(config: unknown, extra: Record<string, unknown>): Promise<FastifyInstance>;
  CharacterConfig: Parameters<typeof loadConfig>[0];
}

async function loadCharacter(): Promise<CharacterModules> {
  const app = (await import(new URL('app.ts', CHARACTER_SRC).href)) as Pick<
    CharacterModules,
    'buildCharacter'
  >;
  const config = (await import(new URL('config.ts', CHARACTER_SRC).href)) as Pick<
    CharacterModules,
    'CharacterConfig'
  >;
  return { buildCharacter: app.buildCharacter, CharacterConfig: config.CharacterConfig };
}

/** Client character de campaign, branché une fois character démarré (son port est libre). */
function lateCharacterClient() {
  let real: CharacterClient | null = null;
  const client = new Proxy({} as CharacterClient, {
    get:
      (_, key: keyof CharacterClient) =>
      (...args: unknown[]) => {
        if (!real) throw new Error('character pas encore démarré');
        return (real[key] as (...a: unknown[]) => unknown)(...args);
      },
  });
  return { client, connect: (c: CharacterClient) => (real = c) };
}

const addressOf = (app: Pick<FastifyInstance, 'server'>) => {
  const a = app.server.address();
  if (!a || typeof a === 'string') throw new Error('adresse inconnue');
  return `http://127.0.0.1:${a.port}`;
};

export async function realCombatApp() {
  if (!TEST_DATABASE_URL || !CHARACTER_TEST_DATABASE_URL)
    throw new Error('TEST_DATABASE_URL et CHARACTER_TEST_DATABASE_URL sont requis');
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const authKeyResolver = async () => publicKey;

  // ── campaign, sur un port libre ──
  const connection = createDb(TEST_DATABASE_URL);
  const names = new Map<string, string>();
  const profiles: ProfilesClient = {
    profiles: async (ids) =>
      new Map(ids.map((id) => [id, { name: names.get(id) ?? null, avatarUrl: null }])),
  };
  const late = lateCharacterClient();
  const campaign = await buildCampaign(
    loadConfig(CampaignConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      APP_URL: 'https://jeu.test.local',
      R2_PUBLIC_URL: 'https://cdn.test.local/vtt/',
    }),
    {
      authKeyResolver,
      profiles,
      signer: async (r) => `https://s3.test.local/vtt/${r.key}?X-Amz-Signature=faux`,
      character: late.client,
      db: connection.db,
    },
  );
  await campaign.listen({ port: 0, host: '127.0.0.1' });

  // ── character (le vrai), sur un port libre, qui interroge ce campaign ──
  const { buildCharacter, CharacterConfig } = await loadCharacter();
  const queue: number[] = [];
  const generator = {
    entier: (max: number) => {
      while (queue.length) {
        const r = queue.shift()!;
        if (r >= 1 && r <= max) return r;
      }
      return 1 + Math.floor(Math.random() * max);
    },
  };
  const rolls: ForwardedRoll[] = [];
  const character = await buildCharacter(
    loadConfig(CharacterConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: CHARACTER_TEST_DATABASE_URL,
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CAMPAIGN_URL: addressOf(campaign),
      // Droits relus à chaque appel : une incarnation compte tout de suite
      DROITS_CACHE_MS: '0',
    }),
    {
      authKeyResolver,
      aleatoire: () => generator,
      des: {
        transmettre: async (jet: ForwardedRoll) => {
          rolls.push(jet);
        },
      },
    },
  );
  await character.listen({ port: 0, host: '127.0.0.1' });
  late.connect(characterClient({ url: addressOf(character), secret: SECRET }));
  const characterDb = new pg.Pool({ connectionString: CHARACTER_TEST_DATABASE_URL, max: 2 });

  const users: string[] = [];

  /** Nouvel utilisateur (identifiant aléatoire) et son en-tête d'autorisation. */
  async function user(name?: string) {
    const id = crypto.randomUUID();
    users.push(id);
    if (name) names.set(id, name);
    const token = await new SignJWT({ roles: ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('10m')
      .sign(privateKey);
    return { id, auth: { authorization: `Bearer ${token}` } };
  }

  /** Prochains dés tirés par character (les faces hors du dé demandé sont sautées). */
  const impose = (...faces: number[]) => {
    queue.length = 0;
    queue.push(...faces);
  };

  async function close() {
    const db = connection.db;
    const campaignIds = users.length
      ? (
          await db
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(inArray(campaigns.ownerId, users))
        ).map((c) => c.id)
      : [];
    await character.close();
    await campaign.close();
    if (users.length) {
      // character : personnages des utilisateurs du test (PNJ du MJ compris), leurs
      // applications et décomptes, leurs événements
      const owned = await characterDb.query<{ id: string }>(
        'select id from characters.characters where owner_id = any($1::uuid[])',
        [users],
      );
      const ids = owned.rows.map((r) => r.id);
      if (campaignIds.length)
        await characterDb.query(
          'delete from characters.applications where campaign_id = any($1::uuid[])',
          [campaignIds],
        );
      if (ids.length) {
        await characterDb.query(
          `delete from characters.outbox where envelope->'aggregate'->>'id' = any($1::text[])`,
          [ids],
        );
        await characterDb.query('delete from characters.characters where id = any($1::uuid[])', [
          ids,
        ]);
      }
      // campaign : comme testApp
      if (campaignIds.length) {
        await db.delete(outbox).where(inArray(sql`${outbox.envelope}->>'roomId'`, campaignIds));
        await db.delete(campaigns).where(inArray(campaigns.id, campaignIds));
      }
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'actor'->>'userId'`, users));
    }
    await characterDb.end();
    await connection.pool.end();
  }

  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  type User = Awaited<ReturnType<typeof user>>;
  const call =
    (app: Pick<FastifyInstance, 'inject'>) =>
    (u: User, method: Method, url: string, payload?: unknown, headers?: Record<string, string>) =>
      app.inject({
        method,
        url,
        headers: { ...u.auth, ...headers },
        ...(payload !== undefined ? { payload: payload as object } : {}),
      });

  return {
    campaign,
    character,
    db: connection.db,
    characterDb,
    rolls,
    impose,
    user,
    close,
    /** Requête à campaign (qui appelle character par HTTP). */
    toCampaign: call(campaign),
    /** Requête à character (routes publiques de la fiche). */
    toCharacter: call(character),
  };
}

export type RealCombat = Awaited<ReturnType<typeof realCombatApp>>;
export type RealUser = Awaited<ReturnType<RealCombat['user']>>;
