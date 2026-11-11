/**
 * Consommateur durable `archive-events` : un compte supprimé (`identity.user_deleted`,
 * docs/legal.md) emporte ses tâches et ses archives. Au moins une fois : l'inbox écarte une
 * relivraison ; les fichiers sont effacés après la transaction (un échec fait relivrer).
 */
import { USER_DELETED, USER_DELETED_SUBJECT, type EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus } from '@vtt/platform';
import { eq, isNotNull, and } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import { inbox, jobs } from '../db/schema.js';
import type { ArchiveStore } from '../storage/store.js';

export type Outcome = 'applied' | 'duplicate' | 'ignored';

/** Compte supprimé : l'identifiant de l'agrégat (contrat accounts). */
const UserId = z.uuid().transform((s) => s.toLowerCase());

export async function handleEvent(
  deps: { db: Db; store: ArchiveStore | undefined },
  consumer: string,
  event: EventEnvelope,
): Promise<Outcome> {
  if (event.type !== USER_DELETED) return 'ignored';
  const parsed = UserId.safeParse(event.aggregate.id);
  if (!parsed.success) return 'ignored';
  const userId = parsed.data;
  const keys = (
    await deps.db
      .select({ key: jobs.objectKey })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), isNotNull(jobs.objectKey)))
  ).map((r) => r.key!);
  // Fichiers d'abord : une relivraison les retrouverait encore dans la table
  await deps.store?.remove(keys);
  return deps.db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return 'duplicate';
    const removed = await tx.delete(jobs).where(eq(jobs.userId, userId)).returning({ id: jobs.id });
    await appendEvent(
      tx,
      { correlationId: event.correlationId, traceparent: event.traceparent },
      {
        type: 'archive.user_erased',
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'user', id: userId },
        payload: { jobs: removed.length },
      },
    );
    return 'applied';
  });
}

export function startEventsConsumer(o: {
  bus: Bus;
  db: Db;
  store: ArchiveStore | undefined;
  durable: string;
  logger: NonNullable<Parameters<typeof consumeEvents>[1]['logger']>;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: o.durable,
    subjects: [USER_DELETED_SUBJECT],
    deliver: 'all',
    logger: o.logger,
    async handler(event) {
      const outcome = await handleEvent(o, o.durable, event);
      o.logger.info({ eventId: event.id, type: event.type, outcome }, 'événement traité');
    },
  });
}
