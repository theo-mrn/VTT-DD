/**
 * Durées décomptées au nombre de tours (docs/combat.md § 18) : campaign mène le combat, character
 * décompte les durées des fiches.
 *
 * - Chaque passage de tour devient des **événements** (`passageEvents`, pur) : fin du tour de qui
 *   a agi, fin de round, début du tour de qui agit. Ils sont gardés avec le passage dans le
 *   journal des tours (`tick_events`), avec l'identifiant de leur décompte (`tick_id`).
 * - Après la transaction du passage, `settleTicks` envoie à character, dans l'ordre du journal,
 *   chaque décompte qui n'a pas encore abouti (`expired` nul) : celui du passage, et ceux qu'une
 *   panne a laissés en route. character ne décompte qu'une fois par `tickId`.
 * - Un décompte qui retire quelque chose s'annonce (`combat.durations_expired`) : complet aux
 *   MJ, réduit aux personnages vus des camps des joueurs et des alliés pour les autres.
 */
import {
  uuidv7,
  type CombatDurationUpdate,
  type CombatDurationsExpiredPayload,
  type DurationEvent,
} from '@vtt/contracts';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { CallOrigin, DurationsTick } from '../../clients/character.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import { campaignCombatTurns, type Role, type TurnLogReason } from '../../db/schema.js';
import type { Deps } from '../../deps.js';
import type { Access } from '../campaigns/repository.js';
import { eventContext } from '../schemas.js';
import { originOf } from './api.js';
import {
  combatEvent,
  loadCombat,
  logTurn,
  recordExpired,
  type CombatRow,
  type LoadedCombat,
} from './repository.js';
import { snapshotOf } from './turn-log.js';
import { currentActorOf, type CombatState } from './turns.js';

// ─── Événements d'un passage (pur) ────────────────────────────────────────────

/** Ce qui fait passer le tour. `start` : premier tour (démarrage ou initiative de tous). */
export type PassageKind = 'next' | 'turn_set' | 'slot_actor' | 'start';

/**
 * Événements d'un passage de tour, dans l'ordre où ils arrivent à la table (§ 18.3) :
 * - `next` : fin du tour de qui a agi (en slots, son début d'abord s'il n'était pas désigné),
 *   fin de round si le round change, début du tour de qui agit ensuite ;
 * - `turn_set` : fin du tour de qui agissait, début du tour de qui reçoit le tour ;
 * - `slot_actor` : début du tour du nouvel acteur du créneau ;
 * - `start` : début du tour du premier (mode individual).
 */
export function passageEvents(
  kind: PassageKind,
  before: CombatState | null,
  after: CombatState,
  acted: string | null = null,
): DurationEvent[] {
  const events: DurationEvent[] = [];
  const turnStart = (characterId: string) => events.push({ kind: 'turn_start', characterId });
  const turnEnd = (characterId: string) => events.push({ kind: 'turn_end', characterId });
  const actorBefore = before ? currentActorOf(before) : null;
  const actorAfter = currentActorOf(after);
  switch (kind) {
    case 'next': {
      // Individual : le tour courant finit, même si son participant avait déjà agi
      const ending = after.mode === 'individual' ? (acted ?? actorBefore) : acted;
      if (ending) {
        if (after.mode === 'slots' && ending !== actorBefore) turnStart(ending);
        turnEnd(ending);
      }
      if (before && after.round > before.round)
        events.push({ kind: 'round_end', round: before.round });
      if (actorAfter) turnStart(actorAfter);
      break;
    }
    case 'turn_set':
      if (actorBefore === actorAfter) break;
      if (actorBefore) turnEnd(actorBefore);
      if (actorAfter) turnStart(actorAfter);
      break;
    case 'slot_actor':
      if (actorAfter && actorAfter !== actorBefore) turnStart(actorAfter);
      break;
    case 'start':
      if (actorAfter) turnStart(actorAfter);
      break;
  }
  return events;
}

/** Identifiant du décompte d'un passage : `tick:<combatId>:<round>:<passage>`. */
export const passageTickId = (combatId: string, round: number, passageId: string) =>
  `tick:${combatId}:${round}:${passageId}`;

/**
 * Enregistre un passage de tour dans le journal (état d'avant), avec les événements de son
 * décompte ; à appeler dans la transaction du passage, puis `settleTicks` après elle.
 */
export async function logPassage(
  tx: Tx,
  combat: CombatRow,
  p: {
    reason: TurnLogReason;
    kind: PassageKind;
    before: CombatState;
    after: CombatState;
    acted?: string | null;
    userId: string;
  },
): Promise<{ id: string; events: DurationEvent[] }> {
  const id = uuidv7();
  const events = passageEvents(p.kind, p.before, p.after, p.acted ?? null);
  await logTurn(tx, combat, {
    id,
    reason: p.reason,
    before: snapshotOf(p.before),
    userId: p.userId,
    ...(events.length
      ? { tickId: passageTickId(combat.id, p.before.round, id), tickEvents: events }
      : {}),
  });
  return { id, events };
}

// ─── Décompte par character ───────────────────────────────────────────────────

/** Qui fait avancer le combat : appels à character, événements, journal. */
export interface TickContext {
  deps: Deps;
  log: FastifyBaseLogger;
  ev: EventContext;
  origin: CallOrigin & { campaignId: string };
  actor: { userId: string | null; role: Role | null };
}

export function tickContext(deps: Deps, req: FastifyRequest, a: Access): TickContext {
  return {
    deps,
    log: req.log,
    ev: eventContext(req),
    origin: originOf(req, a.campaign.id),
    actor: { userId: originOf(req, a.campaign.id).userId, role: a.role },
  };
}

/** Résultat des décomptes envoyés : fiches changées, et participants injoignables. */
export interface Settled {
  updates: CombatDurationUpdate[];
  failures: string[];
}

const NOTHING: Settled = { updates: [], failures: [] };

/** Personnages dont un joueur voit les durées : participants vus des joueurs et des alliés. */
export function playerVisibleIds(participants: LoadedCombat['participants']): Set<string> {
  return new Set(
    participants
      .filter((p) => p.visibleToPlayers && (p.side === 'players' || p.side === 'allies'))
      .map((p) => p.characterId),
  );
}

/** Mises à jour qu'un joueur reçoit (réponse d'un passage) : jamais un PNJ caché ou ennemi. */
export function playerUpdates(
  participants: LoadedCombat['participants'],
  updates: CombatDurationUpdate[],
): CombatDurationUpdate[] {
  const visible = playerVisibleIds(participants);
  return updates.filter((u) => visible.has(u.characterId));
}

const updatesOf = (r: DurationsTick): CombatDurationUpdate[] =>
  r.items.map((i) => ({
    characterId: i.characterId,
    expired: i.expired.map((x) => x.key),
    entries: i.expired,
  }));

/**
 * `combat.durations_expired` : complet aux MJ ; pour les autres, les personnages vus des camps
 * des joueurs et des alliés seulement, rien s'il n'en reste aucun. Un seul événement public
 * quand rien n'est à cacher.
 */
async function announceExpired(
  c: TickContext,
  loaded: Pick<LoadedCombat, 'combat' | 'participants'>,
  tickId: string,
  updates: CombatDurationUpdate[],
) {
  const expirations = updates
    .filter((u) => u.entries?.length)
    .map((u) => ({ characterId: u.characterId, entries: u.entries! }));
  if (!expirations.length) return;
  const visible = playerVisibleIds(loaded.participants);
  const shared = expirations.filter((x) => visible.has(x.characterId));
  const payload = (list: typeof expirations): CombatDurationsExpiredPayload => ({
    tickId,
    round: loaded.combat.round,
    expirations: list,
  });
  const base = {
    type: 'combat.durations_expired' as const,
    combat: loaded.combat,
    userId: c.actor.userId,
    role: c.actor.role,
  };
  await c.deps.db.transaction(async (tx) => {
    if (shared.length === expirations.length) {
      await combatEvent(tx, c.ev, { ...base, payload: payload(expirations) });
      return;
    }
    await combatEvent(tx, c.ev, {
      ...base,
      payload: payload(expirations),
      visibility: 'gm_only',
    });
    if (shared.length) await combatEvent(tx, c.ev, { ...base, payload: payload(shared) });
  });
}

/**
 * Un décompte envoyé à character pour les participants du combat ; annoncé s'il retire quelque
 * chose (seulement la première fois : une reprise ne s'annonce pas deux fois).
 */
export async function applyTick(
  c: TickContext,
  loaded: Pick<LoadedCombat, 'combat' | 'participants'>,
  tickId: string,
  events: DurationEvent[],
): Promise<CombatDurationUpdate[]> {
  const characterIds = loaded.participants.map((p) => p.characterId);
  if (!characterIds.length || !events.length) return [];
  const r = await c.deps.character.tickDurations({ tickId, characterIds, events }, c.origin);
  const updates = updatesOf(r);
  if (!r.replayed)
    await announceExpired(c, loaded, tickId, updates).catch((e: Error) =>
      c.log.warn({ error: e.message, tickId }, 'expiration des durées non annoncée'),
    );
  return updates;
}

/**
 * Décomptes du journal qui n'ont pas abouti (passage enregistré, character pas encore
 * confirmé), dans l'ordre : celui du passage qui vient d'avoir lieu, et ceux qu'une panne a
 * laissés en route. Le premier qui échoue arrête la suite (l'ordre est gardé) : ils seront
 * rejoués au prochain passage.
 */
export async function settleTicks(c: TickContext): Promise<Settled> {
  const loaded = await loadCombat(c.deps.db, c.origin.campaignId);
  if (!loaded) return NOTHING;
  const pending = await c.deps.db
    .select()
    .from(campaignCombatTurns)
    .where(
      and(
        eq(campaignCombatTurns.combatId, loaded.combat.id),
        isNotNull(campaignCombatTurns.tickId),
        isNotNull(campaignCombatTurns.tickEvents),
        isNull(campaignCombatTurns.expired),
      ),
    )
    .orderBy(asc(campaignCombatTurns.createdAt), asc(campaignCombatTurns.id));
  const updates = new Map<string, CombatDurationUpdate>();
  for (const row of pending) {
    try {
      const done = await applyTick(c, loaded, row.tickId!, row.tickEvents!);
      for (const u of done) {
        const known = updates.get(u.characterId);
        updates.set(
          u.characterId,
          known
            ? {
                ...u,
                expired: [...known.expired, ...u.expired],
                entries: [...(known.entries ?? []), ...(u.entries ?? [])],
              }
            : u,
        );
      }
      await recordExpired(
        c.deps.db,
        row.id,
        Object.fromEntries(done.map((u) => [u.characterId, u.expired])),
      );
    } catch (e) {
      c.log.error({ error: (e as Error).message, tickId: row.tickId }, 'durées non décomptées');
      return {
        updates: [...updates.values()],
        failures: loaded.participants.map((p) => p.characterId),
      };
    }
  }
  return { updates: [...updates.values()], failures: [] };
}

/**
 * Décompte hors journal (premier tour, fin du combat) : rien à rendre par « Précédent », rien
 * à rejouer ; une panne est journalisée et signalée.
 */
export async function tickOutsideLog(
  c: TickContext,
  loaded: Pick<LoadedCombat, 'combat' | 'participants'>,
  tickId: string,
  events: DurationEvent[],
): Promise<Settled> {
  try {
    return { updates: await applyTick(c, loaded, tickId, events), failures: [] };
  } catch (e) {
    c.log.error({ error: (e as Error).message, tickId }, 'durées non décomptées');
    return { updates: [], failures: loaded.participants.map((p) => p.characterId) };
  }
}

/** Décompte du premier tour (démarrage avec initiative, initiative de tous). */
export async function tickFirstTurn(
  c: TickContext,
  loaded: LoadedCombat,
  state: CombatState,
): Promise<Settled> {
  const events = passageEvents('start', null, state);
  if (!events.length) return NOTHING;
  return tickOutsideLog(c, loaded, `tick:${loaded.combat.id}:start:${uuidv7()}`, events);
}
