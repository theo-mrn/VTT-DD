/**
 * Consommateur durable `identity-progression` (docs/progression.md § 2) : XP,
 * niveaux et défis à partir des événements du bus. Activités : activities.ts ;
 * règles : rules.ts ; écriture : service.ts.
 *
 * Un événement est traité une seule fois : son id entre dans identity.inbox
 * (consommateur identity-progression) dans la transaction qui enregistre ses
 * activités pour chaque joueur concerné. Une relivraison est reconnue et
 * ignorée ; un événement sans activité n'écrit rien.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import type { Db } from '../../db/client.js';
import type { EventContext } from '../../db/outbox.js';
import { inbox } from '../../db/schema.js';
import { activitiesOf, PROGRESSION_SUBJECTS, type Activity } from './activities.js';
import { recordActivitiesInTx, type RecordResult } from './service.js';

/** Nom du consommateur durable NATS, aussi colonne `consumer` de l'inbox. */
export const PROGRESSION_CONSUMER = 'identity-progression';

interface Log {
  info(obj: object, msg: string): void;
}

export interface ProgressionDeps {
  db: Db;
  log?: Log;
  /** Nom du consommateur (tests) ; par défaut identity-progression. */
  consumer?: string;
}

export interface ProgressionEventResult {
  /** Événement déjà traité (relivraison) : rien n'a été refait. */
  duplicate: boolean;
  /** Résultat par joueur concerné (comptes inconnus omis). */
  users: Record<string, RecordResult>;
}

/** Traite un événement du bus ; une erreur (base) fait relivrer le message. */
export async function handleProgressionEvent(
  deps: ProgressionDeps,
  event: EventEnvelope,
): Promise<ProgressionEventResult> {
  const activities = activitiesOf(event);
  if (activities.length === 0) return { duplicate: false, users: {} };
  const ctx: EventContext = {
    correlationId: event.correlationId,
    traceparent: event.traceparent,
    causationId: event.id,
  };
  const byUser = new Map<string, Activity[]>();
  for (const a of activities) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
  const at = new Date(event.occurredAt);

  const result = await deps.db.transaction(async (tx) => {
    const fresh = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: deps.consumer ?? PROGRESSION_CONSUMER })
      .onConflictDoNothing()
      .returning({ eventId: inbox.eventId });
    if (fresh.length === 0) return { duplicate: true, users: {} };

    const users: Record<string, RecordResult> = {};
    // Ordre stable des verrous : deux événements croisés (amis) ne s'interbloquent pas
    for (const userId of [...byUser.keys()].sort()) {
      const r = await recordActivitiesInTx(tx, ctx, userId, byUser.get(userId)!, at);
      if (r) users[userId] = r;
    }
    return { duplicate: false, users };
  });

  for (const [userId, r] of Object.entries(result.users)) {
    if (r.level > r.levelBefore || r.completed.length)
      deps.log?.info(
        {
          userId,
          eventId: event.id,
          level: r.level,
          completed: r.completed.map((c) => c.id),
        },
        'progression du compte',
      );
  }
  return result;
}

/**
 * Démarre le consommateur durable sur `bus` ; renvoie la fonction d'arrêt. À sa
 * création, il ne lit que les événements à venir (l'existant est repris par
 * progression:backfill) ; ensuite, il reprend où il s'était arrêté.
 */
export async function startProgressionConsumer(opts: {
  bus: Bus;
  db: Db;
  logger?: ConsumeOptions['logger'];
  durable?: string;
}): Promise<() => Promise<void>> {
  const durable = opts.durable ?? PROGRESSION_CONSUMER;
  const deps: ProgressionDeps = {
    db: opts.db,
    consumer: durable,
    ...(opts.logger ? { log: opts.logger } : {}),
  };
  return consumeEvents(opts.bus, {
    durable,
    subjects: PROGRESSION_SUBJECTS,
    deliver: 'new',
    ...(opts.logger ? { logger: opts.logger } : {}),
    handler: async (event) => {
      await handleProgressionEvent(deps, event);
    },
  });
}
