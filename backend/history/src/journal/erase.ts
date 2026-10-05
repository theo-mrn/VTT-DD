/**
 * Effacement (docs/legal.md), seule exception au journal en ajout seul, par les fonctions
 * SECURITY DEFINER de 0002-erasure : une campagne supprimée emporte sa chaîne ; un compte
 * supprimé, ses événements sans campagne, et son pseudo devient « Joueur supprimé » dans ceux
 * des campagnes (chaînes recalculées). Appelé par le consommateur après l'ajout de l'événement
 * lui-même : rejoué, l'effacement ne trouve plus rien à faire.
 */
import { CAMPAIGN_DELETED, USER_DELETED, type EventEnvelope } from '@vtt/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/** Efface ce que l'événement demande ; renvoie le nombre de lignes touchées, null sinon. */
export async function eraseFor(
  db: Db,
  event: Pick<EventEnvelope, 'type' | 'roomId' | 'aggregate'>,
): Promise<number | null> {
  if (event.type === USER_DELETED) {
    const r = await db.execute<{ n: string }>(
      sql`select history.erase_user(${event.aggregate.id}::uuid) as n`,
    );
    return Number(r.rows[0]?.n ?? 0);
  }
  if (event.type === CAMPAIGN_DELETED) {
    const campaignId = event.roomId ?? event.aggregate.id;
    const r = await db.execute<{ n: string }>(
      sql`select history.erase_campaign(${campaignId}::uuid) as n`,
    );
    return Number(r.rows[0]?.n ?? 0);
  }
  return null;
}
