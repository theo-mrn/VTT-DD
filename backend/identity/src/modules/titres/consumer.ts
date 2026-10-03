/**
 * Consommateur durable `identity-titles` : débloque les titres « événement »
 * à partir du bus (jets de dés, messages de campagne), comme le faisaient
 * dice-roller.tsx et challenge-tracker.ts dans l'ancienne app. Règles et
 * critère « vrai jet » : event-rules.ts.
 *
 * Un événement est traité une seule fois : son id entre dans identity.inbox
 * dans la transaction qui met à jour les compteurs (identity.title_progress),
 * débloque les titres et écrit leurs événements identity.title_unlocked. Une
 * relivraison (livraison « au moins une fois ») est reconnue et ignorée.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { EventContext } from '../../db/outbox.js';
import { inbox, titleProgress, users } from '../../db/schema.js';
import { reachedTitles, titleEffects, TITLE_SUBJECTS, type Counter } from './event-rules.js';
import { unlockTitleInTx } from './service.js';

/** Nom du consommateur durable NATS, aussi colonne `consumer` de l'inbox. */
export const TITLES_CONSUMER = 'identity-titles';

interface Log {
  info(obj: object, msg: string): void;
}

export interface TitlesDeps {
  db: Db;
  log?: Log;
  /** Nom du consommateur (tests) ; par défaut identity-titles. */
  consumer?: string;
}

export interface TitleEventResult {
  /** Événement déjà traité (relivraison) : rien n'a été refait. */
  duplicate: boolean;
  /** Titres débloqués par cet événement (premier déblocage). */
  unlocked: string[];
}

/** Traite un événement du bus ; une erreur (base) fait relivrer le message. */
export async function handleTitleEvent(
  deps: TitlesDeps,
  event: EventEnvelope,
): Promise<TitleEventResult> {
  const effects = titleEffects(event);
  if (!effects) return { duplicate: false, unlocked: [] };
  const { userId } = effects;
  const ctx: EventContext = {
    correlationId: event.correlationId,
    traceparent: event.traceparent,
    causationId: event.id,
  };

  const result = await deps.db.transaction(async (tx) => {
    const fresh = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: deps.consumer ?? TITLES_CONSUMER })
      .onConflictDoNothing()
      .returning({ eventId: inbox.eventId });
    if (fresh.length === 0) return { duplicate: true, unlocked: [] };

    // Compte inconnu d'identity (supprimé entre-temps) : consommé sans effet
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) return { duplicate: false, unlocked: [] };

    const values: Partial<Record<Counter, number>> = {};
    for (const [counter, by] of Object.entries(effects.increments) as [Counter, number][]) {
      const [row] = await tx
        .insert(titleProgress)
        .values({ userId, counter, value: by })
        .onConflictDoUpdate({
          target: [titleProgress.userId, titleProgress.counter],
          set: { value: sql`${titleProgress.value} + excluded.value`, updatedAt: sql`now()` },
        })
        .returning({ value: titleProgress.value });
      values[counter] = row!.value;
    }

    const unlocked: string[] = [];
    for (const slug of new Set([...effects.unlocks, ...reachedTitles(values)])) {
      const title = await unlockTitleInTx(tx, ctx, userId, slug, 'event');
      if (!title) continue;
      unlocked.push(title.slug);
      // TODO(e-mails) : au premier déblocage de « Maudit des dés » et de « Béni des
      // Dieux », l'ancienne app envoyait un e-mail (/api/send-critical-fail et
      // /api/send-critical-success, gabarits legacy/src/components/emails/critical-*).
      // Reporté au futur service worker d'e-mails, qui consommera
      // identity.title_unlocked (payload slug, label) et respectera
      // profiles.email_notifications. Rien n'est envoyé d'ici.
    }
    return { duplicate: false, unlocked };
  });

  if (result.unlocked.length) {
    deps.log?.info({ userId, eventId: event.id, unlocked: result.unlocked }, 'titres débloqués');
  }
  return result;
}

/**
 * Démarre le consommateur durable sur `bus` ; renvoie la fonction d'arrêt.
 * À sa création, le durable ne lit que les événements à venir (pas de
 * rattrapage des 7 jours du flux) ; ensuite, il reprend où il s'était arrêté.
 */
export async function startTitlesConsumer(opts: {
  bus: Bus;
  db: Db;
  logger?: ConsumeOptions['logger'];
  durable?: string;
}): Promise<() => Promise<void>> {
  const durable = opts.durable ?? TITLES_CONSUMER;
  const deps: TitlesDeps = {
    db: opts.db,
    consumer: durable,
    ...(opts.logger ? { log: opts.logger } : {}),
  };
  return consumeEvents(opts.bus, {
    durable,
    subjects: TITLE_SUBJECTS,
    deliver: 'new',
    ...(opts.logger ? { logger: opts.logger } : {}),
    handler: async (event) => {
      await handleTitleEvent(deps, event);
    },
  });
}
