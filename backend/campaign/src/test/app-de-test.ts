/**
 * Service campaign complet pour les tests, avec des jetons signés par une
 * clé générée pour le test (comme ceux d'identity) et un faux character
 * (serveur HTTP local). Branché sur le PostgreSQL de TEST_DATABASE_URL (rôle
 * campaign_svc) pour les tests d'intégration. Chaque test utilise des
 * utilisateurs neufs et supprime ensuite leurs salles : les tests peuvent
 * tourner en même temps sur la même base.
 */
import { loadConfig } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildCampaign } from '../app.js';
import type { ClientProfils } from '../clients/profils.js';
import { CampaignConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { outbox, rooms } from '../db/schema.js';
import type { DemandeSignature } from '../stockage/images.js';
import { fauxCharacter } from './faux-character.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const SECRET = 'secret-interne-de-test-0123456789abcdef';

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

export async function appDeTest(surcharges: Record<string, string> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connexion = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const character = await fauxCharacter(SECRET);
  let decalageMs = 0;
  const noms = new Map<string, string>();
  const profils: ClientProfils = {
    profils: async (ids) =>
      new Map(ids.map((id) => [id, { nom: noms.get(id) ?? null, avatarUrl: null }])),
  };
  // Faux stockage : URL d'envoi « signée » sans appel réseau, demandes gardées
  const envois: DemandeSignature[] = [];
  const signataire = async (d: DemandeSignature) => {
    envois.push(d);
    return `https://s3.test.local/vtt/${d.cle}?X-Amz-Signature=faux`;
  };

  const app = await buildCampaign(
    loadConfig(CampaignConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      INTERNAL_API_SECRET: SECRET,
      CHARACTER_URL: character.url,
      APP_URL: 'https://jeu.test.local',
      S3_PUBLIC_URL: 'https://cdn.test.local/vtt/',
      ...surcharges,
    }),
    {
      authKeyResolver: async () => publicKey,
      maintenant: () => new Date(Date.now() + decalageMs),
      profils,
      signataire,
      ...(connexion ? { db: connexion.db } : {}),
    },
  );

  const utilisateurs: string[] = [];

  /** Nouvel utilisateur (identifiant aléatoire) et son en-tête d'autorisation. */
  async function utilisateur(nom?: string) {
    const id = crypto.randomUUID();
    utilisateurs.push(id);
    if (nom) noms.set(id, nom);
    const jeton = await new SignJWT({ roles: ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);
    return { id, auth: { authorization: `Bearer ${jeton}` } };
  }

  /** Avance l'horloge du service (expiration des invitations). */
  const avancer = (ms: number) => {
    decalageMs += ms;
  };

  async function fermer() {
    await app.close();
    await character.fermer();
    if (connexion && utilisateurs.length) {
      const db = connexion.db;
      const ids = (
        await db.select({ id: rooms.id }).from(rooms).where(inArray(rooms.ownerId, utilisateurs))
      ).map((l) => l.id);
      if (ids.length) {
        await db.delete(outbox).where(inArray(sql`${outbox.envelope}->>'roomId'`, ids));
        await db.delete(rooms).where(inArray(rooms.id, ids));
      }
    }
    await connexion?.pool.end();
  }

  return { app, db: connexion?.db, character, envois, utilisateur, avancer, fermer };
}

export type Contexte = Awaited<ReturnType<typeof appDeTest>>;
export type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;

/** Raccourcis HTTP : requête brute, ou requête qui doit réussir. */
export function outils(t: Contexte) {
  type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const requete = (u: Utilisateur, method: Methode, url: string, payload?: unknown) =>
    t.app.inject({
      method,
      url,
      headers: u.auth,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  async function ok<T = Record<string, unknown>>(
    u: Utilisateur,
    method: Methode,
    url: string,
    payload?: unknown,
  ): Promise<T> {
    const res = await requete(u, method, url, payload);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return (res.body ? res.json() : undefined) as T;
  }

  /** Salle créée par `mj`, avec des joueurs invités (rôle joueur). */
  async function salle(mj: Utilisateur, systemeId = 'dnd-classic', joueurs: Utilisateur[] = []) {
    const s = await ok<{ id: string }>(mj, 'POST', '/v1/rooms', { nom: 'La Table', systemeId });
    if (joueurs.length) {
      const { code } = await ok<{ code: string }>(mj, 'POST', `/v1/rooms/${s.id}/invitations`, {});
      for (const j of joueurs) await ok(j, 'POST', '/v1/rooms/rejoindre', { code });
    }
    return s.id;
  }

  /** Personnage du faux character engagé dans la salle par son propriétaire. */
  async function engager(
    roomId: string,
    u: Utilisateur,
    p: { camp?: string; systemeId?: string } & Omit<
      Parameters<Contexte['character']['ajouter']>[0],
      'ownerId' | 'systemeId'
    > = {},
  ) {
    const { camp, systemeId = 'dnd-classic', ...reste } = p;
    const id = t.character.ajouter({ ownerId: u.id, systemeId, ...reste });
    await ok(u, 'POST', `/v1/rooms/${roomId}/personnages`, {
      characterId: id,
      ...(camp ? { camp } : {}),
    });
    return id;
  }

  return { requete, ok, salle, engager };
}
