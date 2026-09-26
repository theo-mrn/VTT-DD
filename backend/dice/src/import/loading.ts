/**
 * Rattachement des jets et préférences importés aux comptes (identity), aux
 * campagnes (campaign) et aux personnages (character) déjà migrés, puis
 * chargement en base. Rejouable : un jet déjà importé (legacy_ids) est ignoré,
 * des préférences déjà présentes ne sont jamais écrasées (seul l'accès à tous
 * les skins d'un premium leur est ajouté).
 *
 * Les jets importés ne produisent pas d'événement : ils sont déjà de
 * l'historique (l'ancien journal est importé à part par le service history).
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { inventory, legacyIds, preferences, rolls } from '../db/schema.js';
import { DEFAULT_SKIN } from '../skins/catalog.js';
import type { ImportedPreferences, ImportedRoll } from './transform.js';

export const LEGACY_SOURCE = 'firebase';

export interface Mappings {
  /** UID Firebase → compte identity. */
  accounts: ReadonlyMap<string, string>;
  /** Code de campagne (`Salle/{code}`) → campagne importée. */
  campaigns: ReadonlyMap<string, string>;
  /** `cartes/{code}/characters/{id}` → personnage importé. */
  characters: ReadonlyMap<string, string>;
  /**
   * Nom affiché dans une campagne → UID (`salles/{code}/Noms/{uid}.nom`),
   * pour les anciens jets sans `uid`. Clé : `${code}\u0000${nom}` ; un nom
   * porté par plusieurs membres n'y figure pas.
   */
  names: ReadonlyMap<string, string>;
}

export type NewRollRow = typeof rolls.$inferInsert;

export type PreparedRoll =
  | { status: 'ready'; row: NewRollRow; authorFound: boolean; characterFound: boolean }
  | { status: 'no-campaign' };

/** Clé de `Mappings.names`. */
export const nameKey = (code: string, name: string) => `${code}\u0000${name}`;

export function prepareRoll(r: ImportedRoll, maps: Mappings): PreparedRoll {
  const campaignId = maps.campaigns.get(r.campaignCode);
  if (!campaignId) return { status: 'no-campaign' };
  const uid = r.uid ?? maps.names.get(nameKey(r.campaignCode, r.userName));
  const authorId = uid ? (maps.accounts.get(uid) ?? null) : null;
  const characterId = r.persoId
    ? (maps.characters.get(`cartes/${r.campaignCode}/characters/${r.persoId}`) ?? null)
    : null;
  return {
    status: 'ready',
    authorFound: !!authorId,
    characterFound: !r.persoId || !!characterId,
    row: {
      // UUIDv7 à la date du jet : l'historique importé reste dans l'ordre chronologique
      id: uuidv7(r.createdAt.getTime()),
      campaignId,
      authorId,
      authorName: r.userName,
      authorAvatarUrl: r.userAvatar,
      characterId,
      source: 'import',
      notation: r.notation,
      visibility: r.visibility,
      dice: r.dice,
      symbols: r.symbols,
      diceCount: r.diceCount,
      diceFaces: r.diceFaces,
      total: r.total,
      output: r.output,
      symbolResult: r.symbolResult,
      legacyType: r.legacyType,
      outcome: r.outcome,
      explanations: [],
      createdAt: r.createdAt,
    },
  };
}

/** Anciens identifiants déjà importés parmi `ids`. */
export async function alreadyImported(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const found = await db
    .select({ legacyId: legacyIds.legacyId })
    .from(legacyIds)
    .where(and(eq(legacyIds.source, LEGACY_SOURCE), inArray(legacyIds.legacyId, ids)));
  return new Set(found.map((x) => x.legacyId));
}

/**
 * Charge un lot de jets en une transaction. Un jet importé entre-temps par un
 * autre import (conflit sur legacy_ids) est retiré : jamais de doublon.
 * Renvoie le nombre de jets importés.
 */
export async function loadRolls(
  db: Db,
  batch: { legacyId: string; row: NewRollRow }[],
): Promise<number> {
  if (!batch.length) return 0;
  return db.transaction(async (tx) => {
    await tx.insert(rolls).values(batch.map((b) => b.row));
    const kept = await tx
      .insert(legacyIds)
      .values(
        batch.map((b) => ({ source: LEGACY_SOURCE, legacyId: b.legacyId, rollId: b.row.id! })),
      )
      .onConflictDoNothing()
      .returning({ rollId: legacyIds.rollId });
    const keptIds = new Set(kept.map((k) => k.rollId));
    const duplicates = batch.map((b) => b.row.id!).filter((id) => !keptIds.has(id));
    if (duplicates.length) await tx.delete(rolls).where(inArray(rolls.id, duplicates));
    return keptIds.size;
  });
}

/**
 * Préférences, inventaire et accès à tous les skins d'un compte. Des
 * préférences déjà présentes (choisies dans la nouvelle app, ou import
 * précédent) ne sont pas écrasées ; l'inventaire ne fait que s'enrichir ;
 * l'accès à tous les skins d'un premium est accordé, jamais retiré.
 * `allSkins` : accès accordé par cet appel.
 */
export async function loadPreferences(
  db: Db,
  userId: string,
  p: ImportedPreferences,
): Promise<{ preferences: boolean; allSkins: boolean; skins: number }> {
  return db.transaction(async (tx) => {
    let written = false;
    if (p.skinId || p.allSkins) {
      const r = await tx
        .insert(preferences)
        .values({ userId, skinId: p.skinId ?? DEFAULT_SKIN, allSkins: p.allSkins })
        .onConflictDoNothing()
        .returning({ userId: preferences.userId });
      written = r.length > 0;
    }
    let allSkins = written && p.allSkins;
    if (p.allSkins && !written) {
      // Préférences déjà présentes : seul l'accès est ajouté
      const r = await tx
        .update(preferences)
        .set({ allSkins: true, updatedAt: sql`now()` })
        .where(and(eq(preferences.userId, userId), eq(preferences.allSkins, false)))
        .returning({ userId: preferences.userId });
      allSkins = r.length > 0;
    }
    let skins = 0;
    if (p.inventory.length) {
      const r = await tx
        .insert(inventory)
        .values(p.inventory.map((skinId) => ({ userId, skinId, source: 'import' as const })))
        .onConflictDoNothing()
        .returning({ skinId: inventory.skinId });
      skins = r.length;
    }
    return { preferences: written, allSkins, skins };
  });
}
