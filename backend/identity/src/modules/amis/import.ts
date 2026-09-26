import type { Db } from '../../db/client.js';
import type { EventContext } from '../../db/outbox.js';
import type { DocFirestore } from '../titres/import.js';

/**
 * Importe les amitiés (friendships/{uid}/friends/{amiUid}) et les demandes en
 * attente (requests/{uid}/received/{deUid}, requests/{uid}/sent/{versUid}). Rejouable.
 * (Contrat figé : implémenté par le module amis, appelé par import/cli.ts.)
 */
export async function importerAmis(
  _db: Db,
  _ctx: EventContext,
  _entrees: {
    amities: DocFirestore[];
    demandes: DocFirestore[];
    uuidParUid: ReadonlyMap<string, string>;
  },
): Promise<Record<string, number>> {
  return {};
}
