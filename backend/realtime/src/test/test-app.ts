/**
 * Service realtime complet pour les tests, à l'écoute sur un port local :
 * jetons signés par une clé générée pour le test (comme ceux d'identity),
 * faux service campaign (vrai serveur HTTP, route interne des droits : le
 * vrai client HTTP de realtime est exercé). Sans NATS par défaut : les
 * événements sont injectés par `app.realtime.dispatch`. Avec `bus` (NATS
 * réel) et REDIS_URL, plusieurs instances forment de vrais réplicas.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv7, type EventEnvelope, type EventEnvelopeInput } from '@vtt/contracts';
import { loadConfig, type Bus } from '@vtt/platform';
import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { buildRealtime } from '../app.js';
import { RealtimeConfig } from '../config.js';
import type { CampaignRole } from '../routing.js';
import { TestSocket } from './socket-client.js';

export const SECRET = 'secret-interne-de-test-0123456789abcdef';
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

/** Faux campaign : campagne → utilisateur → rôle. */
export async function fakeCampaign(secret = SECRET) {
  const members = new Map<string, Map<string, CampaignRole>>();
  const calls: string[] = [];
  let down = false;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    calls.push(url.pathname);
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (down) return reply(500, { title: 'Erreur interne' });
    if (req.headers['x-internal-secret'] !== secret) return reply(401, { title: 'Refusé' });
    const m = /^\/internal\/campaigns\/([^/]+)\/rights$/.exec(url.pathname);
    if (!m) return reply(404, { title: 'Route introuvable' });
    const role = members.get(m[1]!)?.get(url.searchParams.get('userId') ?? '') ?? null;
    reply(200, { member: !!role, role });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    campaign(roles: Record<string, CampaignRole>): string {
      const id = crypto.randomUUID();
      members.set(id, new Map(Object.entries(roles)));
      return id;
    },
    setRole(campaignId: string, userId: string, role: CampaignRole | null) {
      const m = members.get(campaignId) ?? new Map<string, CampaignRole>();
      if (role) m.set(userId, role);
      else m.delete(userId);
      members.set(campaignId, m);
    },
    setDown(value: boolean) {
      down = value;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
export type FakeCampaign = Awaited<ReturnType<typeof fakeCampaign>>;

/** Clé de signature partagée par les instances d'un même test (réplicas). */
export async function signer() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const sign = (userId: string, o: { roles?: string[]; expiresIn?: string | number } = {}) =>
    new SignJWT({ roles: o.roles ?? ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(o.expiresIn ?? '5m')
      .sign(privateKey as CryptoKey);
  return { publicKey, sign };
}
export type Signer = Awaited<ReturnType<typeof signer>>;

export async function testApp(
  o: {
    campaign?: FakeCampaign;
    keys?: Signer;
    bus?: Bus | null;
    env?: Record<string, string>;
  } = {},
) {
  const campaign = o.campaign ?? (await fakeCampaign());
  const keys = o.keys ?? (await signer());
  const app = await buildRealtime(
    loadConfig(RealtimeConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CAMPAIGN_URL: campaign.url,
      RIGHTS_CACHE_SECONDS: '0',
      ...o.env,
    }),
    { authKeyResolver: async () => keys.publicKey, bus: o.bus ?? null, presenceDelayMs: 20 },
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const sockets: TestSocket[] = [];

  /** Nouvel utilisateur connecté (identifiant aléatoire). */
  async function connect(userId: string = crypto.randomUUID(), token?: string) {
    const socket = await TestSocket.connect(url, { token: token ?? (await keys.sign(userId)) });
    sockets.push(socket);
    return Object.assign(socket, { userId });
  }

  async function close() {
    for (const s of sockets) s.close();
    await app.close();
    if (!o.campaign) await campaign.close();
  }

  return { app, url, campaign, keys, connect, close };
}
export type TestContext = Awaited<ReturnType<typeof testApp>>;

/** Enveloppe d'événement valide (contrat partagé), à compléter. */
export function envelope(
  e: Partial<EventEnvelopeInput> & Pick<EventEnvelopeInput, 'type'>,
): EventEnvelope {
  return {
    id: uuidv7(),
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId: null,
    actor: { userId: null, role: 'system', characterId: null },
    aggregate: { type: 'test', id: '1' },
    visibility: 'public',
    payload: {},
    correlationId: 'test',
    causationId: null,
    traceparent: null,
    ...e,
  } as EventEnvelope;
}
