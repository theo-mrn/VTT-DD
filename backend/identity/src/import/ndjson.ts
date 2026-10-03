/**
 * Lecture des exports Firestore de tools/firebase-export : une ligne JSON par
 * document, {"path": "users/abc", "id": "abc", "data": {...}}, les types
 * Firestore étant balisés ({"$timestamp": "…"}, voir normaliser.ts).
 */
import { readFile } from 'node:fs/promises';
import type { DocFirestore } from '../modules/titres/import.js';

/** Analyse le contenu d'un fichier NDJSON ; `source` sert aux messages d'erreur. */
export function analyserNdjson(contenu: string, source: string): DocFirestore[] {
  const docs: DocFirestore[] = [];
  for (const [i, ligne] of contenu.split('\n').entries()) {
    if (!ligne.trim()) continue;
    let valeur: unknown;
    try {
      valeur = JSON.parse(ligne);
    } catch {
      throw new Error(`${source}:${i + 1} : JSON invalide`);
    }
    const { path, id, data } = (valeur ?? {}) as { path?: unknown; id?: unknown; data?: unknown };
    if (
      typeof id !== 'string' ||
      typeof data !== 'object' ||
      data === null ||
      Array.isArray(data) ||
      (path !== undefined && typeof path !== 'string')
    ) {
      throw new Error(
        `${source}:${i + 1} : {"path": string, "id": string, "data": object} attendu`,
      );
    }
    docs.push({ path: path ?? id, id, data: data as Record<string, unknown> });
  }
  return docs;
}

export async function lireNdjson(fichier: string): Promise<DocFirestore[]> {
  return analyserNdjson(await readFile(fichier, 'utf8'), fichier);
}

/**
 * Date d'une valeur Firestore exportée : {"$timestamp": ISO}, chaîne ISO ou
 * millisecondes. Null si absente ou illisible.
 */
export function dateFirestore(v: unknown): Date | null {
  let brut: unknown = v;
  if (brut && typeof brut === 'object' && '$timestamp' in brut) {
    brut = (brut as { $timestamp: unknown }).$timestamp;
  }
  if (typeof brut === 'string') {
    // Date ne garde que les millisecondes : les nanosecondes sont tronquées
    const d = new Date(brut.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof brut === 'number' && Number.isFinite(brut) && brut > 0) return new Date(brut);
  return null;
}
