/**
 * Module « attacks » : attaques et rapports (docs/combat.md § 5 à § 9), en combat ou hors
 * combat. Dés tirés par le serveur (étape B) ; les étapes de dés physiques (étape C) ont leur
 * place dans le contrat et en base (`pendingSteps`, `faces`), sans route pour l'instant.
 *
 *   POST /v1/campaigns/:id/attacks                        DeclareAttack    déclarer (201)
 *   POST /v1/campaigns/:id/attacks/batch                  DeclareAttacks   à la suite (MJ, 201)
 *   GET  /v1/campaigns/:id/attacks                        ListAttacksQuery liste filtrée
 *   GET  /v1/campaigns/:id/attacks/:attackId                               une attaque, filtrée
 *   POST /v1/campaigns/:id/attacks/:attackId/reactions    AttackReaction   défense active
 *   POST /v1/campaigns/:id/attacks/:attackId/cancel       CancelAttack     abandon
 *   POST /v1/campaigns/:id/attacks/:attackId/apply        ApplyAttack      décision (MJ)
 *   POST /v1/campaigns/:id/attacks/apply                  ApplyAttacks     revue groupée (MJ)
 *   POST /v1/campaigns/:id/attacks/:attackId/dismiss      DismissAttack    écarter (MJ)
 *   POST /v1/campaigns/:id/attacks/:attackId/revert       RevertAttack     annuler (MJ)
 *
 * Résolution par character (routes internes, § 11.2) : `prepare` vérifie les règles, fige
 * l'instantané et propose les réactions ; `resolve` rend, cible par cible, le rapport complet
 * (MJ) et la vue de l'attaquant. Rien n'est appliqué sans décision du MJ.
 */
import {
  ApplyAttack,
  ApplyAttacks,
  Attack,
  AttackPage,
  AttackReaction,
  CancelAttack,
  DEFAULT_COMBAT_SETTINGS,
  DeclareAttack,
  DeclareAttacks,
  DismissAttack,
  ListAttacksQuery,
  RevertAttack,
  uuidv7,
  type ActionParams,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ActionResolution } from '../../clients/character.js';
import type { Tx } from '../../db/outbox.js';
import type { Deps, Module } from '../../deps.js';
import { access, lockCampaign, type Access } from '../campaigns/repository.js';
import { settingsOf, stateOf } from '../combat/api.js';
import { loadCombat, logTurn, saveState, turnChanged } from '../combat/repository.js';
import { snapshotOf } from '../combat/turn-log.js';
import { CampaignId, currentUser, eventContext, Uuid } from '../schemas.js';
import {
  applyDecisions,
  checkAttackVersion,
  dismissAttack,
  revertAttack,
  type ApplyInput,
} from './application.js';
import { characterFailure, withProblems } from './errors.js';
import { attackResolved, attackUpdated, type EventActor } from './events.js';
import {
  canReact,
  defaultVisibility,
  effectiveDice,
  implicitSlotActor,
  isOpen,
  outOfTurnOf,
  preparedTargets,
  resolvedTarget,
  statusAfterResolution,
  statusBeforeResolution,
} from './lifecycle.js';
import { attackFor, fullAttack, reactionView } from './redact.js';
import {
  attackNotFound,
  findByKeys,
  insertAttack,
  listAttacks,
  loadAttack,
  saveAttack,
  type LoadedAttack,
} from './repository.js';
import {
  attackViewer,
  checkDeclaration,
  requireActor,
  requireGm,
  type AttackViewer,
} from './rights.js';

const Params = z.object({ id: CampaignId });
const AttackParams = z.object({ id: CampaignId, attackId: Uuid('Identifiant d’attaque invalide') });

/** En-tête `Idempotency-Key` : une déclaration par clé (double clic, reprise réseau). */
function idempotencyKey(req: FastifyRequest): string | null {
  const raw = req.headers['idempotency-key'];
  if (raw === undefined) return null;
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key || key.length > 200)
    throw HttpError.badRequest('En-tête Idempotency-Key invalide', 'invalid_idempotency_key');
  return key;
}

type Declaration = z.output<typeof DeclareAttack>;

interface Prepared {
  body: Declaration;
  attackId: string;
  targetIds: string[];
  action: { id: string; name: string };
  rollMode: 'per_target' | 'shared';
  snapshot: unknown;
  visibility: 'public' | 'private' | 'gm';
  targets: ReturnType<typeof preparedTargets>;
  resolution: ActionResolution | null;
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  const viewerFor = async (req: FastifyRequest, campaignId: string) => {
    const userId = currentUser(req);
    const a = await access(db, campaignId, userId);
    return { a, userId, v: await attackViewer(db, a, userId) };
  };

  const respond = (l: LoadedAttack, v: AttackViewer) => {
    const view = attackFor(l, v);
    if (!view) throw attackNotFound();
    return view;
  };

  r.post(
    '/v1/campaigns/:id/attacks',
    { ...auth, schema: { params: Params, body: DeclareAttack, response: { 201: Attack } } },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        const [l] = await declare(deps, req, a, userId, v, [req.body], idempotencyKey(req));
        reply.code(201);
        return respond(l!, v);
      }),
  );

  r.post(
    '/v1/campaigns/:id/attacks/batch',
    {
      ...auth,
      schema: {
        params: Params,
        body: DeclareAttacks,
        response: { 201: z.object({ attacks: z.array(Attack) }) },
      },
    },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        requireGm(v);
        const loaded = await declare(
          deps,
          req,
          a,
          userId,
          v,
          req.body.attacks,
          idempotencyKey(req),
        );
        reply.code(201);
        return { attacks: loaded.map((l) => fullAttack(l)) };
      }),
  );

  r.get(
    '/v1/campaigns/:id/attacks',
    {
      ...auth,
      schema: { params: Params, querystring: ListAttacksQuery, response: { 200: AttackPage } },
    },
    async (req) => {
      const { a, userId, v } = await viewerFor(req, req.params.id);
      if (v.spectator) return { attacks: [], hasMore: false };
      const q = req.query;
      const page = await listAttacks(db, a.campaign.id, {
        ...(q.status ? { status: q.status } : {}),
        ...(q.combatId ? { combatId: q.combatId } : {}),
        ...(q.attackerId ? { attackerId: q.attackerId } : {}),
        ...(q.before ? { before: q.before } : {}),
        limit: q.limit ?? 50,
        ...(v.isGm ? {} : { player: { userId, played: [...v.played] } }),
      });
      return {
        attacks: page.attacks.flatMap((l) => {
          const view = attackFor(l, v);
          return view ? [view] : [];
        }),
        hasMore: page.hasMore,
      };
    },
  );

  r.get(
    '/v1/campaigns/:id/attacks/:attackId',
    { ...auth, schema: { params: AttackParams, response: { 200: Attack } } },
    async (req) => {
      const { a, v } = await viewerFor(req, req.params.id);
      const l = await loadAttack(db, a.campaign.id, req.params.attackId);
      if (!l) throw attackNotFound();
      return respond(l, v);
    },
  );

  r.post(
    '/v1/campaigns/:id/attacks/:attackId/reactions',
    { ...auth, schema: { params: AttackParams, body: AttackReaction, response: { 200: Attack } } },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        requireActor(v);
        const l = await react(deps, req, a, userId, v, req.params.attackId, req.body);
        // La dernière réaction résout l'attaque : son joueur garde la vue de sa cible
        return attackFor(l, v) ?? reactionView(l, v);
      }),
  );

  r.post(
    '/v1/campaigns/:id/attacks/:attackId/cancel',
    {
      ...auth,
      schema: { params: AttackParams, body: CancelAttack.default({}), response: { 200: Attack } },
    },
    async (req) => {
      const { a, userId, v } = await viewerFor(req, req.params.id);
      requireActor(v);
      const l = await db.transaction(async (tx) => {
        await lockCampaign(tx, a.campaign.id);
        const l = await loadAttack(tx, a.campaign.id, req.params.attackId, true);
        if (!l || !attackFor(l, v)) throw attackNotFound();
        if (!v.isGm && l.attack.createdBy !== userId && !v.played.has(l.attack.attackerId))
          throw HttpError.forbidden('Seuls l’auteur et le MJ abandonnent une attaque');
        checkAttackVersion(l, req.body.version);
        if (!isOpen(l.attack.status))
          throw HttpError.conflict('L’attaque est déjà résolue', 'already_resolved');
        const saved = await saveAttack(tx, l, {
          status: 'cancelled',
          snapshot: null,
          pendingSteps: [],
        });
        await attackUpdated(tx, eventContext(req), saved, { userId, role: a.role }, 'cancelled');
        return saved;
      });
      return respond(l, v);
    },
  );

  r.post(
    '/v1/campaigns/:id/attacks/apply',
    {
      ...auth,
      schema: {
        params: Params,
        body: ApplyAttacks,
        response: { 200: z.object({ attacks: z.array(Attack) }) },
      },
    },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        requireGm(v);
        const saved = await applyDecisions(
          deps,
          req,
          a,
          userId,
          req.body.items.map(({ attackId, ...input }) => ({
            attackId,
            input: input as ApplyInput,
          })),
        );
        return { attacks: saved.map((l) => fullAttack(l)) };
      }),
  );

  r.post(
    '/v1/campaigns/:id/attacks/:attackId/apply',
    { ...auth, schema: { params: AttackParams, body: ApplyAttack, response: { 200: Attack } } },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        requireGm(v);
        const [saved] = await applyDecisions(deps, req, a, userId, [
          { attackId: req.params.attackId, input: req.body as ApplyInput },
        ]);
        return fullAttack(saved!);
      }),
  );

  r.post(
    '/v1/campaigns/:id/attacks/:attackId/dismiss',
    { ...auth, schema: { params: AttackParams, body: DismissAttack, response: { 200: Attack } } },
    async (req) => {
      const { a, userId, v } = await viewerFor(req, req.params.id);
      requireGm(v);
      return fullAttack(await dismissAttack(db, req, a, userId, req.params.attackId, req.body));
    },
  );

  r.post(
    '/v1/campaigns/:id/attacks/:attackId/revert',
    { ...auth, schema: { params: AttackParams, body: RevertAttack, response: { 200: Attack } } },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        requireGm(v);
        return fullAttack(await revertAttack(deps, req, a, userId, req.params.attackId, req.body));
      }),
  );
};

/**
 * Déclare des attaques (une, ou un lot du MJ) : droits et cibles, tour, préparation par
 * character, résolution immédiate s'il n'y a aucune réaction à attendre, puis écriture de
 * toutes les attaques dans une transaction. Une clé d'idempotence rend les attaques déjà
 * déclarées avec elle, sans rien relancer (verrou consultatif pendant la déclaration).
 */
async function declare(
  deps: Deps,
  req: FastifyRequest,
  a: Access,
  userId: string,
  v: AttackViewer,
  bodies: Declaration[],
  key: string | null,
): Promise<LoadedAttack[]> {
  requireActor(v);
  const keys = key ? bodies.map((_, i) => (bodies.length > 1 ? `${key}#${i}` : key)) : null;
  const run = async (outer: Tx | null) => {
    if (keys) {
      const existing = await findByKeys(outer ?? deps.db, a.campaign.id, userId, keys);
      if (existing.length) return existing;
    }
    for (const b of bodies) checkDeclaration(v, b.attackerId, b.targets);
    const combat = await loadCombat(deps.db, a.campaign.id);
    const state = combat ? stateOf(combat.combat, combat.participants) : null;
    const settings = combat ? settingsOf(combat.combat) : DEFAULT_COMBAT_SETTINGS;
    if (!v.isGm && !settings.playersActOutsideTurn)
      for (const b of bodies)
        if (outOfTurnOf(state, b.attackerId))
          throw HttpError.conflict('Ce n’est pas le tour de ce personnage', 'not_their_turn');

    // Préparation (règles, instantané, réactions) puis résolution si rien n'est attendu
    const origin = { userId, campaignId: a.campaign.id, correlationId: req.ctx.correlationId };
    const prepared: Prepared[] = [];
    // Identifiants croissants dans l'ordre du lot (UUIDv7 d'une même milliseconde)
    const attackIds = bodies.map(() => uuidv7()).sort();
    for (const [i, body] of bodies.entries()) {
      const visibility = defaultVisibility(body.visibility, v.isGm, settings);
      const diceHistory = { campaignId: a.campaign.id, authorId: userId, visibility };
      const dice = effectiveDice(body.dice, settings);
      const common = {
        params: body.params ?? {},
        ...(body.adjustments ? { adjustments: body.adjustments } : {}),
        dice,
        diceHistory,
      };
      let p;
      try {
        p = await deps.character.prepareAction(
          {
            actorId: body.attackerId,
            action: body.action,
            targetIds: body.targets,
            ...(body.rollMode ? { rollMode: body.rollMode } : {}),
            userId,
            campaignId: a.campaign.id,
            ...common,
          },
          origin,
        );
      } catch (e) {
        throw characterFailure(e, req.log, 'préparation d’une attaque');
      }
      let resolution = p.resolution;
      const waiting =
        !resolution && (p.step || p.targets.some((t) => !t.error && t.reactionParams.length));
      if (!resolution && !waiting) {
        try {
          const resolved = await deps.character.resolveAction(
            {
              snapshot: p.snapshot,
              rollMode: p.rollMode,
              reactions: [],
              serverFallback: true,
              ...common,
            },
            origin,
          );
          resolution = resolved.resolution;
        } catch (e) {
          throw characterFailure(e, req.log, 'résolution d’une attaque');
        }
      }
      prepared.push({
        body,
        attackId: attackIds[i]!,
        targetIds: body.targets,
        action: p.action,
        rollMode: p.rollMode,
        snapshot: resolution ? null : p.snapshot,
        visibility,
        targets: preparedTargets(body.targets, p, resolution),
        resolution,
      });
    }

    const write = async (tx: Tx) => {
      const ctx = eventContext(req);
      const actor: EventActor = { userId, role: a.role };
      await lockCampaign(tx, a.campaign.id);
      let current = await loadCombat(tx, a.campaign.id, true);
      const out: LoadedAttack[] = [];
      for (const [i, p] of prepared.entries()) {
        let state = current ? stateOf(current.combat, current.participants) : null;
        // Mode slots : la première attaque d'un participant du camp le désigne acteur
        if (current && state && implicitSlotActor(state, p.body.attackerId)) {
          await logTurn(tx, current.combat, {
            reason: 'slot_actor',
            before: snapshotOf(state),
            userId,
          });
          state = { ...state, currentActorId: p.body.attackerId, turn: state.turn + 1 };
          current = await saveState(tx, { combat: current.combat, canGoBack: true }, state);
          await turnChanged(tx, ctx, current, actor, { reason: 'slot_actor' });
        }
        const resolved = p.resolution !== null;
        const status = resolved
          ? statusAfterResolution(p.targets)
          : statusBeforeResolution(p.targets);
        const l = await insertAttack(
          tx,
          {
            id: p.attackId,
            campaignId: a.campaign.id,
            combatId: current?.combat.id ?? null,
            round: current?.combat.round ?? null,
            turn: current?.combat.turn ?? null,
            attackerId: p.body.attackerId,
            actionId: p.action.id,
            actionName: p.action.name,
            params: p.body.params ?? {},
            rollMode: p.rollMode,
            dice: 'server',
            visibility: p.visibility,
            status,
            outOfTurn: outOfTurnOf(state, p.body.attackerId),
            selfTarget: p.targetIds.includes(p.body.attackerId),
            origin: p.body.origin ?? null,
            presetId: p.body.presetId ?? null,
            adjustments: p.body.adjustments ?? null,
            actor: p.resolution
              ? {
                  modifications: p.resolution.actor.modifications,
                  decision: 'pending',
                  applied: null,
                }
              : null,
            snapshot: p.snapshot ?? null,
            idempotencyKey: keys?.[i] ?? null,
            createdBy: userId,
            resolvedAt: resolved ? new Date() : null,
          },
          p.targets,
        );
        if (resolved) {
          await attackUpdated(tx, ctx, l, actor, status === 'failed' ? 'failed' : 'resolved');
          await attackResolved(tx, ctx, l, actor);
        } else
          await attackUpdated(
            tx,
            ctx,
            l,
            actor,
            status === 'awaiting_reactions' ? 'reaction_requested' : 'dice_requested',
          );
        out.push(l);
      }
      return out;
    };
    return outer ? write(outer) : deps.db.transaction(write);
  };
  if (!keys) return run(null);
  // Deux requêtes de même clé : la seconde attend la première, puis rend son attaque
  return deps.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`attack:${a.campaign.id}:${userId}:${keys[0]}`}))`,
    );
    return run(tx);
  });
}

/**
 * Réaction d'une cible (défense active) ; la dernière attendue lance la résolution. Le statut
 * `awaiting_dice` marque la résolution en cours : une seule, même si deux cibles répondent en
 * même temps. En cas de panne de character, l'attaque revient en attente des réactions (une
 * nouvelle réponse relance la résolution).
 */
async function react(
  deps: Deps,
  req: FastifyRequest,
  a: Access,
  userId: string,
  v: AttackViewer,
  attackId: string,
  body: z.output<typeof AttackReaction>,
): Promise<LoadedAttack> {
  const { db } = deps;
  const actor: EventActor = { userId, role: a.role };
  const first = await db.transaction(async (tx) => {
    await lockCampaign(tx, a.campaign.id);
    const l = await loadAttack(tx, a.campaign.id, attackId, true);
    if (!l || !attackFor(l, v)) throw attackNotFound();
    const target = l.targets.find((t) => t.characterId === body.characterId);
    if (!target) throw HttpError.badRequest('Cette cible n’est pas visée', 'unknown_target');
    if (!v.isGm && !v.played.has(target.characterId))
      throw HttpError.forbidden('Seul le joueur qui incarne la cible (ou le MJ) réagit');
    checkAttackVersion(l, body.version);
    if (l.attack.status !== 'awaiting_reactions' || !canReact(target))
      throw HttpError.conflict('Aucune réaction attendue de cette cible', 'reaction_not_expected');
    const params: ActionParams = body.skip ? {} : (body.params ?? {});
    const unknown = Object.keys(params).filter((k) => !target.reactionParams.includes(k));
    if (unknown.length)
      throw HttpError.badRequest(
        `Paramètres de réaction inconnus : ${unknown.join(', ')}`,
        'unknown_reaction_param',
      );
    const targets = l.targets.map((t) =>
      t === target
        ? {
            ...t,
            status: 'awaiting_dice' as const,
            reaction: { params, skipped: body.skip === true, answeredBy: userId },
          }
        : t,
    );
    const allIn = targets.filter(canReact).every((t) => t.reaction);
    const saved = await saveAttack(tx, l, allIn ? { status: 'awaiting_dice' } : {}, targets);
    await attackUpdated(tx, eventContext(req), saved, actor, 'reaction_received');
    return { saved, allIn };
  });
  if (!first.allIn) return first.saved;

  const l = first.saved;
  let resolution: ActionResolution | null;
  try {
    const visibility = l.attack.visibility;
    const r = await deps.character.resolveAction(
      {
        snapshot: l.attack.snapshot,
        params: l.attack.params,
        rollMode: l.attack.rollMode,
        ...(l.attack.adjustments ? { adjustments: l.attack.adjustments } : {}),
        dice: 'server',
        reactions: l.targets
          .filter((t) => t.reaction)
          .map((t) => ({
            characterId: t.characterId,
            params: t.reaction!.params,
            skipped: t.reaction!.skipped,
          })),
        serverFallback: true,
        diceHistory: { campaignId: a.campaign.id, authorId: l.attack.createdBy, visibility },
      },
      { userId, campaignId: a.campaign.id, correlationId: req.ctx.correlationId },
    );
    resolution = r.resolution;
    if (!resolution) throw new Error('character n’a rendu ni résolution ni étape de dés');
  } catch (e) {
    // Résolution impossible : l'attaque revient en attente des réactions
    await db.transaction(async (tx) => {
      await lockCampaign(tx, a.campaign.id);
      const current = await loadAttack(tx, a.campaign.id, attackId, true);
      if (current?.attack.status !== 'awaiting_dice' || current.attack.version !== l.attack.version)
        return;
      const saved = await saveAttack(tx, current, { status: 'awaiting_reactions' });
      await attackUpdated(tx, eventContext(req), saved, actor, 'reaction_requested');
    });
    throw characterFailure(e, req.log, 'résolution d’une attaque');
  }

  return db.transaction(async (tx) => {
    const ctx = eventContext(req);
    await lockCampaign(tx, a.campaign.id);
    const current = await loadAttack(tx, a.campaign.id, attackId, true);
    if (!current) throw attackNotFound();
    // Abandonnée pendant la résolution : le résultat est écarté
    if (current.attack.status !== 'awaiting_dice' || current.attack.version !== l.attack.version)
      return current;
    const targets = current.targets.map((t) =>
      t.status === 'failed' ? t : resolvedTarget(t, resolution!),
    );
    const status = statusAfterResolution(targets);
    const saved = await saveAttack(
      tx,
      current,
      {
        status,
        snapshot: null,
        actor: {
          modifications: resolution!.actor.modifications,
          decision: 'pending',
          applied: null,
        },
        resolvedAt: new Date(),
      },
      targets,
    );
    await attackUpdated(tx, ctx, saved, actor, status === 'failed' ? 'failed' : 'resolved');
    await attackResolved(tx, ctx, saved, actor);
    return saved;
  });
}
