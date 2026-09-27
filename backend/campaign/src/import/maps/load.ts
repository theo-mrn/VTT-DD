/**
 * Écriture de la carte migrée d'une campagne, dans une transaction, avec un
 * événement `map.imported` (acteur système, MJ seulement) si quelque chose a
 * été écrit. Rejouable : chaque ligne a un identifiant stable et les
 * conflits sont ignorés (`ON CONFLICT DO NOTHING`), y compris un token dont
 * le personnage est déjà présent sur une autre carte.
 */
import { inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type Tx } from '../../db/outbox.js';
import {
  mapDrawings,
  mapFog,
  mapGroups,
  mapLights,
  mapMeasurements,
  mapMusicZones,
  mapNotes,
  mapObjects,
  mapObstacles,
  mapPortals,
  maps,
  mapSettings,
  mapTokens,
} from '../../db/schema.js';
import type { MigratedMaps } from './transform.js';

/** Tables dans l'ordre d'écriture (clés étrangères : dossiers, cartes, puis le reste). */
export const TABLES = [
  ['groups', mapGroups],
  ['maps', maps],
  ['settings', mapSettings],
  ['fog', mapFog],
  ['tokens', mapTokens],
  ['objects', mapObjects],
  ['lights', mapLights],
  ['obstacles', mapObstacles],
  ['drawings', mapDrawings],
  ['notes', mapNotes],
  ['musicZones', mapMusicZones],
  ['portals', mapPortals],
  ['measurements', mapMeasurements],
] as const;

export type TableName = (typeof TABLES)[number][0];
export type Counts = Record<TableName, number>;

const rowsOf = (m: MigratedMaps, name: TableName): Record<string, unknown>[] =>
  name === 'settings' ? (m.settings ? [m.settings] : []) : (m[name] as Record<string, unknown>[]);

/** Clé primaire d'une ligne (map_fog : la carte ; map_settings : la campagne). */
const keyOf = (name: TableName, row: Record<string, unknown>) =>
  (name === 'fog' ? row.mapId : name === 'settings' ? row.campaignId : row.id) as string;

const pkOf = (name: TableName) => {
  const table = TABLES.find(([n]) => n === name)![1];
  return name === 'fog'
    ? (table as typeof mapFog).mapId
    : name === 'settings'
      ? (table as typeof mapSettings).campaignId
      : (table as typeof maps).id;
};

export const emptyCounts = (): Counts => Object.fromEntries(TABLES.map(([n]) => [n, 0])) as Counts;

/** Lignes produites par table. */
export const produced = (m: MigratedMaps): Counts =>
  Object.fromEntries(TABLES.map(([n]) => [n, rowsOf(m, n).length])) as Counts;

/** Lignes déjà en base (import précédent), par table : pour la simulation. */
export async function existing(db: Db, m: MigratedMaps): Promise<Counts> {
  const out = emptyCounts();
  for (const [name, table] of TABLES) {
    const keys = rowsOf(m, name).map((r) => keyOf(name, r));
    if (!keys.length) continue;
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(table)
      .where(inArray(pkOf(name), keys));
    out[name] = row?.n ?? 0;
  }
  return out;
}

const BATCH = 200;

async function insertAll(tx: Tx, name: TableName, rows: Record<string, unknown>[]) {
  const table = TABLES.find(([n]) => n === name)![1];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const done = await tx
      .insert(table)
      .values(rows.slice(i, i + BATCH) as never)
      .onConflictDoNothing()
      .returning({ key: pkOf(name) });
    inserted += done.length;
  }
  return inserted;
}

/** Écrit la carte d'une campagne ; renvoie les lignes réellement insérées. */
export async function loadMaps(
  db: Db,
  campaignId: string,
  m: MigratedMaps,
  correlationId: string,
): Promise<Counts> {
  return db.transaction(async (tx) => {
    const counts = emptyCounts();
    for (const [name] of TABLES) counts[name] = await insertAll(tx, name, rowsOf(m, name));
    if (Object.values(counts).some((n) => n > 0))
      await appendEvent(
        tx,
        { correlationId },
        {
          type: 'map.imported',
          campaignId,
          actor: { userId: null, role: 'system', characterId: null },
          aggregate: { type: 'campaign', id: campaignId },
          payload: { counts },
          visibility: 'gm_only',
        },
      );
    return counts;
  });
}
