/**
 * Chargement des comptes transformés dans identity.
 *
 * - Rejouable : un compte dont l'uid Firebase est déjà dans legacy_ids est ignoré.
 * - Un compte = une transaction : une erreur isolée n'interrompt pas l'import.
 * - Un conflit (e-mail ou compte Google déjà pris sur la nouvelle plateforme)
 *   n'écrase jamais rien : il est signalé pour une résolution manuelle.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { credentials, legacyIds, oauthAccounts, profiles, users } from '../db/schema.js';
import type { ImportedAccount } from './firebase.js';

export const LEGACY_KIND = 'firebase_uid';

export interface LoadReport {
  importes: number;
  dejaImportes: number;
  conflits: { legacyUid: string; raison: string }[];
}

function contrainteViolee(err: unknown): string | null {
  const e = (err as { cause?: unknown })?.cause ?? err;
  if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
    return (e as { constraint?: string }).constraint ?? 'unicité';
  }
  return null;
}

export async function loadImportedAccounts(
  db: Db,
  ctx: EventContext,
  comptes: readonly ImportedAccount[],
): Promise<LoadReport> {
  const rapport: LoadReport = { importes: 0, dejaImportes: 0, conflits: [] };

  for (const c of comptes) {
    const [deja] = await db
      .select({ id: legacyIds.id })
      .from(legacyIds)
      .where(and(eq(legacyIds.kind, LEGACY_KIND), eq(legacyIds.legacyId, c.legacyUid)))
      .limit(1);
    if (deja) {
      rapport.dejaImportes++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values(c.user);
        await tx.insert(profiles).values({ userId: c.user.id, ...c.profile });
        if (c.password) {
          await tx.insert(credentials).values({
            userId: c.user.id,
            algorithm: c.password.algorithm,
            hash: c.password.hash,
            salt: c.password.algorithm === 'firebase-scrypt' ? c.password.salt : null,
          });
        }
        for (const o of c.oauth) {
          await tx.insert(oauthAccounts).values({ userId: c.user.id, ...o });
        }
        await tx
          .insert(legacyIds)
          .values({ kind: LEGACY_KIND, legacyId: c.legacyUid, id: c.user.id });
        await appendEvent(tx, ctx, {
          type: 'identity.user_imported',
          actor: { userId: null, role: 'system', characterId: null },
          aggregate: { type: 'user', id: c.user.id },
          payload: {
            source: 'firebase',
            password: c.password ? 'firebase-scrypt' : null,
            providers: c.oauth.map((o) => o.provider),
          },
        });
      });
      rapport.importes++;
    } catch (err) {
      const contrainte = contrainteViolee(err);
      if (!contrainte) throw err;
      rapport.conflits.push({
        legacyUid: c.legacyUid,
        raison:
          contrainte === 'users_email_unique'
            ? 'e-mail déjà utilisé sur la nouvelle plateforme'
            : contrainte === 'oauth_accounts_pkey'
              ? 'compte Google déjà rattaché à un autre utilisateur'
              : `contrainte ${contrainte}`,
      });
    }
  }
  return rapport;
}

/** Correspondance uid Firebase -> UUID identity, depuis legacy_ids. */
export async function lireUuidParUid(db: Db): Promise<Map<string, string>> {
  const lignes = await db
    .select({ uid: legacyIds.legacyId, id: legacyIds.id })
    .from(legacyIds)
    .where(eq(legacyIds.kind, LEGACY_KIND));
  return new Map(lignes.map((l) => [l.uid, l.id]));
}
