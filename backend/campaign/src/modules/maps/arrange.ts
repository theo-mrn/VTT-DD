/**
 * Calques du MJ : ordre et calque des éléments (docs/carte.md § 5, Calques).
 *
 *   POST /v1/campaigns/:id/maps/:mapId/arrange   { items: [{ kind, id, layerId, z }] }
 *
 * Une sélection change de calque et d'ordre en une transaction, un événement
 * `<domaine>.updated` (et `.hidden` si l'élément passe dans un calque masqué) par
 * élément. MJ ; un joueur réordonne ses dessins et textes, vers un calque ni verrouillé
 * ni masqué, ou hors calque (annotation). Supprimer un calque fait descendre son
 * contenu par le même chemin (`moveLayerContent`).
 */
import { ArrangeMapItems, type MapArrangeKind, type MapArrangeResult } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { EventContext, Tx } from '../../db/outbox.js';
import { mapDrawings, mapLayers, mapNotes, mapObjects, mapTokens } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  checkLayer,
  loadMap,
  MapParams,
  requestContext,
  unknownLayer,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';
import { layerDef, updateItem, type LayerRow } from './layers.js';
import { tokenApi, updateToken } from './tokens.js';

type ArrangeItem = { kind: MapArrangeKind; id: string; layerId: string | null; z: number };

const LAYER_PATH = { object: 'objects', drawing: 'drawings', note: 'notes' } as const;
const RESULT_KEY = {
  token: 'tokens',
  object: 'objects',
  drawing: 'drawings',
  note: 'notes',
} as const;

const layerRequired = () =>
  new HttpError(422, 'Refusé', 'layer_required', 'Un token ou un objet appartient à un calque');

/** Change le calque et l'ordre d'éléments de la carte, dans l'ordre reçu. */
export async function arrangeItems(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: MapRow,
  items: ArrangeItem[],
): Promise<MapArrangeResult> {
  const out: MapArrangeResult = { tokens: [], objects: [], drawings: [], notes: [] };
  for (const item of items) {
    const patch = { layerId: item.layerId, z: item.z };
    if (item.kind === 'token') {
      if (item.layerId === null) throw layerRequired();
      out.tokens.push(tokenApi(await updateToken(tx, ctx, v, map.id, item.id, patch)));
      continue;
    }
    if (item.kind === 'object' && item.layerId === null) throw layerRequired();
    const def = layerDef(LAYER_PATH[item.kind]);
    const api = await updateItem(tx, ctx, def, v, map, item.id, patch);
    (out[RESULT_KEY[item.kind]] as unknown[]).push(api);
  }
  return out;
}

/**
 * Contenu d'un calque supprimé : dans `moveTo`, sinon le calque du dessous (celui du
 * dessus pour le plus bas), posé au-dessus de ce qui s'y trouve, ordre relatif gardé.
 * Le dernier calque d'une carte ne se supprime pas (409 `last_layer`).
 */
export async function moveLayerContent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: MapRow,
  layer: LayerRow,
  moveTo?: string,
) {
  const layers = await tx
    .select({ id: mapLayers.id })
    .from(mapLayers)
    .where(eq(mapLayers.mapId, map.id))
    .orderBy(asc(mapLayers.sortOrder), asc(mapLayers.id));
  if (layers.length <= 1)
    throw HttpError.conflict('Une carte garde au moins un calque', 'last_layer');
  const i = layers.findIndex((l) => l.id === layer.id);
  const target = moveTo
    ? layers.find((l) => l.id === moveTo && l.id !== layer.id)
    : (layers[i - 1] ?? layers[i + 1]);
  if (!target) throw unknownLayer();
  await checkLayer(tx, v, map.id, target.id);

  // Positions mémorisées (personnage sur une autre carte) : aucune diffusion
  await tx.execute(sql`
    UPDATE campaign.map_tokens SET layer_id = ${target.id},
           z = campaign.map_layer_top_z(${target.id}) + z, version = version + 1, updated_at = now()
     WHERE layer_id = ${layer.id} AND NOT present`);

  const inLayer = (t: typeof mapObjects | typeof mapDrawings | typeof mapNotes) =>
    tx.select({ id: t.id, z: t.z }).from(t).where(eq(t.layerId, layer.id));
  // Une transaction : requêtes l'une après l'autre sur sa connexion
  const tokens = await tx
    .select({ id: mapTokens.id, z: mapTokens.z })
    .from(mapTokens)
    .where(and(eq(mapTokens.layerId, layer.id), eq(mapTokens.present, true)));
  const objects = await inLayer(mapObjects);
  const drawings = await inLayer(mapDrawings);
  const notes = await inLayer(mapNotes);
  const top = await tx.execute<{ top: number }>(
    sql`SELECT campaign.map_layer_top_z(${target.id}) AS top`,
  );
  const base = Number(top.rows[0]?.top ?? 0);
  const content = [
    ...tokens.map((x) => ({ ...x, kind: 'token' as const })),
    ...objects.map((x) => ({ ...x, kind: 'object' as const })),
    ...drawings.map((x) => ({ ...x, kind: 'drawing' as const })),
    ...notes.map((x) => ({ ...x, kind: 'note' as const })),
  ].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  await arrangeItems(
    tx,
    ctx,
    v,
    map,
    content.map((x, n) => ({ kind: x.kind, id: x.id, layerId: target.id, z: base + n + 1 })),
  );
}

export const registerArrange: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.post(
    '/v1/campaigns/:id/maps/:mapId/arrange',
    { preValidation: app.authenticate, schema: { params: MapParams, body: ArrangeMapItems } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        return arrangeItems(tx, ctx, v, map, req.body.items);
      });
    },
  );
};
