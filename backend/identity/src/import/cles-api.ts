/**
 * Import des clés d'API de l'ancienne app (collection Firestore `apiKeys`).
 *
 * Document apiKeys/{keyId} : { uid, keyHash, label, createdAt, lastUsed }, où
 * keyHash est le SHA-256 hexadécimal de la clé brute (« vtt_ » + 64 caractères
 * hexadécimaux, voir legacy/src/app/api/api-keys/route.ts). Le même SHA-256
 * est stocké ici en binaire : les clés existantes continuent de fonctionner.
 * La clé brute n'ayant jamais été stockée, son préfixe est inconnu (« vtt_… »).
 *
 * Rejouable : une clé dont l'empreinte existe déjà est ignorée.
 */
import { uuidv7 } from '@vtt/contracts';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { apiKeys } from '../db/schema.js';
import type { DocFirestore } from '../modules/titres/import.js';
import { dateFirestore } from './ndjson.js';

export const PREFIXE_INCONNU = 'vtt_…';
const NOM_MAX = 64;

export interface CleImportee {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: Buffer;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface RapportTransformationCles {
  lues: number;
  valides: number;
  /** uid Firebase absent de legacy_ids (compte non importé). */
  sansCompte: number;
  /** Empreinte absente ou mal formée, uid manquant. */
  invalides: number;
  /** Même empreinte sur plusieurs documents : la première est gardée. */
  doublons: number;
}

function nomDe(data: Record<string, unknown>): string {
  for (const v of [data.name, data.label]) {
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, NOM_MAX);
  }
  return 'Clé importée';
}

/** Transformation pure : documents apiKeys -> lignes de identity.api_keys. */
export function transformerClesApi(
  docs: readonly DocFirestore[],
  uuidParUid: ReadonlyMap<string, string>,
  now: Date = new Date(),
): { cles: CleImportee[]; rapport: RapportTransformationCles } {
  const rapport: RapportTransformationCles = {
    lues: 0,
    valides: 0,
    sansCompte: 0,
    invalides: 0,
    doublons: 0,
  };
  const cles: CleImportee[] = [];
  const vues = new Set<string>();

  for (const doc of docs) {
    // Uniquement les documents racine apiKeys/{id}
    if (doc.path.split('/').length > 2) continue;
    rapport.lues++;
    const { uid, keyHash } = doc.data;
    if (
      typeof uid !== 'string' ||
      typeof keyHash !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(keyHash)
    ) {
      rapport.invalides++;
      continue;
    }
    const userId = uuidParUid.get(uid);
    if (!userId) {
      rapport.sansCompte++;
      continue;
    }
    const empreinte = keyHash.toLowerCase();
    if (vues.has(empreinte)) {
      rapport.doublons++;
      continue;
    }
    vues.add(empreinte);

    const createdAt = dateFirestore(doc.data.createdAt) ?? now;
    cles.push({
      id: uuidv7(createdAt.getTime()),
      userId,
      name: nomDe(doc.data),
      prefix: PREFIXE_INCONNU,
      keyHash: Buffer.from(empreinte, 'hex'),
      createdAt,
      lastUsedAt: dateFirestore(doc.data.lastUsed ?? doc.data.lastUsedAt),
    });
    rapport.valides++;
  }
  return { cles, rapport };
}

export interface RapportChargementCles {
  importees: number;
  dejaImportees: number;
}

export async function chargerClesApi(
  db: Db,
  ctx: EventContext,
  cles: readonly CleImportee[],
): Promise<RapportChargementCles> {
  const rapport: RapportChargementCles = { importees: 0, dejaImportees: 0 };
  for (const cle of cles) {
    const inseree = await db.transaction(async (tx) => {
      const lignes = await tx
        .insert(apiKeys)
        .values(cle)
        .onConflictDoNothing()
        .returning({ id: apiKeys.id });
      if (lignes.length === 0) return false;
      await appendEvent(tx, ctx, {
        type: 'identity.api_key_imported',
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'user', id: cle.userId },
        payload: { keyId: cle.id, source: 'firebase' },
        visibility: 'owner',
      });
      return true;
    });
    if (inseree) rapport.importees++;
    else rapport.dejaImportees++;
  }
  return rapport;
}
