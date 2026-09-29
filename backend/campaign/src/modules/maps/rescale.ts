/**
 * Mise à l'échelle de toute une carte (le MJ a changé de fond et ses dimensions ont
 * changé) : `x × sx`, `y × sy` pour chaque position et chaque géométrie, et les longueurs
 * (rayons, tailles de token, épaisseurs, polices) × √(sx·sy), bornées par les contraintes
 * des tables. Tout dans la transaction de l'appelant ; chaque ligne touchée prend une
 * version de plus. Les points d'arrivée des portails qui visent cette carte suivent.
 */
import type { RescaleMap } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db/outbox.js';
import { maps } from '../../db/schema.js';
import type { MapRow } from './common.js';

export async function rescaleMap(tx: Tx, map: MapRow, { sx, sy }: RescaleMap): Promise<MapRow> {
  const id = map.id;
  const x = sql`${sx}::float8`;
  const y = sql`${sy}::float8`;
  const s = sql`${Math.sqrt(sx * sy)}::float8`;
  const scaled = (column: string) => sql`ST_Scale(${sql.raw(column)}, ${x}, ${y})`;
  const bump = sql`version = version + 1, updated_at = now()`;

  await tx.execute(sql`
    UPDATE campaign.map_tokens
       SET pos = ${scaled('pos')},
           scale = least(scale * ${s}, 100),
           vision_radius = least(vision_radius * ${s}, 100000),
           audio = CASE WHEN jsonb_typeof(audio -> 'radius') = 'number'
                        THEN jsonb_set(audio, '{radius}', to_jsonb(least((audio ->> 'radius')::float8 * ${s}, 100000)))
                        ELSE audio END,
           ${bump}
     WHERE map_id = ${id}`);
  await tx.execute(sql`
    UPDATE campaign.map_objects
       SET pos = ${scaled('pos')}, width = width * ${x}, height = height * ${y},
           search_radius = least(search_radius * ${s}, 10000), ${bump}
     WHERE map_id = ${id}`);
  await tx.execute(sql`
    UPDATE campaign.map_lights SET pos = ${scaled('pos')}, radius = radius * ${s}, ${bump}
     WHERE map_id = ${id}`);
  for (const table of ['map_obstacles', 'map_rooms', 'map_measurements'])
    await tx.execute(sql`
      UPDATE ${sql.raw(`campaign.${table}`)} SET geom = ${scaled('geom')}, ${bump}
       WHERE map_id = ${id}`);
  await tx.execute(sql`
    UPDATE campaign.map_drawings
       SET geom = ${scaled('geom')}, width = least(width * ${s}, 1000), ${bump}
     WHERE map_id = ${id}`);
  await tx.execute(sql`
    UPDATE campaign.map_fog_zones
       SET center = ${scaled('center')},
           radius = radius * ${s},
           geom = CASE WHEN shape = 'circle'
                       THEN ST_Buffer(${scaled('center')}, radius * ${s}, 'quad_segs=16')
                       ELSE ${scaled('geom')} END,
           ${bump}
     WHERE map_id = ${id}`);
  await tx.execute(sql`
    UPDATE campaign.map_notes
       SET pos = ${scaled('pos')}, font_size = least(font_size * ${s}, 1000), ${bump}
     WHERE map_id = ${id}`);
  for (const table of ['map_music_zones', 'map_portals'])
    await tx.execute(sql`
      UPDATE ${sql.raw(`campaign.${table}`)}
         SET pos = ${scaled('pos')}, radius = radius * ${s}, ${bump}
       WHERE map_id = ${id}`);
  // Arrivées sur cette carte : portails d'autres cartes qui la visent, et téléportations
  await tx.execute(sql`
    UPDATE campaign.map_portals SET target = ${scaled('target')}, ${bump}
     WHERE target IS NOT NULL
       AND (target_map_id = ${id} OR (map_id = ${id} AND target_map_id IS NULL))`);

  const size = (v: number | null, f: number) =>
    v == null ? null : Math.min(100_000, Math.max(1, Math.round(v * f)));
  const [after] = await tx
    .update(maps)
    .set({
      width: size(map.width, sx),
      height: size(map.height, sy),
      spawn: map.spawn ? { x: map.spawn.x * sx, y: map.spawn.y * sy } : null,
      // Quadrillages : la case suit le fond (longueur × √(sx·sy)), l'origine aussi
      grids: map.grids.map((g) => ({
        ...g,
        size: Math.min(10_000, Math.max(4, g.size * Math.sqrt(sx * sy))),
        offsetX: g.offsetX * sx,
        offsetY: g.offsetY * sy,
      })),
      version: sql`${maps.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(maps.id, id))
    .returning();
  return after!;
}
