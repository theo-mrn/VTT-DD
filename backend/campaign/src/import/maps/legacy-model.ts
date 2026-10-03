/**
 * Conversions de l'ancienne carte vers le modèle de la refonte, les mêmes que le changeset
 * 0017-map-visibility.sql applique aux données déjà importées :
 *  - mur à sens unique : `direction` (nord, sud, est, ouest) → `blocksFrom` relatif au tracé ;
 *  - contenu d'un objet (`LootItem`) → `MapObjectItem` typé ;
 *  - brouillard par cases (`map_fog`) → zones (`map_fog_zones`) et `maps.fog_full`.
 */
import type { MapBlocksFrom, MapObjectItem } from '@vtt/contracts';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/outbox.js';
import type { MapPoint } from '../../db/schema.js';

/**
 * Ancienne règle (legacy lib/visibility.ts) : la normale du premier segment, orientée vers
 * `direction` (nord par défaut), désigne le côté d'où la vue est bloquée. Côté gauche du
 * tracé a→b : cross(b − a, p − a) < 0, soit l'opposé de la normale (−dy, dx).
 */
export function blocksFromDirection(points: MapPoint[], direction: string | null): MapBlocksFrom {
  const [a, b] = points;
  const dx = (b?.x ?? 0) - (a?.x ?? 0);
  const dy = (b?.y ?? 0) - (a?.y ?? 0);
  const aligns: Partial<Record<string, number>> = { south: dx, east: -dy, west: dy };
  const align = aligns[direction ?? ''] ?? -dx;
  return align >= 0 ? 'right' : 'left';
}

const MEDIA = /^(https:\/\/\S+|\/[^/]\S*)$/;

/** Contenu legacy d'un objet → contenu typé ; les autres champs restent dans `legacy`. */
export function legacyItems(raw: unknown): MapObjectItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i): MapObjectItem => {
    const ord = i + 1;
    if (!it || typeof it !== 'object' || Array.isArray(it))
      return { id: `item-${ord}`, name: String(it).slice(0, 200) || 'Objet', quantity: 1 };
    const { id, name, quantity, description, image, ...rest } = it as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const q = Number(quantity);
    const imageOk = typeof image === 'string' && MEDIA.test(image) && image.length <= 2048;
    const legacy = { ...rest, ...(image !== undefined && !imageOk ? { image } : {}) };
    return {
      id: (text(id) ?? `item-${ord}`).slice(0, 100),
      name: (text(name) ?? 'Objet').slice(0, 200),
      quantity: Number.isFinite(q) && q >= 1 ? Math.min(1_000_000, Math.round(q)) : 1,
      ...(imageOk ? { imageUrl: image } : {}),
      ...(typeof description === 'string' && description
        ? { description: description.slice(0, 10_000) }
        : {}),
      ...(Object.keys(legacy).length ? { legacy } : {}),
    };
  });
}

/**
 * Brouillard par cases des cartes données converti en zones (union des cases ; trous en
 * zones du mode inverse), si elles n'ont pas encore de zones. Même requête que le changeset.
 */
export async function convertLegacyFog(tx: Tx, mapIds: string[]) {
  if (!mapIds.length) return;
  const ids = sql`${`{${mapIds.join(',')}}`}::uuid[]`;
  await tx.execute(sql`
    UPDATE campaign.maps m SET fog_full = true
      FROM campaign.map_fog f
     WHERE f.map_id = m.id AND f.full_map AND m.id = ANY(${ids})`);
  await tx.execute(sql`
    WITH cells AS (
      SELECT f.map_id, f.campaign_id, f.full_map, c.owner_id,
             greatest(coalesce(round(least(m.width, m.height) / 20.0), 100), 1)::float8 AS size,
             split_part(trim(cell), ',', 1)::bigint AS cx,
             split_part(trim(cell), ',', 2)::bigint AS cy
        FROM campaign.map_fog f
        JOIN campaign.maps m ON m.id = f.map_id
        JOIN campaign.campaigns c ON c.id = f.campaign_id
        CROSS JOIN LATERAL unnest(f.cells) AS cell
       WHERE f.map_id = ANY(${ids})
         AND NOT EXISTS (SELECT 1 FROM campaign.map_fog_zones z WHERE z.map_id = f.map_id)
         AND trim(cell) ~ '^-?[0-9]{1,7},-?[0-9]{1,7}$'
    ),
    merged AS (
      SELECT map_id, campaign_id, full_map, owner_id,
             ST_SimplifyPreserveTopology(
               ST_Union(ST_MakeEnvelope(cx * size, cy * size, (cx + 1) * size, (cy + 1) * size, 0)),
               0) AS g
        FROM cells
       GROUP BY map_id, campaign_id, full_map, owner_id
    ),
    parts AS (
      SELECT map_id, campaign_id, full_map, owner_id, (ST_Dump(g)).geom AS poly FROM merged
    ),
    rings AS (
      SELECT map_id, campaign_id, owner_id,
             ST_Area(ST_MakePolygon(ST_ExteriorRing(poly))) AS outer_area, 0 AS ring,
             ST_MakePolygon(ST_ExteriorRing(poly)) AS geom,
             CASE WHEN full_map THEN 'clear' ELSE 'fog' END AS mode
        FROM parts
      UNION ALL
      SELECT map_id, campaign_id, owner_id,
             ST_Area(ST_MakePolygon(ST_ExteriorRing(poly))), n,
             ST_MakePolygon(ST_InteriorRingN(poly, n)),
             CASE WHEN full_map THEN 'fog' ELSE 'clear' END
        FROM parts
        CROSS JOIN LATERAL generate_series(1, ST_NumInteriorRings(poly)) AS n
    )
    INSERT INTO campaign.map_fog_zones (id, campaign_id, map_id, shape, mode, geom, created_by)
    SELECT gen_random_uuid(), campaign_id, map_id, 'polygon', mode, geom, owner_id
      FROM rings
     ORDER BY map_id, outer_area DESC, ring`);
}
