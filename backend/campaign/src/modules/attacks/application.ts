/**
 * Décisions du MJ sur les rapports (docs/combat.md § 7) : appliquer (tel quel, corrigé,
 * réattribué), ne pas appliquer, écarter, annuler une application, revue groupée.
 *
 * Appliquer n'est jamais relancer : les modifications du rapport, ou celles corrigées par le MJ,
 * partent à character avec un `applicationId` (UUIDv7), qui les écrit dans une transaction,
 * sans aucun dé, et une seule fois par identifiant.
 *
 * Déroulé d'une application (tout ou rien, même pour un lot) :
 *  1. transaction : verrou, versions, décisions permises ; l'application est réservée
 *     (`applying`), ce qui interdit une seconde décision concurrente sur la même attaque ;
 *  2. character applique (idempotent) ; refus ou panne : la réservation est effacée ;
 *  3. transaction : décisions, ce qui a été appliqué, hors de combat, événements.
 * Une réservation restée `applying` (panne entre 2 et 3) est reprise à la décision suivante :
 * elle est renvoyée à character avec le même identifiant, puis terminée.
 */
import {
  uuidv7,
  type AttackAppliedTarget,
  type AttackModification,
  type AttackModificationInput,
  type AttackTableChoice,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import {
  CharacterError,
  type AppliedModifications,
  type ApplicationItem,
  type CharacterClient,
} from '../../clients/character.js';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import type { ApplicationDecision } from '../../db/schema.js';
import { lockCampaign, type Access } from '../campaigns/repository.js';
import { stateOf } from '../combat/api.js';
import {
  combatEvent,
  engagedOrThrow,
  loadCombat,
  saveState,
  turnChanged,
} from '../combat/repository.js';
import { updateParticipant } from '../combat/turns.js';
import { eventContext } from '../schemas.js';
import { characterFailure } from './errors.js';
import { attackDecided, attackReverted, attackUpdated, type EventActor } from './events.js';
import { actorUndecided, statusAfterDecision, undecided } from './lifecycle.js';
import {
  applicationsOf,
  attackNotFound,
  deleteApplications,
  insertApplication,
  loadAttack,
  lockAttacks,
  lockAttacksOfCombat,
  saveAttack,
  updateApplication,
  type ApplicationRow,
  type LoadedAttack,
  type TargetRow,
} from './repository.js';

/** Décision envoyée pour une attaque (`ApplyAttack`, ou un élément de `ApplyAttacks`). */
export interface ApplyInput {
  version: number;
  targets: {
    characterId: string;
    apply: boolean;
    modifications?: AttackModificationInput[];
    tables?: AttackTableChoice[];
    redirectTo?: string;
  }[];
  actor?: { apply: boolean; modifications?: AttackModificationInput[] };
  note?: string;
}

interface Plan {
  loaded: LoadedAttack;
  /** Null : rien d'appliqué (seulement « ne pas appliquer »). */
  applicationId: string | null;
  decisions: ApplicationDecision[];
  items: ApplicationItem[];
  note: string | undefined;
}

/** Une réservation plus vieille que ce délai est une application abandonnée (panne). */
const STALE_MS = 30_000;

const versionConflict = () =>
  HttpError.conflict('Le rapport a changé entre-temps : rechargez-le', 'version_conflict');

export const checkAttackVersion = (l: LoadedAttack, expected: number | undefined) => {
  if (expected !== undefined && expected !== l.attack.version) throw versionConflict();
};

/** Refus d'une décision sur un rapport qui n'attend pas le MJ. */
export function requirePending(l: LoadedAttack) {
  const s = l.attack.status;
  if (s === 'pending') return;
  if (s === 'awaiting_reactions' || s === 'awaiting_dice')
    throw HttpError.conflict('L’attaque n’est pas encore résolue', 'not_resolved');
  if (s === 'applied' || s === 'dismissed')
    throw HttpError.conflict('Toutes les cibles sont déjà décidées', 'already_decided');
  throw HttpError.conflict(
    `Attaque ${s === 'cancelled' ? 'abandonnée' : 'refusée'}`,
    'not_pending',
  );
}

const inFlight = () =>
  HttpError.conflict('Une application de ce rapport est en cours', 'apply_in_progress');

/** Modification envoyée à character : sans `entity`, ni détail des résistances. */
function toInput(m: AttackModification | AttackModificationInput): AttackModificationInput {
  if (m.kind === 'attribute')
    return {
      kind: 'attribute',
      attribute: m.attribute,
      operation: m.operation,
      value: m.value,
      ...(m.damageType ? { damageType: m.damageType } : {}),
    };
  return {
    kind: 'entry',
    entry: m.entry,
    operation: m.operation,
    ranks: m.ranks,
    ...(m.duration !== undefined ? { duration: m.duration } : {}),
    ...(m.instance !== undefined ? { instance: m.instance } : {}),
  };
}

const withEntity = (m: AttackModificationInput, entity: 'actor' | 'target'): AttackModification =>
  ({ ...toInput(m), entity }) as AttackModification;

/** Modifications par fiche, dans l'ordre d'arrivée (une fiche peut revenir : auto-attaque). */
class Items {
  private readonly byId = new Map<string, ApplicationItem>();
  add(
    characterId: string,
    mods: AttackModificationInput[],
    tables: ApplicationItem['tables'] = [],
  ) {
    if (!mods.length && !tables?.length) return;
    const item = this.byId.get(characterId) ?? { characterId, modifications: [], tables: [] };
    item.modifications.push(...mods.map(toInput));
    item.tables!.push(...(tables ?? []));
    this.byId.set(characterId, item);
  }
  list = () =>
    [...this.byId.values()].map((i) => (i.tables?.length ? i : { ...i, tables: undefined }));
}

/** Plan en construction : l'attaque, les modifications par fiche, qui applique et quand. */
interface PlanContext {
  l: LoadedAttack;
  items: Items;
  stamp: { applicationId: string; userId: string; now: string };
}

/** Trace d'une application, pour une cible ou pour l'attaquant. */
function appliedOf(
  stamp: PlanContext['stamp'],
  modifications: AttackModification[],
  tables: AttackAppliedTarget['tables'],
  redirectedTo: string | null,
): AttackAppliedTarget {
  return {
    applicationId: stamp.applicationId,
    modifications,
    tables,
    redirectedTo,
    defeated: false,
    appliedBy: stamp.userId,
    appliedAt: stamp.now,
  };
}

/** Cible d'une décision : au rapport, résolue si elle est appliquée, pas encore décidée. */
function decidedTarget(l: LoadedAttack, d: ApplyInput['targets'][number]): TargetRow {
  const t = l.targets.find((x) => x.characterId === d.characterId);
  if (!t)
    throw HttpError.badRequest(`Cible absente du rapport : ${d.characterId}`, 'unknown_target');
  if (d.apply && t.status !== 'resolved')
    throw HttpError.conflict(
      `Cible non résolue (refusée par les règles) : ${d.characterId}`,
      'target_not_resolved',
    );
  if (t.status === 'resolved' && !undecided(t))
    throw HttpError.conflict(`Cible déjà décidée : ${d.characterId}`, 'already_decided');
  return t;
}

/** Tables tirées appliquées à une cible : celles choisies par le MJ, sinon toutes. */
function appliedTables(
  d: ApplyInput['targets'][number],
  result: TargetRow['result'],
): AttackAppliedTarget['tables'] {
  const drawn = result?.tables ?? [];
  const choices: AttackTableChoice[] =
    d.tables ?? drawn.map((x) => ({ table: x.table, apply: true }));
  const tables: AttackAppliedTarget['tables'] = [];
  for (const c of choices) {
    const draw = drawn.find((x) => x.table === c.table);
    if (!draw)
      throw HttpError.badRequest(`Table non tirée pour cette cible : ${c.table}`, 'unknown_table');
    if (!c.apply) continue;
    const entry = c.entry ?? draw.line?.entry ?? null;
    if (entry) tables.push({ table: c.table, entry });
  }
  return tables;
}

/** Décision pour une cible : ses modifications (et celles de l'attaquant) partent à character. */
function targetDecision(ctx: PlanContext, d: ApplyInput['targets'][number]): ApplicationDecision {
  const { l, items, stamp } = ctx;
  const attackerId = l.attack.attackerId;
  const t = decidedTarget(l, d);
  if (!d.apply)
    return {
      targetId: t.characterId,
      apply: false,
      characterIds: [],
      applied: null,
      reverted: false,
    };
  const result = t.result;
  const dest = d.redirectTo ?? t.characterId;
  const mods: AttackModification[] = d.modifications
    ? d.modifications.map((m) => withEntity(m, 'target'))
    : (result?.modifications ?? []);
  const toTarget = mods.filter((m) => m.entity === 'target');
  const toActor = mods.filter((m) => m.entity === 'actor');
  const tables = appliedTables(d, result);
  items.add(dest, toTarget.map(toInput), tables);
  items.add(attackerId, toActor.map(toInput));
  return {
    targetId: t.characterId,
    apply: true,
    characterIds: [...new Set([dest, ...(toActor.length ? [attackerId] : [])])],
    applied: appliedOf(stamp, mods, tables, d.redirectTo ?? null),
    reverted: false,
  };
}

/** Décision pour les coûts de l'attaquant. */
function actorDecision(
  ctx: PlanContext,
  input: NonNullable<ApplyInput['actor']>,
): ApplicationDecision {
  const { l, items, stamp } = ctx;
  const attackerId = l.attack.attackerId;
  const actor = l.attack.actor;
  if (actor && !actorUndecided(actor) && actor.modifications.length)
    throw HttpError.conflict('Coûts de l’attaquant déjà décidés', 'already_decided');
  if (!input.apply)
    return { targetId: null, apply: false, characterIds: [], applied: null, reverted: false };
  const mods: AttackModification[] = input.modifications
    ? input.modifications.map((m) => withEntity(m, 'actor'))
    : (actor?.modifications ?? []);
  items.add(attackerId, mods.map(toInput));
  return {
    targetId: null,
    apply: true,
    characterIds: [attackerId],
    applied: appliedOf(stamp, mods, [], null),
    reverted: false,
  };
}

/** Plan d'une décision : ce qui part à character, ce qui est enregistré pour chaque cible. */
function planOf(l: LoadedAttack, input: ApplyInput, userId: string): Plan {
  const now = new Date().toISOString();
  const applicationId = uuidv7();
  const ctx: PlanContext = { l, items: new Items(), stamp: { applicationId, userId, now } };
  const decisions: ApplicationDecision[] = [];
  for (const d of input.targets) decisions.push(targetDecision(ctx, d));
  if (input.actor) decisions.push(actorDecision(ctx, input.actor));
  const any = decisions.some((d) => d.apply);
  return {
    loaded: l,
    applicationId: any ? applicationId : null,
    decisions,
    items: ctx.items.list(),
    note: input.note,
  };
}

/**
 * Enregistre des décisions : cibles et coûts de l'attaquant, statut, application terminée,
 * événements. `defeated` : fiches hors de combat d'après la réponse de character.
 */
async function finalize(
  tx: Tx,
  ctx: EventContext,
  actor: EventActor,
  l: LoadedAttack,
  e: {
    applicationId: string | null;
    decisions: ApplicationDecision[];
    note: string | null | undefined;
    defeated: Map<string, boolean>;
  },
): Promise<LoadedAttack> {
  const targets: TargetRow[] = l.targets.map((t) => {
    const d = e.decisions.find((x) => x.targetId === t.characterId);
    if (!d) return t;
    if (!d.apply) return { ...t, decision: 'skipped', applied: null };
    const dest = d.applied!.redirectedTo ?? t.characterId;
    return {
      ...t,
      decision: 'applied',
      applied: { ...d.applied!, defeated: e.defeated.get(dest) ?? false },
    };
  });
  const actorDecision = e.decisions.find((d) => d.targetId === null);
  let attackActor = l.attack.actor ?? null;
  if (actorDecision)
    attackActor = {
      modifications: attackActor?.modifications ?? [],
      decision: actorDecision.apply ? 'applied' : 'skipped',
      applied: actorDecision.apply
        ? {
            ...actorDecision.applied!,
            defeated: e.defeated.get(l.attack.attackerId) ?? false,
          }
        : null,
    };
  const status = statusAfterDecision(targets, attackActor);
  const saved = await saveAttack(
    tx,
    l,
    {
      actor: attackActor,
      status,
      note: e.note ?? l.attack.note,
      decidedAt: status === 'pending' ? null : new Date(),
    },
    targets,
  );
  await attackDecided(tx, ctx, saved, actor, {
    applicationId: e.applicationId,
    targetIds: e.decisions.flatMap((d) => (d.targetId ? [d.targetId] : [])),
    actor: !!actorDecision,
  });
  await attackUpdated(tx, ctx, saved, actor, 'decided');
  return saved;
}

/**
 * Participants du combat devenus hors de combat (formule `horsCombat`, réponse de character) :
 * grisés, `combat.participant_defeated` au MJ, état du combat relu par tous.
 */
async function markDefeated(
  tx: Tx,
  ctx: EventContext,
  actor: EventActor,
  campaignId: string,
  defeated: { characterId: string; attackId: string }[],
) {
  if (!defeated.length) return;
  const loaded = await loadCombat(tx, campaignId, true);
  if (!loaded) return;
  let state = stateOf(loaded.combat, loaded.participants);
  const fresh = defeated.filter(
    (d, i) =>
      defeated.findIndex((x) => x.characterId === d.characterId) === i &&
      state.order.some((p) => p.characterId === d.characterId && !p.defeated),
  );
  if (!fresh.length) return;
  for (const d of fresh) state = updateParticipant(state, d.characterId, { defeated: true });
  const saved = await saveState(tx, loaded, state);
  await turnChanged(tx, ctx, saved, actor, { reason: 'participant_updated' });
  for (const d of fresh)
    await combatEvent(tx, ctx, {
      type: 'combat.participant_defeated',
      combat: saved.combat,
      userId: actor.userId,
      role: actor.role,
      payload: { characterId: d.characterId, attackId: d.attackId, version: saved.combat.version },
      visibility: 'gm_only',
    });
}

const defeatedOf = (response: AppliedModifications, applicationId: string | null) =>
  new Map(
    (response.applications.find((x) => x.applicationId === applicationId)?.items ?? []).map((i) => [
      i.characterId,
      i.defeated,
    ]),
  );

/** Termine une réservation restée `applying` (panne) : renvoyée à character, puis enregistrée. */
async function recoverStale(
  db: Db,
  character: CharacterClient,
  req: FastifyRequest,
  a: Access,
  actor: EventActor,
  attackIds: string[],
) {
  const stale = (await applicationsOf(db, attackIds)).filter(
    (r) => r.status === 'applying' && Date.now() - r.createdAt.getTime() > STALE_MS,
  );
  for (const row of stale) {
    const items = row.items as ApplicationItem[];
    let response: AppliedModifications = { applications: [] };
    try {
      if (items.length)
        response = await character.applyModifications(
          [{ applicationId: row.id, userId: row.createdBy, campaignId: a.campaign.id, items }],
          {
            userId: row.createdBy,
            campaignId: a.campaign.id,
            correlationId: req.ctx.correlationId,
          },
        );
    } catch (e) {
      const failure = characterFailure(e, req.log, 'reprise d’une application');
      if (failure.status === 502 || failure.status === 503) throw failure;
      // Refusée par character : jamais écrite, la réservation disparaît
      await deleteApplications(db, [row.id]);
      continue;
    }
    await db.transaction(async (tx) => {
      await lockCampaign(tx, a.campaign.id);
      const l = await loadAttack(tx, a.campaign.id, row.attackId, true);
      const current = (await applicationsOf(tx, [row.attackId])).find((x) => x.id === row.id);
      if (!l || current?.status !== 'applying') return;
      await finishApplication(tx, eventContext(req), actor, l, row, response);
    });
  }
}

async function finishApplication(
  tx: Tx,
  ctx: EventContext,
  actor: EventActor,
  l: LoadedAttack,
  row: Pick<ApplicationRow, 'id' | 'decisions' | 'note'>,
  response: AppliedModifications,
) {
  const defeated = defeatedOf(response, row.id);
  const saved = await finalize(tx, ctx, actor, l, {
    applicationId: row.id,
    decisions: row.decisions,
    note: row.note,
    defeated,
  });
  await updateApplication(tx, row.id, {
    status: 'applied',
    result: response.applications.find((x) => x.applicationId === row.id)?.items ?? [],
    appliedAt: new Date(),
  });
  return { saved, defeated };
}

/**
 * Applique des décisions sur un ou plusieurs rapports (« Tout appliquer ») : tout ou rien, un
 * seul appel à character. Renvoie les attaques enregistrées, dans l'ordre reçu.
 */
export async function applyDecisions(
  deps: { db: Db; character: CharacterClient },
  req: FastifyRequest,
  a: Access,
  userId: string,
  inputs: { attackId: string; input: ApplyInput }[],
): Promise<LoadedAttack[]> {
  const { db } = deps;
  const actor: EventActor = { userId, role: a.role };
  const ids = inputs.map((i) => i.attackId);
  await recoverStale(db, deps.character, req, a, actor, ids);

  const plans = await db.transaction(async (tx) => {
    await lockCampaign(tx, a.campaign.id);
    const locked = await lockAttacks(tx, a.campaign.id, ids);
    const applying = new Set(
      (await applicationsOf(tx, ids)).filter((r) => r.status === 'applying').map((r) => r.attackId),
    );
    const redirects = inputs.flatMap((i) =>
      i.input.targets.flatMap((t) => (t.redirectTo ? [t.redirectTo] : [])),
    );
    await engagedOrThrow(tx, a.campaign.id, [...new Set(redirects)]);
    const plans: Plan[] = [];
    for (const { attackId, input } of inputs) {
      const l = locked.find((x) => x.attack.id === attackId);
      if (!l) throw attackNotFound();
      checkAttackVersion(l, input.version);
      requirePending(l);
      if (applying.has(attackId)) throw inFlight();
      const plan = planOf(l, input, userId);
      if (plan.applicationId)
        await insertApplication(tx, {
          id: plan.applicationId,
          attackId,
          campaignId: a.campaign.id,
          status: 'applying',
          decisions: plan.decisions,
          items: plan.items,
          note: plan.note ?? null,
          createdBy: userId,
        });
      plans.push(plan);
    }
    return plans;
  });

  const calls = plans.filter((p) => p.applicationId && p.items.length);
  let response: AppliedModifications = { applications: [] };
  if (calls.length) {
    try {
      response = await deps.character.applyModifications(
        calls.map((p) => ({
          applicationId: p.applicationId!,
          userId,
          campaignId: a.campaign.id,
          items: p.items,
        })),
        { userId, campaignId: a.campaign.id, correlationId: req.ctx.correlationId },
      );
    } catch (e) {
      await deleteApplications(
        db,
        plans.flatMap((p) => (p.applicationId ? [p.applicationId] : [])),
      );
      throw characterFailure(e, req.log, 'application');
    }
  }

  return db.transaction(async (tx) => {
    const ctx = eventContext(req);
    await lockCampaign(tx, a.campaign.id);
    const locked = await lockAttacks(tx, a.campaign.id, ids);
    const saved: LoadedAttack[] = [];
    const defeated: { characterId: string; attackId: string }[] = [];
    for (const plan of plans) {
      const l = locked.find((x) => x.attack.id === plan.loaded.attack.id)!;
      if (plan.applicationId) {
        const done = await finishApplication(
          tx,
          ctx,
          actor,
          l,
          { id: plan.applicationId, decisions: plan.decisions, note: plan.note ?? null },
          response,
        );
        saved.push(done.saved);
        for (const [characterId, d] of done.defeated)
          if (d) defeated.push({ characterId, attackId: l.attack.id });
      } else
        saved.push(
          await finalize(tx, ctx, actor, l, {
            applicationId: null,
            decisions: plan.decisions,
            note: plan.note,
            defeated: new Map(),
          }),
        );
    }
    await markDefeated(tx, ctx, actor, a.campaign.id, defeated);
    return saved;
  });
}

/** Écarte ce qui reste à décider d'un rapport (rien n'est appliqué). */
async function dismissLoaded(
  tx: Tx,
  ctx: EventContext,
  actor: EventActor,
  l: LoadedAttack,
  note: string | undefined,
): Promise<LoadedAttack> {
  const decisions: ApplicationDecision[] = [
    ...l.targets.filter(undecided).map((t) => ({
      targetId: t.characterId,
      apply: false,
      characterIds: [],
      applied: null,
      reverted: false,
    })),
    ...(actorUndecided(l.attack.actor ?? null)
      ? [{ targetId: null, apply: false, characterIds: [], applied: null, reverted: false }]
      : []),
  ];
  return finalize(tx, ctx, actor, l, {
    applicationId: null,
    decisions,
    note,
    defeated: new Map(),
  });
}

/** `…/dismiss` (MJ) : le reste du rapport n'est pas appliqué. */
export async function dismissAttack(
  db: Db,
  req: FastifyRequest,
  a: Access,
  userId: string,
  attackId: string,
  input: { version: number; note?: string },
): Promise<LoadedAttack> {
  return db.transaction(async (tx) => {
    await lockCampaign(tx, a.campaign.id);
    const l = await loadAttack(tx, a.campaign.id, attackId, true);
    if (!l) throw attackNotFound();
    checkAttackVersion(l, input.version);
    requirePending(l);
    if ((await applicationsOf(tx, [attackId])).some((r) => r.status === 'applying'))
      throw inFlight();
    return dismissLoaded(tx, eventContext(req), { userId, role: a.role }, l, input.note);
  });
}

/** Fin du combat avec `pendingAttacks: 'dismiss'` : les rapports en attente sont écartés. */
export async function dismissPendingOfCombat(
  tx: Tx,
  ctx: EventContext,
  a: Access,
  combatId: string,
  userId: string,
) {
  const pending = await lockAttacksOfCombat(tx, a.campaign.id, combatId, ['pending']);
  const applying = new Set(
    (
      await applicationsOf(
        tx,
        pending.map((l) => l.attack.id),
      )
    )
      .filter((r) => r.status === 'applying')
      .map((r) => r.attackId),
  );
  for (const l of pending)
    if (!applying.has(l.attack.id))
      await dismissLoaded(tx, ctx, { userId, role: a.role }, l, undefined);
}

export interface RevertInput {
  version: number;
  targets?: string[];
  actor?: boolean;
  force?: boolean;
}

/** Ce qu'annule une demande : cibles appliquées visées, et coûts de l'attaquant. */
function revertScope(
  l: LoadedAttack,
  input: RevertInput,
): { applied: TargetRow[]; wantedTargets: string[]; withActor: boolean } {
  const applied = l.targets.filter((t) => t.decision === 'applied' && t.applied);
  const wantedTargets = input.targets ?? applied.map((t) => t.characterId);
  for (const id of wantedTargets)
    if (!applied.some((t) => t.characterId === id))
      throw HttpError.conflict(`Rien d’appliqué à annuler pour ${id}`, 'not_applied');
  const withActor =
    (input.actor ?? input.targets === undefined) &&
    l.attack.actor?.decision === 'applied' &&
    !!l.attack.actor.applied;
  if (input.actor && !withActor)
    throw HttpError.conflict('Coûts de l’attaquant non appliqués', 'not_applied');
  if (!wantedTargets.length && !withActor)
    throw HttpError.conflict('Rien d’appliqué à annuler', 'nothing_to_revert');
  return { applied, wantedTargets, withActor };
}

/** Applications concernées et fiches à rendre dans chacune. */
async function selectedApplications(
  db: Db,
  l: LoadedAttack,
  attackId: string,
  scope: { applied: TargetRow[]; wantedTargets: string[]; withActor: boolean },
): Promise<Map<string, Set<string>>> {
  const { applied, wantedTargets, withActor } = scope;
  const rows = new Map((await applicationsOf(db, [attackId])).map((r) => [r.id, r]));
  const selected = new Map<string, Set<string>>();
  const touch = (applicationId: string, targetId: string | null) => {
    const row = rows.get(applicationId);
    const d = row?.decisions.find((x) => x.targetId === targetId && x.apply);
    const set = selected.get(applicationId) ?? new Set<string>();
    for (const id of d?.characterIds ?? []) set.add(id);
    selected.set(applicationId, set);
  };
  for (const id of wantedTargets)
    touch(applied.find((t) => t.characterId === id)!.applied!.applicationId, id);
  if (withActor) touch(l.attack.actor!.applied!.applicationId, null);
  return selected;
}

/**
 * Fiches rendues par character, application par application, jusqu'à la première panne :
 * les applications rendues, et l'erreur qui a arrêté les suivantes.
 */
async function revertInCharacter(
  deps: { character: CharacterClient },
  req: FastifyRequest,
  a: Access,
  userId: string,
  input: RevertInput,
  selected: Map<string, Set<string>>,
): Promise<{
  done: { applicationId: string; characterIds: Set<string> }[];
  failure: HttpError | null;
}> {
  const done: { applicationId: string; characterIds: Set<string> }[] = [];
  for (const [applicationId, characterIds] of selected) {
    if (!characterIds.size) {
      done.push({ applicationId, characterIds });
      continue;
    }
    try {
      await deps.character.revertModifications(
        {
          applicationId,
          characterIds: [...characterIds],
          ...(input.force ? { force: true } : {}),
          userId,
        },
        { userId, campaignId: a.campaign.id, correlationId: req.ctx.correlationId },
      );
      done.push({ applicationId, characterIds });
    } catch (e) {
      // Application inconnue de character : rien n'a été écrit, rien à rendre
      if (e instanceof CharacterError && e.code === 'application_not_found')
        done.push({ applicationId, characterIds });
      else return { done, failure: characterFailure(e, req.log, 'annulation') };
    }
  }
  return { done, failure: null };
}

/**
 * `…/revert` (MJ) : character rend les valeurs d'avant, fiche par fiche, si elles n'ont pas
 * changé depuis (sinon 409 `revert_conflict`, sauf `force`). Les décisions annulées repassent
 * en `reverted` : le MJ peut décider à nouveau.
 */
export async function revertAttack(
  deps: { db: Db; character: CharacterClient },
  req: FastifyRequest,
  a: Access,
  userId: string,
  attackId: string,
  input: RevertInput,
): Promise<LoadedAttack> {
  const { db } = deps;
  const actor: EventActor = { userId, role: a.role };
  const l = await loadAttack(db, a.campaign.id, attackId);
  if (!l) throw attackNotFound();
  checkAttackVersion(l, input.version);
  const scope = revertScope(l, input);
  const selected = await selectedApplications(db, l, attackId, scope);
  const { done, failure } = await revertInCharacter(deps, req, a, userId, input, selected);

  let saved = l;
  if (done.length)
    saved = await db.transaction(async (tx) => {
      const ctx = eventContext(req);
      await lockCampaign(tx, a.campaign.id);
      let current = await loadAttack(tx, a.campaign.id, attackId, true);
      if (!current) throw attackNotFound();
      const apps = new Map((await applicationsOf(tx, [attackId])).map((r) => [r.id, r]));
      for (const { applicationId, characterIds } of done) {
        const row = apps.get(applicationId);
        // Décisions de cette application qui écrivaient une fiche rendue
        const hit = (d: ApplicationDecision) =>
          d.apply &&
          !d.reverted &&
          (d.characterIds.some((id) => characterIds.has(id)) || !d.characterIds.length);
        const reverted = (row?.decisions ?? []).filter(hit);
        const targetIds = reverted.flatMap((d) => (d.targetId ? [d.targetId] : []));
        const actorReverted = reverted.some((d) => d.targetId === null);
        const targets = current.targets.map((t) =>
          targetIds.includes(t.characterId) && t.applied?.applicationId === applicationId
            ? { ...t, decision: 'reverted' as const, applied: null }
            : t,
        );
        const attackActor =
          actorReverted && current.attack.actor?.applied?.applicationId === applicationId
            ? { ...current.attack.actor, decision: 'reverted' as const, applied: null }
            : (current.attack.actor ?? null);
        const status = statusAfterDecision(targets, attackActor);
        current = await saveAttack(
          tx,
          current,
          {
            actor: attackActor,
            status,
            decidedAt: status === 'pending' ? null : current.attack.decidedAt,
          },
          targets,
        );
        if (row) {
          const decisions = row.decisions.map((d) => (hit(d) ? { ...d, reverted: true } : d));
          await updateApplication(tx, applicationId, {
            decisions,
            status: decisions.every((d) => !d.apply || d.reverted) ? 'reverted' : 'applied',
            revertedAt: new Date(),
            revertedBy: userId,
          });
        }
        await attackReverted(tx, ctx, current, actor, {
          applicationId,
          targetIds,
          actor: actorReverted,
          forced: input.force === true,
        });
      }
      await attackUpdated(tx, ctx, current, actor, 'reverted');
      return current;
    });
  if (failure) throw failure;
  return saved;
}
