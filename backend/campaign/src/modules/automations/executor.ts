/**
 * Exécuteur des automatismes (docs/automatismes.md § 3).
 *
 * - Consommateur durable `campaign-automations` : scène du groupe, combat, état de la table ;
 *   chaque événement donne des signaux (ce qui a changé depuis la mémoire de la campagne), et
 *   chaque règle active qu'un signal concerne s'applique si ses conditions sont vraies.
 * - Ouvrier (`startAutomationWorker`) : chaque seconde, les actions différées et les échéances
 *   (fin du minuteur, heure du monde atteinte) de `automation_jobs`.
 *
 * Garde-fous : une règle qui échoue ne fait pas échouer l'événement (point de sauvegarde, journal) ;
 * profondeur d'enchaînement plafonnée (`auto:<n>:…`) ; 60 exécutions par minute et par campagne.
 */
import {
  type CombatTurnChangedPayload,
  type EventEnvelope,
  type MapSettings,
  type RuleAction,
  type RuleTrigger,
  type TableState,
  uuidv7,
} from '@vtt/contracts';
import { consumeEvents, type Bus, type Logger } from '@vtt/platform';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import {
  automationJobs,
  automationRules,
  automations,
  automationRuns,
  campaignCharacters,
  campaignCombatParticipants,
  campaigns,
  campaignCombats,
  inbox,
  mapSettings,
  tableStates,
} from '../../db/schema.js';
import { loadTableState, stored } from '../table/index.js';
import { runAction, systemViewer } from './actions.js';
import {
  actorsOf,
  conditionsHold,
  depthOf,
  hourOf,
  matches,
  MAX_DEPTH,
  realTimeOfHour,
  sceneSignals,
  tableSignals,
  worldMinutes,
  type Memory,
  type Signal,
} from './engine.js';

export const AUTOMATIONS_CONSUMER = 'campaign-automations';
const SUBJECTS = ['vtt.*.map_settings.updated', 'vtt.*.combat.*', 'vtt.*.table_state.gm_updated'];

const RUNS_PER_MINUTE = 60;
const runs = new Map<string, number[]>();
function allowRun(campaignId: string, now: number) {
  const recent = (runs.get(campaignId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= RUNS_PER_MINUTE) return false;
  recent.push(now);
  runs.set(campaignId, recent);
  return true;
}

// ─── Mémoire ─────────────────────────────────────────────────────────────────

async function readMemory(tx: Tx, campaignId: string): Promise<Memory> {
  const row = await loadTableState(tx, campaignId, true);
  return (row?.memory ?? {}) as Memory;
}

async function writeMemory(tx: Tx, campaignId: string, memory: Memory) {
  await tx
    .insert(tableStates)
    .values({ campaignId, memory: memory as Record<string, unknown> })
    .onConflictDoUpdate({
      target: tableStates.campaignId,
      set: { memory: memory as Record<string, unknown> },
    });
}

// ─── Échéances ───────────────────────────────────────────────────────────────

/**
 * Replace les échéances de la campagne : fin du minuteur, et chaque heure du monde qu'une règle
 * attend (si le temps coule). Appelée à chaque changement d'état de la table ou de règle.
 */
export async function reschedule(tx: Tx, campaignId: string, nowMs = Date.now()) {
  const row = await loadTableState(tx, campaignId);
  const s = stored(row?.state);
  await tx
    .delete(automationJobs)
    .where(
      and(
        eq(automationJobs.campaignId, campaignId),
        inArray(automationJobs.kind, ['timer.end', 'time.hour']),
      ),
    );
  const jobs: (typeof automationJobs.$inferInsert)[] = [];
  if (s.timer?.endsAt && Date.parse(s.timer.endsAt) > nowMs)
    jobs.push({
      id: uuidv7(),
      campaignId,
      kind: 'timer.end',
      runAt: new Date(s.timer.endsAt),
      payload: { endsAt: s.timer.endsAt },
    });
  if (s.worldTime && s.worldTime.rate > 0) {
    const rules = await tx
      .select({ trigger: automationRules.trigger })
      .from(automationRules)
      .where(and(eq(automationRules.campaignId, campaignId), eq(automationRules.enabled, true)));
    const heures = new Set(
      rules.flatMap((r) => (r.trigger.type === 'time.hour' ? [r.trigger.hour] : [])),
    );
    for (const hour of heures) {
      const at = realTimeOfHour(s.worldTime, hour, nowMs);
      if (at !== null)
        jobs.push({
          id: uuidv7(),
          campaignId,
          kind: 'time.hour',
          runAt: new Date(at),
          payload: { hour },
        });
    }
  }
  if (jobs.length) await tx.insert(automationJobs).values(jobs);
}

// ─── Règles ──────────────────────────────────────────────────────────────────

type RuleRow = typeof automationRules.$inferSelect;

/** Applique une règle : actions immédiates (point de sauvegarde), différées en file, journal. */
export async function runRule(
  tx: Tx,
  /** `id` null : déclencheur d'un réglage (pas de règle à mettre à jour). */
  rule: Pick<RuleRow, 'campaignId' | 'name' | 'actions' | 'once'> & { id: string | null },
  trigger: string,
  depth: number,
  nowMs = Date.now(),
  /** Joueurs concernés par le déclencheur (cible `actor`). */
  actors: readonly string[] = [],
) {
  const v = await systemViewer(tx, rule.campaignId);
  if (!v) return;
  const ctx = { correlationId: `auto:${depth + 1}:${uuidv7()}`, traceparent: null };
  const tout = rule.actions;
  const maintenant = tout.filter((a) => !a.delayMs);
  const plusTard = new Map<number, RuleAction[]>();
  for (const a of tout)
    if (a.delayMs) plusTard.set(a.delayMs, [...(plusTard.get(a.delayMs) ?? []), a]);
  let error: string | null = null;
  try {
    await tx.transaction(async (sp) => {
      for (const a of maintenant) await runAction(sp, ctx, v, a, actors);
    });
  } catch (e) {
    error = (e as Error).message.slice(0, 500);
  }
  if (plusTard.size)
    await tx.insert(automationJobs).values(
      [...plusTard].map(([delay, actions]) => ({
        id: uuidv7(),
        campaignId: rule.campaignId,
        kind: 'actions' as const,
        runAt: new Date(nowMs + delay),
        payload: {
          ruleId: rule.id,
          ruleName: rule.name,
          actions,
          depth: depth + 1,
          actors: [...actors],
        },
      })),
    );
  if (rule.id)
    await tx
      .update(automationRules)
      .set({ lastRunAt: new Date(nowMs), ...(rule.once ? { enabled: false } : {}) })
      .where(eq(automationRules.id, rule.id));
  await tx.insert(automationRuns).values({
    id: uuidv7(),
    campaignId: rule.campaignId,
    ruleId: rule.id,
    ruleName: rule.name,
    trigger,
    ok: error === null,
    error,
  });
}

/** Évalue les règles de la campagne pour ces signaux. */
export async function processSignals(
  tx: Tx,
  campaignId: string,
  signals: readonly Signal[],
  depth: number,
  o: { nowMs?: number; random?: () => number } = {},
) {
  if (!signals.length || depth >= MAX_DEPTH) return;
  const nowMs = o.nowMs ?? Date.now();
  const rules = await tx
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.campaignId, campaignId), eq(automationRules.enabled, true)))
    .orderBy(asc(automationRules.sortOrder), asc(automationRules.createdAt));
  // Déclencheurs des réglages : une règle implicite chacun, après les règles
  const presets = await tx
    .select({ id: automations.id, name: automations.name, triggers: automations.triggers })
    .from(automations)
    .where(eq(automations.campaignId, campaignId))
    .orderBy(asc(automations.sortOrder), asc(automations.createdAt));
  const implicites = presets.flatMap((p) =>
    p.triggers.map((trigger) => ({
      id: null,
      campaignId,
      name: p.name,
      trigger: trigger as RuleTrigger,
      conditions: [],
      actions: [{ type: 'preset.apply' as const, automationId: p.id }],
      cooldownSec: 0,
      once: false,
      lastRunAt: null as Date | null,
      enabled: true,
    })),
  );
  const toutes = [...rules, ...implicites];
  if (!toutes.length) return;
  const [settings] = await tx
    .select({ partyMapId: mapSettings.partyMapId })
    .from(mapSettings)
    .where(eq(mapSettings.campaignId, campaignId));
  const [combat] = await tx
    .select({ id: campaignCombats.id })
    .from(campaignCombats)
    .where(eq(campaignCombats.campaignId, campaignId));
  const table = stored((await loadTableState(tx, campaignId))?.state);
  const cond = {
    partyMapId: settings?.partyMapId ?? null,
    combatActive: !!combat,
    hour: table.worldTime ? hourOf(worldMinutes(table.worldTime, nowMs)) : null,
    random: o.random ?? Math.random,
  };
  for (const signal of signals)
    for (const rule of toutes) {
      if (!matches(rule.trigger, signal)) continue;
      if (
        rule.cooldownSec &&
        rule.lastRunAt &&
        nowMs - rule.lastRunAt.getTime() < rule.cooldownSec * 1000
      )
        continue;
      if (!conditionsHold(rule.conditions, cond)) continue;
      if (!allowRun(campaignId, nowMs)) return;
      await runRule(tx, rule, signal.type, depth, nowMs, actorsOf(signal));
      rule.lastRunAt = new Date(nowMs);
      if (rule.once) rule.enabled = false;
    }
}

// ─── Événements ──────────────────────────────────────────────────────────────

/**
 * Personnage dont c'est le tour : son camp et son joueur (celui qui l'incarne, sinon le
 * propriétaire d'un personnage du camp des joueurs ; un PNJ du MJ n'a pas de joueur).
 */
async function currentActor(tx: Tx, campaignId: string, p: CombatTurnChangedPayload) {
  const order = await tx
    .select({
      characterId: campaignCombatParticipants.characterId,
      side: campaignCombatParticipants.side,
    })
    .from(campaignCombatParticipants)
    .where(eq(campaignCombatParticipants.campaignId, campaignId))
    .orderBy(asc(campaignCombatParticipants.turnOrder));
  const actuel = p.currentActorId
    ? order.find((x) => x.characterId === p.currentActorId)
    : order[p.currentIndex];
  if (!actuel) return { side: null, userIds: [] };
  const [perso] = await tx
    .select({ ownerId: campaignCharacters.ownerId, playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        eq(campaignCharacters.characterId, actuel.characterId),
      ),
    );
  const joueur = perso?.playedBy ?? (actuel.side === 'players' ? perso?.ownerId : null);
  return { side: actuel.side, userIds: joueur ? [joueur] : [] };
}

/** Traite un événement ; false s'il est ignoré ou déjà traité. */
export async function handleAutomationEvent(
  db: Db,
  event: Pick<EventEnvelope, 'id' | 'type' | 'roomId' | 'payload' | 'correlationId'>,
): Promise<boolean> {
  const campaignId = event.roomId;
  if (!campaignId) return false;
  const depth = depthOf(event.correlationId);
  return db.transaction(async (tx) => {
    // Campagne supprimée depuis (événement en retard, relivré) : rien à faire, et surtout pas
    // d'échec relivré sans fin ; verrouillée, elle ne peut plus disparaître pendant le traitement
    const [live] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .for('key share');
    if (!live) return false;
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: AUTOMATIONS_CONSUMER })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return false;
    let memory = await readMemory(tx, campaignId);
    let signals: Signal[] = [];
    switch (event.type) {
      case 'map_settings.updated': {
        const partyMapId = (event.payload as unknown as MapSettings).partyMapId ?? null;
        signals = sceneSignals(memory, partyMapId);
        memory = { ...memory, partyMapId };
        break;
      }
      case 'combat.started':
        signals = [{ type: 'combat.start' }];
        memory = { ...memory, combatVersion: 0 };
        break;
      case 'combat.ended':
        signals = [{ type: 'combat.end' }];
        break;
      case 'combat.turn_changed': {
        // Deux variantes (MJ, joueurs) de même version : une seule compte
        const p = event.payload as unknown as CombatTurnChangedPayload;
        if (p.version <= (memory.combatVersion ?? 0)) return true;
        memory = { ...memory, combatVersion: p.version };
        signals = [
          ...(p.reason === 'new_round' ? [{ type: 'combat.round' as const, round: p.round }] : []),
          { type: 'combat.turn', ...(await currentActor(tx, campaignId, p)) },
        ];
        break;
      }
      case 'table_state.gm_updated': {
        const r = tableSignals(memory, event.payload as unknown as TableState);
        signals = r.signals;
        memory = r.memory;
        await reschedule(tx, campaignId);
        break;
      }
      default:
        return false;
    }
    await writeMemory(tx, campaignId, memory);
    await processSignals(tx, campaignId, signals, depth);
    return true;
  });
}

export function startAutomationsConsumer(o: {
  bus: Bus;
  db: Db;
  logger: Logger;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: AUTOMATIONS_CONSUMER,
    subjects: SUBJECTS,
    deliver: 'new',
    logger: o.logger,
    handler: async (event) => {
      await handleAutomationEvent(o.db, event);
    },
  });
}

// ─── Ouvrier ─────────────────────────────────────────────────────────────────

/** Une passe : les travaux arrivés à échéance, chacun dans sa transaction. */
export async function runDueJobs(db: Db, nowMs = Date.now()) {
  const dus = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(automationJobs)
      .where(lte(automationJobs.runAt, new Date(nowMs)))
      .orderBy(asc(automationJobs.runAt))
      .limit(20)
      .for('update', { skipLocked: true });
    if (rows.length)
      await tx.delete(automationJobs).where(
        inArray(
          automationJobs.id,
          rows.map((r) => r.id),
        ),
      );
    return rows;
  });
  for (const job of dus)
    await db.transaction(async (tx) => {
      const p = job.payload;
      if (job.kind === 'actions') {
        const ruleId = typeof p.ruleId === 'string' ? p.ruleId : null;
        // Règle supprimée entre-temps : ses actions restantes tombent avec elle
        if (ruleId) {
          const [encore] = await tx
            .select({ id: automationRules.id })
            .from(automationRules)
            .where(eq(automationRules.id, ruleId));
          if (!encore) return;
        }
        await runRule(
          tx,
          {
            id: ruleId,
            campaignId: job.campaignId,
            name: String(p.ruleName ?? ''),
            actions: (p.actions as RuleAction[]).map(({ delayMs: _d, ...a }) => a as RuleAction),
            once: false,
          },
          'delay',
          Number(p.depth ?? 1) - 1,
          nowMs,
          Array.isArray(p.actors) ? p.actors.filter((x): x is string => typeof x === 'string') : [],
        );
        return;
      }
      if (job.kind === 'timer.end') {
        await processSignals(tx, job.campaignId, [{ type: 'timer.end' }], 0, { nowMs });
        return;
      }
      await processSignals(tx, job.campaignId, [{ type: 'time.hour', hour: Number(p.hour) }], 0, {
        nowMs,
      });
      // L'heure suivante (le lendemain) : replanifiée d'après l'état de la table
      await reschedule(tx, job.campaignId, nowMs + 1000);
    });
  return dus.length;
}

export function startAutomationWorker(o: { db: Db; logger: Logger }): () => Promise<void> {
  let stopped = false;
  let running: Promise<unknown> | null = null;
  const id = setInterval(() => {
    if (stopped || running) return;
    running = runDueJobs(o.db)
      .catch((e: unknown) => o.logger.warn({ error: (e as Error).message }, 'automatismes : file'))
      .finally(() => {
        running = null;
      });
  }, 1000);
  return async () => {
    stopped = true;
    clearInterval(id);
    await running;
  };
}
