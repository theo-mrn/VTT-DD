/**
 * Module « rolls » : jets tirés par le serveur et historique (contrat :
 * docs/api-dice.md). Remplace l'ancienne route /api/roll-dice et
 * l'enregistrement de dice-roller.tsx dans `rolls/{roomId}/rolls`, avec le
 * même comportement : variables du personnage, jets privés (isPrivate) et
 * cachés au MJ (isBlind), détail `output`, dés à symboles.
 *
 * Toutes les routes demandent un jeton d'accès (ou une clé d'API échangée par
 * la gateway, `Authorization: ApiKey …`).
 *
 *   POST   /v1/dice/rolls                                      lancer
 *   GET    /v1/dice/rolls?campaignId=&before=&after=&limit=    historique
 *   GET    /v1/dice/rolls/:id                                  un jet
 *   DELETE /v1/dice/rolls/:id                                  auteur ou MJ
 *   GET    /v1/dice/skins                                      catalogue des skins
 *
 * Comme l'ancienne app, l'historique est renvoyé du plus récent au plus
 * ancien (50 par défaut). `before` : jets plus anciens que ce jet ; `after` :
 * nouveaux jets depuis le plus récent reçu (polling, en attendant realtime).
 */
import { HttpError } from '@vtt/platform';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CampaignRole } from '../../clients/campaign.js';
import type { CharacterSheet } from '../../clients/character.js';
import { rolls, type RollRow, type RollVisibility } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import {
  MAX_NOTATION,
  rollNotation,
  rollPool,
  sheetVariables,
  symbolPool,
  type Rolled,
} from '../../engine/roll.js';
import { SKINS } from '../../skins/catalog.js';
import {
  CampaignId,
  CharacterId,
  currentUser,
  eventContext,
  Label,
  Pool,
  Roll,
  RollId,
  SystemId,
  Visibility,
} from '../schemas.js';
import {
  actorRole,
  canSee,
  deleteRoll,
  findByIdempotencyKey,
  insertRoll,
  recentRolls,
  toApi,
  visibleTo,
  type Viewer,
} from './repository.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

export function campaignNotFound(): HttpError {
  return new HttpError(404, 'Ressource introuvable', 'campaign_not_found', 'Campagne introuvable');
}

export function rollNotFound(): HttpError {
  return new HttpError(404, 'Ressource introuvable', 'roll_not_found', 'Jet introuvable');
}

/** Rôle de l'appelant dans la campagne ; 404 s'il n'en est pas membre. */
export async function memberRole(
  deps: Pick<Deps, 'campaigns'>,
  campaignId: string,
  userId: string,
): Promise<CampaignRole> {
  const role = await deps.campaigns.role(campaignId, userId);
  if (!role) throw campaignNotFound();
  return role;
}

/** Qui consulte ce jet : son rôle n'est demandé à campaign que pour un jet de campagne. */
async function viewerOf(deps: Deps, row: RollRow, userId: string): Promise<Viewer> {
  if (!row.campaignId) return { userId, role: null };
  return { userId, role: await deps.campaigns.role(row.campaignId, userId) };
}

/** Variable en nom nu (`FOR`) passée explicitement, comme `variables` de l'ancienne API. */
const VariableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, 'Nom de variable invalide');

const RollRequest = z.object({
  notation: z.string().trim().optional(),
  pool: Pool.optional(),
  systemId: SystemId.optional(),
  campaignId: CampaignId.optional(),
  /** Ancien nom de `campaignId` (API /api/roll-dice). */
  roomId: CampaignId.optional(),
  characterId: CharacterId.optional(),
  /** Ancien nom de `characterId`. */
  persoId: CharacterId.optional(),
  isPrivate: z.boolean().optional(),
  isBlind: z.boolean().optional(),
  visibility: Visibility.optional(),
  variables: z
    .record(VariableName, z.number().finite())
    .refine((v) => Object.keys(v).length <= 200, '200 variables au plus')
    .optional(),
  label: Label.optional(),
});

/** Réponse d'un jet : le jet enregistré, plus les champs de l'ancienne API /api/roll-dice. */
const RollCreated = Roll.extend({
  rolls: z.array(z.object({ type: z.string(), value: z.number() })),
  saved: z.boolean(),
  user: z.string(),
});

/** isBlind (caché au MJ) l'emporte sur isPrivate, comme dans l'ancienne app. */
export function visibilityOf(b: {
  visibility?: RollVisibility;
  isPrivate?: boolean;
  isBlind?: boolean;
}): RollVisibility {
  if (b.visibility) return b.visibility;
  if (b.isBlind) return 'gm';
  return b.isPrivate ? 'private' : 'public';
}

/** La notation contient-elle autre chose que des dés et des nombres (variables, dés à symboles) ? */
const hasNames = (notation: string) =>
  /[A-Za-z_@]/.test(notation.replace(/\d*[dD]\d+(?:k[hl]?\d+)?!?/g, ''));

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  // Jeton vérifié juste avant la validation du corps (un anonyme reçoit toujours
  // 401) et après les limites de débit (onRequest), qui comptent aussi les anonymes
  const auth = { preValidation: app.authenticate };

  /** Limite des jets par IP (types de @fastify/rate-limit non chargés ici, d'où la conversion). */
  const ROLL_LIMIT = {
    rateLimit: { max: deps.config.RATE_LIMIT_ROLLS_MAX, timeWindow: '1 minute' },
  } as FastifyContextConfig;

  /** Jet enregistré, au format de la réponse d'un lancer (ancienne API comprise). */
  const created = (row: RollRow, viewer: Viewer) => {
    const roll = toApi(row, viewer);
    const types = row.symbols
      ? row.symbols.dice.map((d) => d.die)
      : row.dice.flatMap((g) => g.values.map(() => `d${g.faces}`));
    return {
      ...roll,
      rolls: roll.hidden ? [] : roll.results.map((value, i) => ({ type: types[i] ?? '', value })),
      saved: true,
      user: roll.userName,
    };
  };

  const replay = (row: RollRow, viewer: Viewer, reply: FastifyReply) => {
    reply.code(201).header('idempotent-replayed', 'true');
    return created(row, viewer);
  };

  r.post(
    '/v1/dice/rolls',
    {
      ...auth,
      config: ROLL_LIMIT,
      schema: { body: RollRequest, response: { 201: RollCreated } },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const body = req.body;
      const notation = body.notation || undefined;
      if (!notation && !body.pool)
        throw HttpError.badRequest('Notation requise (notation ou pool)', 'notation_required');
      if (notation && body.pool)
        throw HttpError.badRequest('notation ou pool, pas les deux', 'notation_and_pool');
      if (notation && notation.length > MAX_NOTATION)
        throw HttpError.badRequest(
          `Notation trop longue (${MAX_NOTATION} caractères au plus)`,
          'notation_too_long',
        );
      const campaignId = body.campaignId ?? body.roomId;
      const rawKey = req.headers['idempotency-key'];
      const key = typeof rawKey === 'string' && IDEMPOTENCY_KEY.test(rawKey) ? rawKey : null;

      let role: CampaignRole | null = null;
      if (campaignId) {
        role = await memberRole(deps, campaignId, userId);
        if (role === 'spectator')
          throw new HttpError(
            403,
            'Accès refusé',
            'spectator_cannot_roll',
            'Un spectateur ne lance pas de dés dans la campagne',
          );
      }
      const viewer: Viewer = { userId, role };

      // Requête rejouée (même auteur, même clé) : le jet d'origine, jamais une relance
      if (key) {
        const existing = await findByIdempotencyKey(db, userId, key);
        if (existing) return replay(existing, viewer, reply);
      }
      if ((await recentRolls(db, userId)) >= deps.config.RATE_LIMIT_ROLLS_PER_USER) {
        reply.header('retry-after', '60');
        throw new HttpError(
          429,
          'Trop de requêtes',
          'too_many_rolls',
          'Trop de jets en peu de temps : patientez un instant',
        );
      }

      // Personnage : celui demandé, sinon (comme l'ancienne app) celui que l'appelant
      // incarne dans la campagne, lu seulement si la notation a des noms à résoudre
      let characterId = body.characterId ?? body.persoId;
      let campaignSystem: string | undefined;
      const needsContext = notation ? hasNames(notation) : !body.systemId;
      if (campaignId && needsContext && (!characterId || !body.systemId)) {
        const details = await deps.campaigns.details(campaignId, req.headers.authorization);
        campaignSystem = details?.systemId;
        if (!characterId && !body.variables) characterId = details?.playedCharacterId ?? undefined;
      }
      let sheet: CharacterSheet | undefined;
      if (characterId) {
        try {
          sheet = await deps.characters.sheet(characterId, userId);
        } catch (e) {
          // Personnage incarné illisible : jet sans variables, comme l'ancienne app
          if (body.characterId || body.persoId) throw e;
        }
      }

      const generator = deps.random();
      const systemId = body.systemId ?? sheet?.systemId ?? campaignSystem;
      const system = systemId ? deps.catalog.system(systemId) : undefined;
      if (body.systemId && !system)
        throw new HttpError(422, 'Système inconnu', 'unknown_system', `Système ${body.systemId}`);
      let rolled: Rolled;
      let usedSystem: string | null = null;
      const pool = body.pool ?? symbolPool(notation!, system);
      if (pool) {
        if (!system)
          throw HttpError.badRequest('systemId requis pour des dés à symboles', 'system_required');
        rolled = rollPool(system, pool, generator);
        usedSystem = system.source.id;
      } else {
        rolled = rollNotation(
          notation!,
          { variables: body.variables ?? sheetVariables(sheet?.values), sheet: sheet?.values },
          generator,
        );
      }

      // Nom affiché (ancien userName) : personnage, « MJ », ou profil du compte
      let userName = sheet?.name;
      let userAvatar = sheet?.avatarUrl ?? null;
      if (!userName && role === 'gm') userName = 'MJ';
      if (!userName) {
        const p = (await deps.profiles.profiles([userId], req.headers.authorization)).get(userId);
        userName = p?.name ?? 'Aventurier';
        userAvatar = p?.avatarUrl ?? null;
      }

      const source = req.user!.roles.includes('api') ? 'api' : 'free';
      let row: RollRow;
      try {
        row = await db.transaction((tx) =>
          insertRoll(
            tx,
            eventContext(req),
            {
              campaignId: campaignId ?? null,
              authorId: userId,
              authorName: userName.slice(0, 200),
              authorAvatarUrl: userAvatar,
              characterId: sheet?.id ?? null,
              source,
              label: body.label ?? null,
              notation: notation ?? rolled.notation,
              systemId: usedSystem,
              // Sans campagne, le jet est personnel
              visibility: campaignId ? visibilityOf(body) : 'self',
              dice: rolled.dice,
              symbols: rolled.symbols,
              diceCount: rolled.diceCount,
              diceFaces: rolled.diceFaces,
              total: rolled.total,
              output: rolled.output,
              symbolResult: rolled.symbolResult,
              outcome: rolled.outcome,
              idempotencyKey: key,
            },
            actorRole(viewer),
          ),
        );
      } catch (e) {
        // Même clé envoyée deux fois en même temps : le premier jet gagne
        const existing = key ? await findByIdempotencyKey(db, userId, key) : undefined;
        if (existing) return replay(existing, viewer, reply);
        throw e;
      }
      reply.code(201);
      return created(row, viewer);
    },
  );

  r.get(
    '/v1/dice/rolls',
    {
      ...auth,
      schema: {
        querystring: z
          .object({
            campaignId: CampaignId.optional(),
            before: RollId.optional(),
            after: RollId.optional(),
            limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
          })
          .refine((q) => !(q.before && q.after), 'before et after ne se combinent pas'),
        response: { 200: z.array(Roll) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { campaignId, before, after, limit } = req.query;
      const viewer: Viewer = {
        userId,
        role: campaignId ? await memberRole(deps, campaignId, userId) : null,
      };
      const visible = visibleTo(viewer, campaignId ?? null);
      let rows: RollRow[];
      if (after) {
        // Les plus anciens après le curseur (le client reprend là où il s'est arrêté)
        rows = (
          await db
            .select()
            .from(rolls)
            .where(and(visible, gt(rolls.id, after)))
            .orderBy(asc(rolls.id))
            .limit(limit)
        ).reverse();
      } else {
        rows = await db
          .select()
          .from(rolls)
          .where(and(visible, before ? lt(rolls.id, before) : undefined))
          .orderBy(desc(rolls.id))
          .limit(limit);
      }
      return rows.map((row) => toApi(row, viewer));
    },
  );

  const byId = async (id: string, userId: string) => {
    const [row] = await db.select().from(rolls).where(eq(rolls.id, id));
    if (!row) throw rollNotFound();
    const viewer = await viewerOf(deps, row, userId);
    // Un jet invisible pour l'appelant n'existe pas pour lui
    if (!canSee(row, viewer)) throw rollNotFound();
    return { row, viewer };
  };

  r.get(
    '/v1/dice/rolls/:id',
    { ...auth, schema: { params: z.object({ id: RollId }), response: { 200: Roll } } },
    async (req) => {
      const { row, viewer } = await byId(req.params.id, currentUser(req));
      return toApi(row, viewer);
    },
  );

  r.delete(
    '/v1/dice/rolls/:id',
    { ...auth, schema: { params: z.object({ id: RollId }) } },
    async (req, reply) => {
      const userId = currentUser(req);
      const { row, viewer } = await byId(req.params.id, userId);
      if (row.authorId !== userId && viewer.role !== 'gm')
        throw new HttpError(
          403,
          'Accès refusé',
          'not_roll_author',
          'Seuls l’auteur du jet et le MJ de la campagne le suppriment',
        );
      await db.transaction((tx) => deleteRoll(tx, eventContext(req), row, viewer));
      reply.code(204);
    },
  );

  r.get(
    '/v1/dice/skins',
    {
      ...auth,
      schema: {
        response: { 200: z.array(z.object({ id: z.string(), free: z.boolean() })) },
      },
    },
    async () => [...SKINS],
  );
};
