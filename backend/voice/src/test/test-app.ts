/**
 * Service voice complet pour les tests : jetons signés par une clé du test (comme ceux
 * d'identity), faux campaign (serveur HTTP local), faux Cloudflare, salle en mémoire avec une
 * horloge réglable, annonces relevées au lieu d'aller sur le bus.
 */
import { loadConfig } from '@vtt/platform';
import { generateKeyPair, SignJWT } from 'jose';
import { buildVoice } from '../app.js';
import { VoiceConfig } from '../config.js';
import type { Announcer } from '../room/announce.js';
import { memoryRooms } from '../room/store.js';
import { fakeRealtime } from './fake-realtime.js';
import { fakeServices } from './fake-services.js';

export const SECRET = 'secret-interne-de-test-0123456789abcdef';
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function testApp(o: { configured?: boolean } = {}) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const services = await fakeServices(SECRET);
  const cf = fakeRealtime();
  let now = Date.parse('2026-10-08T20:00:00Z');
  const announced: Parameters<Announcer>[0][] = [];

  const app = await buildVoice(
    loadConfig(VoiceConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CAMPAIGN_URL: services.url,
      RIGHTS_CACHE_MS: '0',
    }),
    {
      authKeyResolver: async () => publicKey,
      bus: false,
      realtime: o.configured === false ? null : cf.realtime,
      rooms: memoryRooms(() => now),
      announce: async (a) => {
        announced.push(a);
      },
    },
  );

  const sign = (id: string) =>
    new SignJWT({ roles: ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  async function user() {
    const id = crypto.randomUUID();
    return { id, auth: { authorization: `Bearer ${await sign(id)}` } };
  }

  return {
    app,
    services,
    cf,
    announced,
    user,
    advance: (ms: number) => {
      now += ms;
    },
    close: async () => {
      await app.close();
      await services.close();
    },
  };
}
