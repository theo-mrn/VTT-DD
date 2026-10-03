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
import { convertLegacyFog } from './legacy-model.js';
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

const rowsOf = (m: MigratedMaps, name: TableName): Record<string, unknown>[] => {
  if (name !== 'settings') return m[name] as Record<string, unknown>[];
  return m.settings ? [m.settings] : [];
};

/** Clé primaire d'une ligne (map_fog : la carte ; map_settings : la campagne). */
const KEY_COLUMN: Partial<Record<TableName, string>> = { fog: 'mapId', settings: 'campaignId' };
const keyOf = (name: TableName, row: Record<string, unknown>) =>
  row[KEY_COLUMN[name] ?? 'id'] as string;

const pkOf = (name: TableName) => {
  const table = TABLES.find(([n]) => n === name)![1];
  if (name === 'fog') return (table as typeof mapFog).mapId;
  if (name === 'settings') return (table as typeof mapSettings).campaignId;
  return (table as typeof maps).id;
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
    // Brouillard par cases de l'ancienne carte : converti en zones (0017-map-visibility.sql)
    await convertLegacyFog(
      tx,
      m.fog.map((f) => f.mapId as string),
    );
    // Portails jumeaux de l'ancienne app : reliés en aller-retour (0022-map-portals-use.sql)
    await linkLegacyPortalPairs(tx, campaignId);
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

/**
 * Paires jumelles de l'ancienne app (deux portails `same_map` de la même carte dont chacun
 * arrive sur l'autre, à un demi-pixel près) reliées en aller-retour, comme la migration 0022.
 * Un portail pris dans plusieurs paires reste seul (ambigu) ; un portail déjà relié est gardé.
 */
export async function linkLegacyPortalPairs(tx: Tx, campaignId: string) {
  await tx.execute(sql`
    WITH pairs AS (
      SELECT a.id AS a, b.id AS b
      FROM campaign.map_portals a
      JOIN campaign.map_portals b
        ON b.map_id = a.map_id AND b.id > a.id
       AND a.kind = 'same_map' AND b.kind = 'same_map'
       AND a.linked_portal_id IS NULL AND b.linked_portal_id IS NULL
       AND a.target IS NOT NULL AND b.target IS NOT NULL
       AND ST_DWithin(a.target, b.pos, 0.5) AND ST_DWithin(b.target, a.pos, 0.5)
      WHERE a.campaign_id = ${campaignId}
    ),
    single AS (
      SELECT p.a, p.b FROM pairs p
      WHERE (SELECT count(*) FROM pairs q WHERE q.a IN (p.a, p.b) OR q.b IN (p.a, p.b)) = 1
    )
    UPDATE campaign.map_portals m
       SET linked_portal_id = CASE WHEN m.id = s.a THEN s.b ELSE s.a END
      FROM single s
     WHERE m.id IN (s.a, s.b)`);
}
