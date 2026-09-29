/**
 * Emprunter un portail (docs/carte.md § 10, Portails) : le serveur décide qui passe et où.
 *
 *   POST /v1/campaigns/:id/maps/:mapId/portals/:itemId/use   { characterIds } | { party: true }
 *
 * - Joueur : un portail visible, ses personnages seulement, dont le token est sur la carte dans
 *   la zone du portail (centre du token à `radius` au plus de son centre). Le portail lui ouvre
 *   la scène visée, même cachée aux joueurs (`/travel`, lui, reste limité aux scènes qu'il voit).
 * - MJ : tout personnage engagé présent sur la carte, sans condition de zone ; `party` : le
 *   groupe (téléportation : ses personnages présents sur la carte ; autre scène : tout le
 *   groupe, et la scène devient celle du groupe, comme `travel {}`).
 * - Arrivée : autour du point d'arrivée (`target`, sinon, pour une autre scène, son point
 *   d'arrivée des joueurs, sinon son centre), une case d'écart, sans empiler (`arrivalSpots`).
 * - Événements : un `token.moved` par voyageur (déplacement ou voyage), et
 *   `map_portal.used` pour les MJ.
 */
import { MapPortalUseResult, UseMapPortal } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, inArray } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Tx } from '../../db/outbox.js';
import { maps, mapTokens, type MapPoint } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  ItemParams,
  loadMap,
  mapEvent,
  type MapRow,
  requestContext,
  requireGm,
  requireWriter,
  viewerOf,
} from './common.js';
import { layerDef, lockItem } from './layers.js';
import type { PortalRow } from './portal-links.js';
import {
  arrivalSpots,
  engaged,
  partyCharacterIds,
  setPartyMap,
  tokenApi,
  travel,
  updateToken,
  type TokenRow,
} from './tokens.js';

const refused = (code: string, message: string) => new HttpError(422, 'Refusé', code, message);

/** Tolérance de la zone, en pixels du monde (arrondis des positions). */
const RANGE_EPSILON = 1e-6;

/** Le centre du token est dans la zone du portail. */
export const insidePortal = (portal: Pick<PortalRow, 'pos' | 'radius'>, p: MapPoint) =>
  Math.hypot(p.x - portal.pos.x, p.y - portal.pos.y) <= portal.radius + RANGE_EPSILON;

/** Carte d'arrivée et point autour duquel on arrive (absent : celui de la scène). */
async function destinationOf(
  tx: Tx,
  map: MapRow,
  portal: PortalRow,
): Promise<{ map: MapRow; around: MapPoint | undefined }> {
  if (portal.kind === 'same_map') {
    if (!portal.target)
      throw refused('portal_without_destination', 'Ce portail ne mène nulle part');
    return { map, around: portal.target };
  }
  const [target] = portal.targetMapId
    ? await tx
        .select()
        .from(maps)
        .where(and(eq(maps.id, portal.targetMapId), eq(maps.campaignId, map.campaignId)))
    : [];
  if (!target) throw refused('portal_without_destination', 'Ce portail ne mène nulle part');
  return { map: target, around: portal.target ?? undefined };
}

export const registerPortalUse: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/campaigns/:id/maps/:mapId/portals/:itemId/use',
    {
      ...auth,
      schema: {
        params: ItemParams,
        body: UseMapPortal,
        response: { 200: MapPortalUseResult },
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireWriter(v);
        const map = await loadMap(tx, v, req.params.mapId);
        // Un joueur ne trouve qu'un portail visible (404 sinon)
        const portal = (await lockItem(
          tx,
          layerDef('portals'),
          v,
          map.id,
          req.params.itemId,
        )) as unknown as PortalRow;
        const party = 'party' in req.body;
        if (party) requireGm(v);
        const destination = await destinationOf(tx, map, portal);
        const crossing = destination.map.id !== map.id;

        // Voyageurs : le groupe (MJ) ou des personnages nommés
        let ids = party
          ? await partyCharacterIds(tx, map.campaignId)
          : [...new Set((req.body as { characterIds: string[] }).characterIds)];
        if (!party) {
          await engaged(tx, map.campaignId, ids);
          if (!v.isGm && ids.some((id) => !v.characterIds.includes(id)))
            throw HttpError.forbidden('Un joueur n’emprunte un portail qu’avec ses personnages');
        }
        const here = ids.length
          ? await tx
              .select()
              .from(mapTokens)
              .where(
                and(
                  eq(mapTokens.mapId, map.id),
                  eq(mapTokens.present, true),
                  inArray(mapTokens.characterId, ids),
                ),
              )
              .for('update')
          : [];
        const tokenOf = new Map(here.map((t) => [t.characterId, t]));
        // Le groupe qui se téléporte : ceux qui sont sur la carte ; vers une autre scène : tous
        if (party && !crossing) ids = ids.filter((id) => tokenOf.has(id));
        if (!ids.length) throw refused('no_travellers', 'Personne à faire passer');
        if (!party) {
          const away = ids.filter((id) => !tokenOf.has(id));
          if (away.length)
            throw refused('not_on_map', 'Ce personnage n’est pas sur la carte du portail');
          if (!v.isGm && ids.some((id) => !insidePortal(portal, tokenOf.get(id)!.pos)))
            throw refused('out_of_range', 'Le personnage n’est pas dans la zone du portail');
        }

        const spots = await arrivalSpots(tx, destination.map, ids.length, destination.around, ids);
        const moved: TokenRow[] = [];
        for (const [i, id] of ids.entries()) {
          const spot = spots[i]!;
          moved.push(
            crossing
              ? await travel(tx, ctx, v, destination.map, id, spot)
              : await updateToken(tx, ctx, v, map.id, tokenOf.get(id)!.id, { pos: spot }),
          );
        }
        if (party && crossing) await setPartyMap(tx, ctx, v, destination.map);

        await mapEvent(tx, ctx, v, {
          type: 'map_portal.used',
          aggregate: { type: 'map_portal', id: portal.id },
          payload: {
            id: portal.id,
            mapId: map.id,
            name: portal.name,
            kind: portal.kind,
            toMapId: destination.map.id,
            characterIds: ids,
            party,
            userId,
          },
          visibility: 'gm_only',
        });
        return { mapId: destination.map.id, items: moved.map(tokenApi) };
      });
    },
  );
};
