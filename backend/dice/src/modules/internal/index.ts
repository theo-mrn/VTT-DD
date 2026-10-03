/**
 * Module « internal » : routes appelées par les autres services, jamais
 * relayées par la gateway (qui refuse tout /internal/*). Pas de jeton
 * utilisateur : le secret partagé INTERNAL_API_SECRET (en-tête
 * x-internal-secret, comparé à temps constant) est exigé. Sans ce secret
 * configuré, les routes n'existent pas.
 *
 *   POST /internal/rolls
 *       jet d'action tiré par character (POST /v1/characters/:id/actions/:action),
 *       enregistré tel quel dans l'historique (source `action`), sous le nom
 *       du personnage. L'auteur doit être membre (non spectateur) de la
 *       campagne indiquée ; sans campagne, le jet est personnel.
 *
 *   PUT /internal/users/:userId/all-skins   { allSkins }
 *       accès à tous les skins (ancien premium) : piloté par le service
 *       billing selon l'abonnement premium. Idempotent.
 *
 *   PUT /internal/users/:userId/inventory/:skinId   { source }
 *       ajoute un skin à l'inventaire (achat Stripe confirmé par billing,
 *       plus tard cadeau ou défi). Idempotent ; skin inconnu : 422 unknown_skin.
 */
import { HttpError } from '@vtt/platform';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { requireInternalSecret } from '../../internal/secret.js';
import { firstGroup, formatDice, formatSymbolResult } from '../../engine/roll.js';
import { Preferences, setAllSkins } from '../preferences/index.js';
import { grantSkin } from './inventory.js';
import { memberRole } from '../rolls/index.js';
import { actorRole, insertRoll, type Viewer } from '../rolls/repository.js';
import {
  CampaignId,
  CharacterId,
  DiceGroup,
  eventContext,
  Label,
  Notation,
  Outcome,
  Symbols,
  SystemId,
  UserId,
  Visibility,
} from '../schemas.js';

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) {
    app.log.warn('INTERNAL_API_SECRET absent : routes internes (character, billing) désactivées');
    return;
  }
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.post(
    '/internal/rolls',
    {
      // Secret vérifié avant la validation : rien ne fuit sans lui
      preValidation: requireInternalSecret(secret),
      // Les appels viennent de character (peu d'IP) : limite large
      config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: {
        hide: true,
        body: z.object({
          campaignId: CampaignId.optional(),
          authorId: UserId,
          characterId: CharacterId,
          /** Nom et avatar du personnage : nom affiché du jet (ancien userName / userAvatar). */
          characterName: z.string().trim().min(1).max(200).optional(),
          characterAvatarUrl: z.string().max(2048).nullable().optional(),
          actionId: z.string().min(1).max(200),
          label: Label.optional(),
          notation: Notation.optional(),
          systemId: SystemId.optional(),
          visibility: Visibility.default('public'),
          dice: z.array(DiceGroup).max(100).default([]),
          symbols: Symbols.optional(),
          total: z.number().finite().optional(),
          outcome: Outcome,
          explanations: z.array(z.string().max(2000)).max(200).default([]),
        }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (req, reply) => {
      const b = req.body;
      let viewer: Viewer = { userId: b.authorId, role: null };
      if (b.campaignId) {
        viewer = { userId: b.authorId, role: await memberRole(deps, b.campaignId, b.authorId) };
        if (viewer.role === 'spectator')
          throw new HttpError(
            403,
            'Accès refusé',
            'spectator_cannot_roll',
            'Un spectateur ne lance pas de dés dans la campagne',
          );
      }
      const system = b.systemId ? deps.catalog.system(b.systemId) : undefined;
      const symbols = b.symbols ?? null;
      const total = b.total ?? (symbols ? 0 : null);
      const symbolResult = symbols ? formatSymbolResult(system, symbols.results) : null;
      const first = symbols ? { diceCount: symbols.dice.length, diceFaces: 0 } : firstGroup(b.dice);
      if (symbols?.dice[0] && system?.source.des) {
        const sorte = system.source.des.sortes.find((s) => s.id === symbols.dice[0]!.die);
        first.diceFaces = sorte?.faces.length ?? 0;
      }
      // Détail lisible : le déroulé de l'action, sinon les dés tirés
      let output: string;
      if (b.explanations.length) output = b.explanations.join(' ; ');
      else if (symbols)
        output = `${symbols.dice.map((d) => `${d.die} [${d.face}]`).join(', ')} = ${symbolResult}`;
      else output = formatDice(b.dice, total);
      output = output.slice(0, 5000);

      const row = await db.transaction((tx) =>
        insertRoll(
          tx,
          eventContext(req),
          {
            campaignId: b.campaignId ?? null,
            authorId: b.authorId,
            authorName: b.characterName ?? (viewer.role === 'gm' ? 'MJ' : 'Aventurier'),
            authorAvatarUrl: b.characterAvatarUrl ?? null,
            characterId: b.characterId,
            source: 'action',
            actionId: b.actionId,
            label: b.label ?? null,
            notation: b.notation ?? null,
            systemId: b.systemId ?? null,
            visibility: b.campaignId ? b.visibility : 'self',
            dice: b.dice,
            symbols,
            ...first,
            total,
            output,
            symbolResult,
            outcome: b.outcome,
            explanations: b.explanations,
          },
          actorRole(viewer),
        ),
      );
      reply.code(201);
      return { id: row.id };
    },
  );

  r.put(
    '/internal/users/:userId/all-skins',
    {
      preValidation: requireInternalSecret(secret),
      config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: {
        hide: true,
        params: z.object({ userId: UserId }),
        body: z.object({ allSkins: z.boolean() }),
        response: { 200: Preferences },
      },
    },
    async (req) => setAllSkins(db, eventContext(req), req.params.userId, req.body.allSkins),
  );

  r.put(
    '/internal/users/:userId/inventory/:skinId',
    {
      preValidation: requireInternalSecret(secret),
      config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: {
        hide: true,
        params: z.object({
          userId: UserId,
          skinId: z.string().regex(/^[a-z0-9_]{1,64}$/, 'Identifiant de skin invalide'),
        }),
        body: z.object({ source: z.enum(['purchase', 'gift', 'challenge']) }),
        response: { 200: Preferences },
      },
    },
    async (req) =>
      grantSkin(db, eventContext(req), req.params.userId, req.params.skinId, req.body.source),
  );
};
