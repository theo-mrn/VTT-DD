/**
 * Partitions mensuelles de history.events, créées à l'avance par la fonction
 * SQL history.ensure_partitions (SECURITY DEFINER : le rôle du service n'a
 * pas le droit CREATE). Appelée au démarrage puis chaque jour, et par
 * l'import pour les mois de l'ancien Historique. Un événement hors des
 * partitions existantes n'est jamais refusé : il va dans events_default.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/** Crée les partitions manquantes de `months` mois à partir du mois de `from` ; renvoie leur nombre. */
export async function ensurePartitions(db: Db, from: Date, months: number): Promise<number> {
  const day = from.toISOString().slice(0, 10);
  const r = await db.execute<{ created: number }>(
    sql`select history.ensure_partitions(${day}::date, ${months}::int) as created`,
  );
  return Number(r.rows[0]?.created ?? 0);
}

/** Nombre de mois entre le mois de `from` et celui de `to`, bornes comprises. */
export function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1
  );
}
