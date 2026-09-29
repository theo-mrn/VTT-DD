/**
 * PNJ de la carte (docs/carte.md § 10 et § 12) : chaque PNJ posé est un vrai personnage,
 * créé par character, engagé dans la campagne et posé en token, en une fois.
 *
 *   POST   /v1/campaigns/:id/maps/:mapId/npcs                           poser N PNJ (MJ)
 *   POST   /v1/campaigns/:id/maps/:mapId/tokens/:itemId/duplicate       cloner un PNJ posé (MJ)
 *   DELETE /v1/campaigns/:id/maps/:mapId/tokens/:itemId[?character=delete]
 *          retirer le token ; avec `character=delete`, supprimer aussi le PNJ (MJ)
 *
 * Création : character crée les personnages (sa transaction), puis campaign les engage
 * et pose les tokens (la sienne). Si la seconde échoue, les personnages sont supprimés
 * (compensation) : rien ne reste à moitié créé. Suppression : campaign retire le PNJ de
 * la campagne (tokens de toutes les cartes, combat), puis character le supprime.
 */
import {
  CreateMapNpcs,
  DeleteMapTokenQuery,
  DuplicateMapToken,
  MapNpcsCreated,
  uuidv7,
  type MapNpcCharacter,
  type MapPoint,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CharacterError, type NpcInstance, type NpcSourceInput } from '../../clients/character.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import { campaignCharacters, mapTokens, type Side } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { campaignEvent, lockCampaign } from '../campaigns/repository.js';
import { removeFromCombat } from '../combat/repository.js';
import {
  checkLayer,
  ItemParams,
  loadMap,
  MapParams,
  mapSettingsOf,
  notFound,
  requestContext,
  requireGm,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';
import { deleteToken, lockToken, tokenApi, tokenEvent, type TokenRow } from './tokens.js';

/** Refus ou panne de character traduits en erreurs HTTP. */
function characterFailure(e: unknown, log: FastifyBaseLogger): never {
  if (e instanceof CharacterError) {
    if (e.rejected)
      throw new HttpError(
        e.status === 404 ? 404 : 422,
        'Refusé',
        e.code ?? 'character_refused',
        e.message,
      );
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

const notAnNpc = () =>
  new HttpError(422, 'Refusé', 'not_an_npc', 'Seul un PNJ du MJ se duplique ou se supprime ainsi');

/**
 * Positions de `count` tokens en grille serrée centrée sur `pos` (une case d'écart :
 * `pixelsPerUnit × tokenScale × scale`).
 */
export function gridAround(pos: MapPoint, count: number, step: number): MapPoint[] {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    x: pos.x + ((i % cols) - (cols - 1) / 2) * step,
    y: pos.y + (Math.floor(i / cols) - (rows - 1) / 2) * step,
  }));
}

/** Apparence d'un token posé pour un PNJ (celle du token copié, ou les choix de la pose). */
type Look = Partial<
  Pick<
    TokenRow,
    | 'scale'
    | 'shape'
    | 'imageUrl'
    | 'visibility'
    | 'visibleTo'
    | 'visionRadius'
    | 'notes'
    | 'audio'
    | 'interactions'
    | 'layerId'
  >
>;

/**
 * Engage les instances dans la campagne et pose leurs tokens autour de `pos`, avec leurs
 * événements (engagement réservé au MJ : le nom d'un PNJ caché ne fuit pas).
 */
async function engageAndPlace(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: MapRow,
  created: NpcInstance[],
  o: { side: Side; pos: MapPoint; look: Look },
) {
  const campaignId = map.campaignId;
  await lockCampaign(tx, campaignId);
  const settings = await mapSettingsOf(tx, campaignId);
  const step = settings.pixelsPerUnit * settings.tokenScale * (o.look.scale ?? 1);
  const places = gridAround(o.pos, created.length, step);
  const tokens: TokenRow[] = [];
  for (const [i, c] of created.entries()) {
    await tx.insert(campaignCharacters).values({
      campaignId,
      characterId: c.id,
      ownerId: v.userId,
      side: o.side,
      addedBy: v.userId,
    });
    await campaignEvent(tx, ctx, {
      type: 'campaign.character_added',
      campaignId,
      userId: v.userId,
      role: v.access.role,
      payload: { characterId: c.id, side: o.side, ownerId: v.userId, name: c.name },
      visibility: 'gm_only',
    });
    const [token] = await tx
      .insert(mapTokens)
      .values({
        ...o.look,
        imageUrl: o.look.imageUrl ?? c.tokenUrl ?? null,
        id: uuidv7(),
        campaignId,
        mapId: map.id,
        characterId: c.id,
        pos: places[i]!,
      })
      .returning();
    await tokenEvent(tx, ctx, v, token!, 'token.created');
    tokens.push(token!);
  }
  return tokens;
}

const charactersApi = (created: NpcInstance[]): MapNpcCharacter[] =>
  created.map((c) => ({
    id: c.id,
    name: c.name,
    avatarUrl: c.avatarUrl,
    templateId: c.templateId,
  }));

export const registerNpcs: Module = async (app, deps: Deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const origin = (req: FastifyRequest, v: Viewer) => ({
    userId: v.userId,
    campaignId: v.access.campaign.id,
    correlationId: req.ctx.correlationId,
  });

  /**
   * Crée les personnages, puis les engage et pose leurs tokens ; si la seconde étape
   * échoue, supprime les personnages créés (compensation) et renvoie l'erreur.
   */
  async function createAndPlace(
    req: FastifyRequest,
    v: Viewer,
    source: NpcSourceInput,
    count: number,
    place: (tx: Tx, ctx: EventContext, v: Viewer, created: NpcInstance[]) => Promise<TokenRow[]>,
  ) {
    const { ctx } = requestContext(req);
    const created = await deps.character
      .createNpcs({ systemId: v.access.campaign.systemId, count, source }, origin(req, v))
      .catch((e: unknown) => characterFailure(e, req.log));
    try {
      const tokens = await db.transaction((tx) => place(tx, ctx, v, created));
      return { items: tokens.map(tokenApi), characters: charactersApi(created) };
    } catch (err) {
      await deps.character
        .deleteNpcs(
          created.map((c) => c.id),
          origin(req, v),
        )
        .catch((e: unknown) =>
          req.log.error(
            { error: (e as Error).message, ids: created.map((c) => c.id) },
            'compensation impossible : PNJ créés sans être posés',
          ),
        );
      throw err;
    }
  }

  r.post(
    '/v1/campaigns/:id/maps/:mapId/npcs',
    {
      ...auth,
      schema: { params: MapParams, body: CreateMapNpcs, response: { 201: MapNpcsCreated } },
    },
    async (req, reply) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      requireGm(v);
      await loadMap(db, v, req.params.mapId);
      const { source, count, pos, side, visibility, scale, shape, layerId } = req.body;
      // Calque inconnu : refusé avant de créer quoi que ce soit (et revu dans la transaction)
      await checkLayer(db, v, req.params.mapId, layerId);
      const result = await createAndPlace(req, v, source, count, async (tx, ctx, _v, created) => {
        const current = await viewerOf(tx, req.params.id, userId);
        requireGm(current);
        const map = await loadMap(tx, current, req.params.mapId, true);
        await checkLayer(tx, current, map.id, layerId);
        return engageAndPlace(tx, ctx, current, map, created, {
          side: side ?? 'enemies',
          pos,
          look: {
            ...(visibility ? { visibility } : {}),
            ...(scale ? { scale } : {}),
            ...(shape ? { shape } : {}),
            ...(layerId ? { layerId } : {}),
          },
        });
      });
      reply.code(201);
      return result;
    },
  );

  r.post(
    '/v1/campaigns/:id/maps/:mapId/tokens/:itemId/duplicate',
    {
      ...auth,
      schema: { params: ItemParams, body: DuplicateMapToken, response: { 201: MapNpcsCreated } },
    },
    async (req, reply) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      requireGm(v);
      const map = await loadMap(db, v, req.params.mapId);
      const [original] = await db
        .select({ token: mapTokens, side: campaignCharacters.side })
        .from(mapTokens)
        .innerJoin(
          campaignCharacters,
          and(
            eq(campaignCharacters.campaignId, mapTokens.campaignId),
            eq(campaignCharacters.characterId, mapTokens.characterId),
          ),
        )
        .where(
          and(
            eq(mapTokens.id, req.params.itemId),
            eq(mapTokens.mapId, map.id),
            eq(mapTokens.present, true),
          ),
        );
      if (!original) throw notFound('Token');
      if (original.side === 'players') throw notAnNpc();
      const t = original.token;
      const result = await createAndPlace(
        req,
        v,
        { characterId: t.characterId },
        req.body.count,
        async (tx, ctx, _v, created) => {
          const current = await viewerOf(tx, req.params.id, userId);
          requireGm(current);
          const locked = await loadMap(tx, current, req.params.mapId, true);
          return engageAndPlace(tx, ctx, current, locked, created, {
            side: original.side,
            pos: req.body.pos,
            look: {
              scale: t.scale,
              shape: t.shape,
              imageUrl: t.imageUrl,
              visibility: t.visibility,
              visibleTo: t.visibleTo,
              visionRadius: t.visionRadius,
              notes: t.notes,
              audio: t.audio,
              interactions: t.interactions,
              layerId: t.layerId,
            },
          });
        },
      );
      reply.code(201);
      return result;
    },
  );

  r.delete(
    '/v1/campaigns/:id/maps/:mapId/tokens/:itemId',
    { ...auth, schema: { params: ItemParams, querystring: DeleteMapTokenQuery } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const withCharacter = req.query.character === 'delete';
      if (withCharacter) {
        // Seulement un PNJ (jamais un personnage joueur, même engagé comme allié)
        const v = await viewerOf(db, req.params.id, userId);
        requireGm(v);
        const map = await loadMap(db, v, req.params.mapId);
        const [token] = await db
          .select({ characterId: mapTokens.characterId })
          .from(mapTokens)
          .where(
            and(
              eq(mapTokens.id, req.params.itemId),
              eq(mapTokens.mapId, map.id),
              eq(mapTokens.present, true),
            ),
          );
        if (!token) throw notFound('Token');
        const summary = await deps.character
          .summary(token.characterId, origin(req, v))
          .catch((e: unknown) => characterFailure(e, req.log));
        if (summary?.kind !== 'npc') throw notAnNpc();
      }
      const removed = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const map = await loadMap(tx, v, req.params.mapId);
        const before = await lockToken(tx, v, map.id, req.params.itemId);
        if (!withCharacter) {
          await deleteToken(tx, ctx, v, before);
          return null;
        }
        // Le PNJ quitte la campagne : combat, tokens de toutes les cartes, engagement
        const campaignId = map.campaignId;
        await lockCampaign(tx, campaignId);
        const actor = { userId, role: v.access.role };
        await removeFromCombat(tx, ctx, campaignId, [before.characterId], actor);
        const all = await tx
          .select()
          .from(mapTokens)
          .where(
            and(
              eq(mapTokens.campaignId, campaignId),
              eq(mapTokens.characterId, before.characterId),
            ),
          )
          .for('update');
        for (const t of all) await deleteToken(tx, ctx, v, t);
        await tx
          .delete(campaignCharacters)
          .where(
            and(
              eq(campaignCharacters.campaignId, campaignId),
              eq(campaignCharacters.characterId, before.characterId),
            ),
          );
        await campaignEvent(tx, ctx, {
          type: 'campaign.character_removed',
          campaignId,
          ...actor,
          payload: { characterId: before.characterId },
        });
        return { v, characterId: before.characterId };
      });
      // Puis le personnage lui-même ; une panne laisse un PNJ hors campagne, sans token
      if (removed)
        await deps.character
          .deleteNpcs([removed.characterId], origin(req, removed.v))
          .catch((e: unknown) =>
            req.log.error(
              { error: (e as Error).message, characterId: removed.characterId },
              'PNJ retiré de la campagne mais pas supprimé dans character',
            ),
          );
      reply.code(204);
    },
  );
};
