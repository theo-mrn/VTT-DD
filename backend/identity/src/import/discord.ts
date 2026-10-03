/**
 * Import des comptes Discord rattachés, vers identity.oauth_accounts
 * (provider « discord »). Deux sources dans l'ancienne app :
 *
 *  - les comptes créés par la connexion Discord (legacy/src/app/api/discord/auth) :
 *    uid Firebase « discord_<id> », document users/{uid} avec `discordId` ;
 *  - la collection `discordLinks/{discordId}` = { uid, linkedAt }, écrite par
 *    les commandes /login et /link du bot (legacy/src/app/api/discord/interactions).
 *
 * Un identifiant Discord ne peut désigner qu'un compte. Le compte créé par la
 * connexion Discord passe en premier : il n'a ni e-mail ni mot de passe, c'est
 * son seul moyen de connexion, alors que le compte lié au bot garde le sien.
 *
 * Rejouable : un lien déjà présent est ignoré (ON CONFLICT DO NOTHING).
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { oauthAccounts } from '../db/schema.js';
import type { DocFirestore } from '../modules/titres/import.js';
import { dateFirestore } from './ndjson.js';

/** Identifiant Discord (snowflake : entier décimal). */
const SNOWFLAKE = /^\d{5,30}$/;
const PREFIXE_UID_DISCORD = 'discord_';

export interface LienDiscord {
  providerAccountId: string;
  userId: string;
  createdAt: Date;
}

export interface RapportTransformationDiscord {
  /** Documents discordLinks lus. */
  lus: number;
  /** Comptes « discord_<id> » trouvés parmi les profils. */
  comptesDiscord: number;
  valides: number;
  sansCompte: number;
  invalides: number;
  /** Identifiant Discord déjà attribué à un autre compte : le premier est gardé. */
  doublons: number;
}

/** Transformation pure : profils et discordLinks -> lignes de identity.oauth_accounts. */
export function transformerLiensDiscord(
  liens: readonly DocFirestore[],
  profils: ReadonlyMap<string, Record<string, unknown>>,
  uuidParUid: ReadonlyMap<string, string>,
  now: Date = new Date(),
): { liens: LienDiscord[]; rapport: RapportTransformationDiscord } {
  const rapport: RapportTransformationDiscord = {
    lus: 0,
    comptesDiscord: 0,
    valides: 0,
    sansCompte: 0,
    invalides: 0,
    doublons: 0,
  };
  const parDiscord = new Map<string, LienDiscord>();

  function ajouter(discordId: string, uid: string, createdAt: Date) {
    const userId = uuidParUid.get(uid);
    if (!userId) {
      rapport.sansCompte++;
      return;
    }
    const deja = parDiscord.get(discordId);
    if (deja) {
      // Le même lien vu deux fois (compte Discord qui s'est lié à lui-même) n'est pas un doublon
      if (deja.userId !== userId) rapport.doublons++;
      return;
    }
    parDiscord.set(discordId, { providerAccountId: discordId, userId, createdAt });
    rapport.valides++;
  }

  // 1. Comptes créés par la connexion Discord
  for (const [uid, data] of profils) {
    if (!uid.startsWith(PREFIXE_UID_DISCORD)) continue;
    rapport.comptesDiscord++;
    const discordId =
      typeof data.discordId === 'string' ? data.discordId : uid.slice(PREFIXE_UID_DISCORD.length);
    if (!SNOWFLAKE.test(discordId)) {
      rapport.invalides++;
      continue;
    }
    ajouter(discordId, uid, now);
  }

  // 2. Liens du bot : discordLinks/{discordId}
  for (const doc of liens) {
    if (doc.path.split('/').length > 2) continue;
    rapport.lus++;
    const uid = doc.data.uid;
    if (!SNOWFLAKE.test(doc.id) || typeof uid !== 'string' || !uid) {
      rapport.invalides++;
      continue;
    }
    ajouter(doc.id, uid, dateFirestore(doc.data.linkedAt) ?? now);
  }

  return { liens: [...parDiscord.values()], rapport };
}

export interface RapportChargementDiscord {
  importes: number;
  dejaImportes: number;
  /** Identifiant Discord déjà rattaché à un autre compte sur la nouvelle plateforme. */
  conflits: number;
}

export async function chargerLiensDiscord(
  db: Db,
  ctx: EventContext,
  liens: readonly LienDiscord[],
): Promise<RapportChargementDiscord> {
  const rapport: RapportChargementDiscord = { importes: 0, dejaImportes: 0, conflits: 0 };
  for (const lien of liens) {
    const insere = await db.transaction(async (tx) => {
      const lignes = await tx
        .insert(oauthAccounts)
        .values({ provider: 'discord', email: null, ...lien })
        .onConflictDoNothing()
        .returning({ userId: oauthAccounts.userId });
      if (lignes.length === 0) return false;
      await appendEvent(tx, ctx, {
        type: 'identity.oauth_account_imported',
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'user', id: lien.userId },
        payload: { provider: 'discord', source: 'firebase' },
        visibility: 'owner',
      });
      return true;
    });
    if (insere) {
      rapport.importes++;
      continue;
    }
    const [existant] = await db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, 'discord'),
          eq(oauthAccounts.providerAccountId, lien.providerAccountId),
        ),
      )
      .limit(1);
    if (existant?.userId === lien.userId) rapport.dejaImportes++;
    else rapport.conflits++;
  }
  return rapport;
}
