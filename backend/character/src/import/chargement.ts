/**
 * Écriture des personnages migrés dans la base du service. Rejouable : un
 * personnage déjà importé (même chemin legacy dans `legacy_ids`) est ignoré.
 * Chaque personnage est écrit dans sa propre transaction avec son événement
 * `character.created`.
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import { characters, legacyIds } from '../db/schema.js';
import type { PersonnageMigre } from './transformer.js';

export const SOURCE_LEGACY = 'firebase';

export type ResultatChargement =
  { statut: 'importe'; id: string } | { statut: 'deja-importe'; id: string };

export async function chargerPersonnage(
  db: Db,
  migre: PersonnageMigre,
  legacyId: string,
  ownerId: string,
  correlationId: string,
): Promise<ResultatChargement> {
  const [existant] = await db
    .select({ id: legacyIds.characterId })
    .from(legacyIds)
    .where(and(eq(legacyIds.source, SOURCE_LEGACY), eq(legacyIds.legacyId, legacyId)));
  if (existant) return { statut: 'deja-importe', id: existant.id };

  const id = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(characters).values({
      id,
      ownerId,
      nom: migre.nom,
      avatarUrl: migre.avatarUrl,
      systemId: migre.etat.systeme.id,
      systemVersion: migre.etat.systeme.version,
      type: migre.etat.type,
      etat: migre.etat,
    });
    await tx.insert(legacyIds).values({ source: SOURCE_LEGACY, legacyId, characterId: id });
    await appendEvent(
      tx,
      { correlationId },
      {
        type: 'character.created',
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'character', id },
        payload: {
          version: 1,
          nom: migre.nom,
          systeme: migre.etat.systeme,
          type: migre.etat.type,
          importe: true,
        },
      },
    );
  });
  return { statut: 'importe', id };
}
