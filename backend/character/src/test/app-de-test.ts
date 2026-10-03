/**
 * Service character complet pour les tests, avec des jetons signés par une
 * clé générée pour le test (comme ceux d'identity). Branché sur le PostgreSQL
 * de TEST_DATABASE_URL (rôle characters_svc) pour les tests d'intégration.
 * Chaque test utilise des utilisateurs neufs et supprime ensuite leurs
 * personnages : les tests peuvent tourner en même temps sur la même base.
 */
import { loadConfig } from '@vtt/platform';
import { aleatoireCrypto, type Generateur } from '@vtt/rules';
import { inArray, sql } from 'drizzle-orm';
import { generateKeyPair, SignJWT } from 'jose';
import { buildCharacter } from '../app.js';
import { CharacterConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { applicationItems, applications, characters, outbox } from '../db/schema.js';
import type { JetAction, JournalDes } from '../des/dice.js';
import type { Catalogue } from '../regles/catalogue.js';
import {
  campaignIndisponible,
  type CampPersonnage,
  type Droits,
  type DroitsCampagnes,
  type RoleCampagne,
} from '../droits/campaign.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'vtt-api';

/**
 * Générateur de test : rejoue les résultats imposés (`imposer`), puis tire au
 * hasard. Les résultats imposés hors des faces du dé sont ignorés.
 */
export function aleatoirePilote() {
  const file: number[] = [];
  const hasard = aleatoireCrypto();
  const generateur: Generateur = {
    entier: (max) => {
      while (file.length) {
        const r = file.shift()!;
        if (r >= 1 && r <= max) return r;
      }
      return hasard.entier(max);
    },
  };
  /** Remplace les résultats imposés restants (ceux d'un jet précédent ne débordent pas). */
  const imposer = (...des: number[]) => {
    file.length = 0;
    file.push(...des);
  };
  return { generateur, imposer };
}

/**
 * Droits de salle simulés (à la place de campaign) : `accorder(characterId,
 * userId, droits)` ouvre la lecture ou l'écriture d'un personnage à un
 * utilisateur qui ne le possède pas ; `nommer(campaignId, userId, role)` fait
 * d'un utilisateur un membre d'une campagne. `panne(true)` simule campaign
 * injoignable pour les rôles (503). `regler(characterId, options)` règle les
 * options de la campagne d'un personnage.
 */
export function droitsSimules() {
  const table = new Map<string, Droits>();
  const roles = new Map<string, RoleCampagne>();
  const options = new Map<string, Record<string, boolean>>();
  const camps = new Map<string, CampPersonnage>();
  let enPanne = false;
  const droits: DroitsCampagnes = {
    de: async (characterId, userId) =>
      table.get(`${characterId}:${userId}`) ?? { lecture: false, ecriture: false },
    role: async (campaignId, userId) => {
      if (enPanne) throw campaignIndisponible();
      return roles.get(`${campaignId}:${userId}`) ?? null;
    },
    options: async (characterId) => options.get(characterId) ?? {},
    camp: async (campaignId, characterId) => {
      if (enPanne) throw campaignIndisponible();
      return camps.get(`${campaignId}:${characterId}`) ?? null;
    },
  };
  const accorder = (characterId: string, userId: string, d: Droits) =>
    table.set(`${characterId}:${userId}`, d);
  const nommer = (campaignId: string, userId: string, role: RoleCampagne) =>
    roles.set(`${campaignId}:${userId}`, role);
  const panne = (oui: boolean) => {
    enPanne = oui;
  };
  const regler = (characterId: string, o: Record<string, boolean>) => options.set(characterId, o);
  /** Camp d'un personnage engagé dans une campagne (lecture des PNJ ennemis : MJ seul). */
  const camper = (campaignId: string, characterId: string, camp: CampPersonnage) =>
    camps.set(`${campaignId}:${characterId}`, camp);
  return { droits, accorder, nommer, panne, regler, camper };
}

export async function appDeTest(
  surcharges: Record<string, string> = {},
  options: { droits?: DroitsCampagnes; des?: JournalDes; catalogue?: Catalogue } = {},
) {
  // Jets d'action transmis à dice : gardés pour les vérifier
  const jets: JetAction[] = [];
  const journal: JournalDes = {
    transmettre: async (jet) => {
      jets.push(jet);
    },
  };
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const connexion = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const des = aleatoirePilote();
  const app = await buildCharacter(
    loadConfig(CharacterConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL ?? 'postgres://absent@localhost:1/aucune',
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      ...surcharges,
    }),
    {
      authKeyResolver: async () => publicKey,
      aleatoire: () => des.generateur,
      ...(connexion ? { db: connexion.db } : {}),
      ...(options.droits ? { droits: options.droits } : {}),
      ...(options.catalogue ? { catalogue: options.catalogue } : {}),
      des: options.des ?? journal,
    },
  );

  const utilisateurs: string[] = [];

  /** Nouvel utilisateur (identifiant aléatoire) et son en-tête d'autorisation. */
  async function utilisateur() {
    const id = crypto.randomUUID();
    utilisateurs.push(id);
    const jeton = await new SignJWT({ roles: ['user'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);
    return { id, auth: { authorization: `Bearer ${jeton}` } };
  }

  async function fermer() {
    await app.close();
    if (connexion && utilisateurs.length) {
      const db = connexion.db;
      const ids = (
        await db
          .select({ id: characters.id })
          .from(characters)
          .where(inArray(characters.ownerId, utilisateurs))
      ).map((l) => l.id);
      if (ids.length) {
        await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, ids));
        await db.delete(characters).where(inArray(characters.id, ids));
        // Applications du combat dont tous les personnages viennent d'être supprimés
        await db.execute(
          sql`delete from ${applications} a where not exists (select 1 from ${applicationItems} i where i.application_id = a.application_id)`,
        );
      }
    }
    await connexion?.pool.end();
  }

  return { app, db: connexion?.db, des, jets, utilisateur, fermer };
}
