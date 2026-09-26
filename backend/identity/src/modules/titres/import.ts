import type { Db } from '../../db/client.js';
import type { EventContext } from '../../db/outbox.js';

export interface DocFirestore {
  path: string;
  id: string;
  data: Record<string, unknown>;
}

/**
 * Importe le catalogue des titres (collection Firestore `titles`) et les titres
 * débloqués (champ `titles` des documents users/{uid}). Rejouable.
 * (Contrat figé : implémenté par le module titres, appelé par import/cli.ts.)
 */
export async function importerTitres(
  _db: Db,
  _ctx: EventContext,
  _entrees: {
    catalogue: DocFirestore[];
    profils: ReadonlyMap<string, Record<string, unknown>>;
    uuidParUid: ReadonlyMap<string, string>;
  },
): Promise<Record<string, number>> {
  return {};
}
