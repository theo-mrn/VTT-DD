/**
 * Module « attacks » : attaques et rapports (docs/combat.md § 5 à § 9), en combat ou hors
 * combat. Une attaque avance par étapes de dés (§ 6) : le jet (TOUCHÉ ou RATÉ par cible), puis
 * les dégâts des seules cibles touchées, puis la table ; l'attaquant lance chaque étape
 * (`…/dice` : faces lues sur les dés 3D, ou tirées par le serveur). Le lot du MJ enchaîne ses
 * étapes seul (`autoRoll`).
 *
 *   POST /v1/campaigns/:id/attacks                        DeclareAttack    déclarer (201)
 *   POST /v1/campaigns/:id/attacks/batch                  DeclareAttacks   à la suite (MJ, 201)
 *   GET  /v1/campaigns/:id/attacks                        ListAttacksQuery liste filtrée
 *   GET  /v1/campaigns/:id/attacks/:attackId                               une attaque, filtrée
 *   POST /v1/campaigns/:id/attacks/:attackId/reactions    AttackReaction   défense active
 *   POST /v1/campaigns/:id/attacks/:attackId/dice         SubmitRollDice   étape de dés lancée
 *   POST /v1/campaigns/:id/attacks/:attackId/cancel       CancelAttack     abandon
 *   POST /v1/campaigns/:id/attacks/:attackId/apply        ApplyAttack      décision (MJ)
 *   POST /v1/campaigns/:id/attacks/apply                  ApplyAttacks     revue groupée (MJ)
 *   POST /v1/campaigns/:id/attacks/:attackId/dismiss      DismissAttack    écarter (MJ)
 *   POST /v1/campaigns/:id/attacks/:attackId/revert       RevertAttack     annuler (MJ)
 *
 * Résolution par character (routes internes, § 11.2) : `prepare` vérifie les règles, fige
 * l'instantané, propose les réactions et rend la première étape ; `resolve` rejoue les faces
 * gardées ici (`faces`), ajoute celles de l'étape et rend la suivante (avec l'issue déjà
 * exacte de chaque cible), ou, cible par cible, le rapport complet (MJ) et la vue de
 * l'attaquant. Rien n'est appliqué sans décision du MJ.
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
  SubmitRollDice,
  uuidv7,
  type ActionParams,
  type AttackChange,
  type RollStep,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  ActionResolution,
  AttackRollsInput,
  KnownFace,
  ResolvedAction,
  ResolveInput,
} from '../../clients/character.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import type { Deps, Module } from '../../deps.js';
import { access, lockCampaign, type Access } from '../campaigns/repository.js';
import { settingsOf, stateOf } from '../combat/api.js';
import { loadCombat, logTurn, saveState, turnChanged } from '../combat/repository.js';
import { combatContextOf, rowsOfDeclaration, type TallyRow } from '../combat/tally.js';
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
  isResolving,
  outOfTurnOf,
  preparedTargets,
  reportedTargets,
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
  /** Première étape de dés à lancer ; null : résolue, ou en attente des réactions. */
  step: RollStep | null;
  faces: KnownFace[];
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
        const [l] = await declare(deps, req, a, userId, v, [req.body], idempotencyKey(req), {
          autoRoll: false,
        });
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
        // Lot du MJ : les étapes de dés s'enchaînent seules (pas de clic par PNJ)
        const loaded = await declare(
          deps,
          req,
          a,
          userId,
          v,
          req.body.attacks,
          idempotencyKey(req),
          { autoRoll: true },
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
    '/v1/campaigns/:id/attacks/:attackId/dice',
    { ...auth, schema: { params: AttackParams, body: SubmitRollDice, response: { 200: Attack } } },
    async (req, reply) =>
      withProblems(req, reply, async () => {
        const { a, userId, v } = await viewerFor(req, req.params.id);
        requireActor(v);
        return respond(await rollStep(deps, req, a, userId, v, req.params.attackId, req.body), v);
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
          resolvingSince: null,
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
 * character (première étape de dés, ou résolution d'une action sans dé), puis écriture de
 * toutes les attaques dans une transaction. `autoRoll` (lot du MJ) : les étapes s'enchaînent
 * seules, le serveur tire tout. Une clé d'idempotence rend les attaques déjà déclarées avec
 * elle, sans rien relancer (verrou consultatif pendant la déclaration).
 */
async function declare(
  deps: Deps,
  req: FastifyRequest,
  a: Access,
  userId: string,
  v: AttackViewer,
  bodies: Declaration[],
  key: string | null,
  mode: { autoRoll: boolean },
): Promise<LoadedAttack[]> {
  requireActor(v);
  const keys = key ? bodies.map((_, i) => (bodies.length > 1 ? `${key}#${i}` : key)) : null;
  /** Jets des attaques calculées par le navigateur, relayés à l'historique après l'écriture. */
  const forwards: AttackRollsInput[] = [];
  const run = async (outer: Tx | null) => {
    if (keys) {
      const existing = await findByKeys(outer ?? deps.db, a.campaign.id, userId, keys);
      if (existing.length) return existing;
    }
    for (const b of bodies) checkDeclaration(v, b.attackerId, b.targets);
    const combat = await loadCombat(deps.db, a.campaign.id);
    const state = combat ? stateOf(combat.combat, combat.participants) : null;
    // Situation du combat (§ 5.7) : décompte des attaques déjà déclarées, celles du lot comprises
    const tallies: TallyRow[] = [...(combat?.tallies ?? [])];
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
      // Attaque déjà calculée par le navigateur de l'attaquant (Théo, 2026-09-30) : le
      // rapport est rangé tel quel, en attente du MJ ; rien n'est demandé à character
      if (body.resolved) {
        const resolution = reportOf(body);
        const valid = resolution.targets.filter((t) => t.status !== 'failed');
        if (state)
          tallies.push(
            ...rowsOfDeclaration(
              state.round,
              body.attackerId,
              valid.map((t) => t.characterId),
            ),
          );
        prepared.push({
          body,
          attackId: attackIds[i]!,
          targetIds: body.targets,
          action: { id: body.action, name: body.resolved.actionName },
          rollMode: body.rollMode ?? 'per_target',
          snapshot: null,
          visibility,
          targets: reportedTargets(body.targets, resolution),
          resolution,
          step: null,
          faces: [],
        });
        if (valid.length)
          forwards.push({
            campaignId: a.campaign.id,
            authorId: userId,
            characterId: body.attackerId,
            visibility,
            action: body.action,
            rollMode: body.rollMode ?? 'per_target',
            views: valid.flatMap((t) => (t.view ? [t.view] : [])),
          });
        continue;
      }
      const combatContext = combatContextOf(state, tallies, body.attackerId, body.targets);
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
            ...(combatContext ? { combat: combatContext } : {}),
          },
          origin,
        );
      } catch (e) {
        throw characterFailure(e, req.log, 'préparation d’une attaque');
      }
      if (state)
        tallies.push(
          ...rowsOfDeclaration(
            state.round,
            body.attackerId,
            p.targets.filter((t) => !t.error).map((t) => t.characterId),
          ),
        );
      let resolution = p.resolution;
      let step = resolution ? null : p.step;
      let faces: KnownFace[] = [];
      const reacting = p.targets.some((t) => !t.error && t.reactionParams.length);
      // Lot du MJ : tout est tiré d'un coup ; sinon l'attaquant lance la première étape
      if (!resolution && !reacting && (mode.autoRoll || !step)) {
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
          resolution = resolved.step ? null : resolved.resolution;
          step = resolved.step;
          faces = resolved.faces;
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
        step,
        faces,
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
            faces: p.faces,
            pendingSteps: p.step ? [p.step] : [],
            autoRoll: mode.autoRoll,
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
  const loaded = !keys
    ? await run(null)
    : // Deux requêtes de même clé : la seconde attend la première, puis rend son attaque
      await deps.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`attack:${a.campaign.id}:${userId}:${keys[0]}`}))`,
        );
        return run(tx);
      });
  // Historique des dés : jamais bloquant, une panne est journalisée (l'attaque est enregistrée)
  const origin = { userId, campaignId: a.campaign.id, correlationId: req.ctx.correlationId };
  for (const f of forwards)
    void deps.character
      .forwardAttackRolls(f, origin)
      .catch((e: unknown) => req.log.warn({ err: e }, 'jet d’attaque non transmis à dice'));
  return loaded;
}

/**
 * Rapport d'une attaque calculée par le navigateur (`DeclareAttack.resolved`), vérifié : les
 * mêmes cibles que la déclaration, dans le même ordre ; une cible résolue porte son rapport et
 * la vue de l'attaquant, une cible refusée son message.
 */
function reportOf(body: Declaration): ActionResolution {
  const r = body.resolved!;
  const invalid = (detail: string) => HttpError.badRequest(detail, 'invalid_resolution');
  if (
    r.targets.length !== body.targets.length ||
    r.targets.some((t, i) => t.characterId !== body.targets[i])
  )
    throw invalid('Le rapport doit porter les cibles de la déclaration, dans le même ordre');
  return {
    targets: r.targets.map((t) => {
      if (t.status === 'resolved' && (!t.result || !t.view))
        throw invalid(`Rapport ou vue manquant pour la cible ${t.characterId}`);
      return t.status === 'resolved'
        ? {
            characterId: t.characterId,
            status: 'resolved',
            error: null,
            result: t.result!,
            view: t.view!,
          }
        : {
            characterId: t.characterId,
            status: 'failed',
            error: t.error ?? 'Cible refusée',
            result: null,
            view: null,
          };
    }),
    actor: { modifications: r.actor?.modifications ?? [] },
  };
}

/**
 * Réaction d'une cible (défense active) ; la dernière attendue lance la résolution (la
 * première étape de dés, ou tout d'un coup pour le lot du MJ). Pendant ce temps l'attaque est
 * « en résolution » (`resolvingSince`) : une seule, même si deux cibles répondent en même
 * temps. En cas de panne de character, l'attaque revient en attente des réactions (une
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
    const saved = await saveAttack(
      tx,
      l,
      allIn ? { status: 'awaiting_dice', resolvingSince: new Date() } : {},
      targets,
    );
    await attackUpdated(tx, eventContext(req), saved, actor, 'reaction_received');
    return { saved, allIn };
  });
  if (!first.allIn) return first.saved;

  return resolveNext(deps, req, a, actor, first.saved, {
    serverFallback: first.saved.attack.autoRoll,
    change: 'dice_requested',
    // Résolution impossible : l'attaque revient en attente des réactions
    onFailure: async (tx, current) => {
      const saved = await saveAttack(tx, current, {
        status: 'awaiting_reactions',
        resolvingSince: null,
      });
      await attackUpdated(tx, eventContext(req), saved, actor, 'reaction_requested');
    },
  });
}

/**
 * Étape de dés lancée (`…/dice`) : par l'auteur (ou le joueur qui incarne l'attaquant), le MJ
 * à sa place, ou pour une étape `roller: target` le joueur de la cible. Faces lues sur les dés
 * 3D (`results`) ; un dé absent est tiré par le serveur ; `serverFallback` : tout le reste
 * aussi. Étape déjà passée : 409 `step_outdated` ; résolution déjà en cours : 409
 * `resolution_in_progress` ; face invalide : 400 `invalid_physical_result`, rien ne bouge.
 */
async function rollStep(
  deps: Deps,
  req: FastifyRequest,
  a: Access,
  userId: string,
  v: AttackViewer,
  attackId: string,
  body: z.output<typeof SubmitRollDice>,
): Promise<LoadedAttack> {
  const actor: EventActor = { userId, role: a.role };
  const { marked, step } = await deps.db.transaction(async (tx) => {
    await lockCampaign(tx, a.campaign.id);
    const l = await loadAttack(tx, a.campaign.id, attackId, true);
    if (!l || !attackFor(l, v)) throw attackNotFound();
    const step = l.attack.pendingSteps.find((s) => s.id === body.stepId);
    const allowed =
      v.isGm ||
      ((step?.roller ?? 'author') === 'author'
        ? l.attack.createdBy === userId || v.played.has(l.attack.attackerId)
        : !!step?.targetId && v.played.has(step.targetId));
    if (!allowed) throw HttpError.forbidden('Seuls le lanceur de l’étape et le MJ lancent ces dés');
    if (l.attack.status !== 'awaiting_dice' || !step)
      throw HttpError.conflict('Cette étape de dés est déjà passée', 'step_outdated');
    if (isResolving(l.attack))
      throw HttpError.conflict(
        'Les dés précédents sont en cours de résolution',
        'resolution_in_progress',
      );
    // Paramètres de l'étape (l'arme, une fois une cible touchée) : tous ceux qu'elle demande
    const asked = step.params ?? [];
    const given = Object.keys(body.params ?? {});
    if (given.some((k) => !asked.includes(k)) || asked.some((k) => !given.includes(k)))
      throw HttpError.badRequest(
        `Paramètres attendus pour cette étape : ${asked.join(', ') || 'aucun'}`,
        'invalid_step_params',
      );
    const dice = new Map(step.dice.map((d) => [d.id, d]));
    for (const r of body.results) {
      const d = dice.get(r.id);
      if (!d)
        throw HttpError.badRequest(`Dé inconnu de l’étape : ${r.id}`, 'invalid_physical_result');
      if (r.value > d.faces)
        throw HttpError.badRequest(
          `Face ${r.value} hors de 1..${d.faces} (dé ${r.id})`,
          'invalid_physical_result',
        );
    }
    return { marked: await saveAttack(tx, l, { resolvingSince: new Date() }), step };
  });
  return resolveNext(deps, req, a, actor, marked, {
    step,
    results: body.results,
    ...(body.params && step.params?.length ? { stepParams: body.params } : {}),
    serverFallback: body.serverFallback === true || marked.attack.autoRoll,
    change: 'dice_rolled',
    // Panne de character : l'étape reste à lancer, rien n'a bougé
    onFailure: async (tx, current) => {
      await saveAttack(tx, current, { resolvingSince: null });
    },
  });
}

/**
 * Résolution par character d'une attaque marquée « en résolution » (`marked`), hors de toute
 * transaction : l'étape suivante (l'issue de l'étape passée devient visible), ou le rapport.
 * Abandonnée ou changée entre-temps : le résultat est écarté.
 */
async function resolveNext(
  deps: Deps,
  req: FastifyRequest,
  a: Access,
  actor: EventActor,
  marked: LoadedAttack,
  o: {
    step?: RollStep;
    results?: { id: string; value: number }[];
    /** Paramètres choisis avec l'étape, gardés avec l'attaque une fois la suite résolue. */
    stepParams?: ActionParams;
    serverFallback: boolean;
    change: AttackChange;
    onFailure: (tx: Tx, current: LoadedAttack) => Promise<void>;
  },
): Promise<LoadedAttack> {
  const { db } = deps;
  const at = marked.attack;
  const same = (current: LoadedAttack | null): current is LoadedAttack =>
    current?.attack.status === 'awaiting_dice' && current.attack.version === at.version;
  let resolved: ResolvedAction;
  try {
    const input: ResolveInput = {
      snapshot: at.snapshot,
      params: at.params,
      rollMode: at.rollMode,
      ...(at.adjustments ? { adjustments: at.adjustments } : {}),
      dice: at.dice,
      reactions: marked.targets
        .filter((t) => t.reaction)
        .map((t) => ({
          characterId: t.characterId,
          params: t.reaction!.params,
          skipped: t.reaction!.skipped,
        })),
      faces: at.faces.map((f) => ({
        id: f.id,
        value: f.value,
        ...(f.source === 'physical' || f.source === 'server' ? { source: f.source } : {}),
      })),
      ...(o.step ? { step: o.step, results: o.results ?? [] } : {}),
      ...(o.stepParams ? { stepParams: o.stepParams } : {}),
      ...(o.serverFallback ? { serverFallback: true } : {}),
      diceHistory: {
        campaignId: a.campaign.id,
        authorId: at.createdBy,
        visibility: at.visibility,
      },
    };
    resolved = await deps.character.resolveAction(input, {
      userId: actor.userId,
      campaignId: a.campaign.id,
      correlationId: req.ctx.correlationId,
    });
    if (!resolved.step && !resolved.resolution)
      throw new Error('character n’a rendu ni résolution ni étape de dés');
  } catch (e) {
    await db.transaction(async (tx) => {
      await lockCampaign(tx, a.campaign.id);
      const current = await loadAttack(tx, a.campaign.id, at.id, true);
      if (same(current)) await o.onFailure(tx, current);
    });
    throw characterFailure(e, req.log, 'résolution d’une attaque');
  }

  return db.transaction(async (tx) => {
    await lockCampaign(tx, a.campaign.id);
    const current = await loadAttack(tx, a.campaign.id, at.id, true);
    if (!current) throw attackNotFound();
    if (!same(current)) return current;
    // L'arme choisie à l'étape des dégâts rejoint les paramètres de l'attaque (rapport du MJ)
    const params = o.stepParams ? { ...current.attack.params, ...o.stepParams } : null;
    return recordResolution(tx, eventContext(req), current, resolved, actor, o.change, params);
  });
}

/**
 * Réponse de character enregistrée : l'étape suivante (les cibles portent l'issue déjà
 * exacte : TOUCHÉ ou RATÉ avant les dégâts), ou le rapport complet.
 */
async function recordResolution(
  tx: Tx,
  ctx: EventContext,
  current: LoadedAttack,
  r: ResolvedAction,
  actor: EventActor,
  change: AttackChange,
  params: ActionParams | null = null,
): Promise<LoadedAttack> {
  const resolution = r.resolution;
  const withParams = params ? { params } : {};
  const targets = resolution
    ? current.targets.map((t) => (t.status === 'failed' ? t : resolvedTarget(t, resolution)))
    : current.targets;
  if (r.step) {
    const saved = await saveAttack(
      tx,
      current,
      {
        status: 'awaiting_dice',
        pendingSteps: [r.step],
        faces: r.faces,
        resolvingSince: null,
        ...withParams,
      },
      targets,
    );
    await attackUpdated(tx, ctx, saved, actor, change);
    return saved;
  }
  const status = statusAfterResolution(targets);
  const saved = await saveAttack(
    tx,
    current,
    {
      status,
      ...withParams,
      snapshot: null,
      pendingSteps: [],
      faces: r.faces,
      resolvingSince: null,
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
}
