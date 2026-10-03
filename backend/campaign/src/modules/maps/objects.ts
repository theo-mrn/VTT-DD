/**
 * Fouille des objets de la carte (docs/carte.md § 10, Objets) : le MJ rend un objet
 * « à fouiller » (`searchable`) ; un joueur dont un personnage est à portée le fouille,
 * voit son contenu et prend ce qu'il veut, qui entre dans l'inventaire du personnage
 * (route interne de character). Le MJ est prévenu (`map_object.searched`, `.looted`).
 *
 *   POST /v1/campaigns/:id/maps/:mapId/objects/:itemId/search   { characterId }
 *   POST /v1/campaigns/:id/maps/:mapId/objects/:itemId/take     { characterId, itemId, quantity? }
 *
 * Portée : distance du centre du token du personnage au rectangle de l'objet (tourné
 * autour de son centre), au plus `searchRadius` unités (× `pixelsPerUnit`). Le MJ fouille
 * et prend pour n'importe quel personnage engagé, sans condition de portée.
 */
import {
  MapObjectSearchResult,
  MapObjectTakeResult,
  SearchMapObject,
  TakeMapObjectItem,
  type MapObjectItem,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CharacterError } from '../../clients/character.js';
import type { Tx } from '../../db/outbox.js';
import { campaignCharacters } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  ItemParams,
  loadMap,
  mapEvent,
  type MapRow,
  requestContext,
  requireWriter,
  sceneSettingsOf,
  type Viewer,
  viewerOf,
} from './common.js';
import { layerDef, lockItem, writeItem, type LayerRow } from './layers.js';

type ObjectRow = LayerRow & {
  name: string;
  items: MapObjectItem[];
  searchable: boolean;
  searchRadius: number;
};

const refused = (status: number, code: string, message: string) =>
  new HttpError(status, status === 403 ? 'Accès refusé' : 'Refusé', code, message);

/**
 * Le personnage peut-il fouiller l'objet ? Joueur : son personnage, objet à fouiller et
 * visible (verrouillé pour la transaction), token présent à portée. MJ : tout personnage
 * engagé. Renvoie l'objet et le joueur qui incarne le personnage.
 */
async function reach(tx: Tx, v: Viewer, map: MapRow, objectId: string, characterId: string) {
  requireWriter(v);
  if (!v.isGm && !v.characterIds.includes(characterId))
    throw HttpError.forbidden('Un joueur ne fouille qu’avec ses personnages');
  const [engagement] = await tx
    .select({ playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, map.campaignId),
        eq(campaignCharacters.characterId, characterId),
      ),
    );
  if (!engagement)
    throw refused(422, 'character_not_engaged', 'Personnage non engagé dans la campagne');
  const object = (await lockItem(tx, layerDef('objects'), v, map.id, objectId)) as ObjectRow;
  if (v.isGm) return { object, playerId: engagement.playedBy };
  if (!object.searchable) throw refused(403, 'not_searchable', 'Cet objet ne se fouille pas');
  const { pixelsPerUnit } = await sceneSettingsOf(tx, map);
  const { rows } = await tx.execute<{ distance: number }>(sql`
    SELECT ST_Distance(t.pos, ST_Rotate(
             ST_MakeEnvelope(ST_X(o.pos), ST_Y(o.pos), ST_X(o.pos) + o.width, ST_Y(o.pos) + o.height, 0),
             radians(o.rotation), ST_X(o.pos) + o.width / 2, ST_Y(o.pos) + o.height / 2)) AS distance
      FROM campaign.map_tokens t, campaign.map_objects o
     WHERE t.map_id = ${map.id} AND t.character_id = ${characterId} AND t.present
       AND o.id = ${object.id}`);
  const distance = rows[0]?.distance;
  if (distance === undefined || Number(distance) > object.searchRadius * pixelsPerUnit)
    throw refused(422, 'out_of_range', 'Le personnage est trop loin de l’objet');
  return { object, playerId: engagement.playedBy };
}

const contents = (o: ObjectRow) => ({
  id: o.id,
  mapId: o.mapId,
  name: o.name,
  items: o.items,
  version: o.version,
});

function characterFailure(e: unknown, log: FastifyBaseLogger): never {
  if (e instanceof CharacterError) {
    if (e.rejected) throw new HttpError(422, 'Refusé', e.code ?? 'character_refused', e.message);
    log.error({ error: e.message }, 'character injoignable');
    throw new HttpError(
      502,
      'Service indisponible',
      'character_unavailable',
      'Le service des personnages ne répond pas',
    );
  }
  throw e;
}

export const registerObjectSearch: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const base = '/v1/campaigns/:id/maps/:mapId/objects/:itemId';

  r.post(
    `${base}/search`,
    {
      ...auth,
      schema: {
        params: ItemParams,
        body: SearchMapObject,
        response: { 200: MapObjectSearchResult },
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        const { object } = await reach(tx, v, map, req.params.itemId, req.body.characterId);
        await mapEvent(tx, ctx, v, {
          type: 'map_object.searched',
          aggregate: { type: 'map_object', id: object.id },
          payload: {
            id: object.id,
            mapId: map.id,
            name: object.name,
            characterId: req.body.characterId,
            userId,
          },
          visibility: 'gm_only',
        });
        return contents(object);
      });
    },
  );

  /**
   * Prendre : l'objet reste verrouillé pendant l'appel à character (une seule prise à la
   * fois) ; si character refuse ou ne répond pas, rien ne change.
   */
  r.post(
    `${base}/take`,
    {
      ...auth,
      schema: {
        params: ItemParams,
        body: TakeMapObjectItem,
        response: { 200: MapObjectTakeResult },
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const { characterId, itemId } = req.body;
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        const { object, playerId } = await reach(tx, v, map, req.params.itemId, characterId);
        const item = object.items.find((i) => i.id === itemId);
        if (!item) throw HttpError.notFound('Contenu introuvable dans cet objet');
        const quantity = req.body.quantity ?? item.quantity;
        if (quantity > item.quantity)
          throw refused(
            422,
            'quantity_exceeded',
            `${item.name} : ${quantity} demandé(s), ${item.quantity} dans l’objet`,
          );
        const received = await deps.character
          .receiveItem(
            characterId,
            {
              item: {
                ...(item.ref ? { ref: item.ref } : {}),
                name: item.name,
                ...(item.description ? { description: item.description } : {}),
                quantity,
              },
              playerId,
            },
            { userId, campaignId: map.campaignId, correlationId: req.ctx.correlationId },
          )
          .catch((e: unknown) => characterFailure(e, req.log));
        const remaining = item.quantity - quantity;
        const items = remaining
          ? object.items.map((i) => (i.id === itemId ? { ...i, quantity: remaining } : i))
          : object.items.filter((i) => i.id !== itemId);
        const def = layerDef('objects');
        const after = (await writeItem(tx, ctx, def, v, map, object, {
          items,
        })) as ObjectRow & { updatedAt: string };
        await mapEvent(tx, ctx, v, {
          type: 'map_object.looted',
          aggregate: { type: 'map_object', id: object.id },
          payload: {
            id: object.id,
            mapId: map.id,
            name: object.name,
            characterId,
            userId,
            item: {
              id: item.id,
              name: item.name,
              quantity,
              ...(item.ref ? { ref: item.ref } : {}),
            },
            remaining,
          },
          visibility: 'gm_only',
        });
        return {
          object: { ...contents({ ...object, items }), version: after.version },
          taken: { itemId: item.id, name: item.name, quantity },
          characterVersion: received.version,
        };
      });
    },
  );
};
