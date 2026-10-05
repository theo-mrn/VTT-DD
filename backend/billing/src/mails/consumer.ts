/**
 * Consommateur durable `billing-mails` : envoie les e-mails de paiement à
 * partir des événements de billing (vtt.global.billing.>), par Kourrier.
 *
 * Un événement est traité une seule fois : son id entre dans billing.inbox
 * après l'envoi. Kourrier en panne : le message est relivré, et la clé
 * d'idempotence (id de l'événement) empêche tout doublon chez Kourrier.
 * Refus définitif de Kourrier (template absent, adresse refusée…) : journalisé,
 * l'événement est abandonné pour ne pas bloquer les suivants.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { inbox } from '../db/schema.js';
import { MailFailed, type Mailer } from './kourrier.js';
import { mailFor } from './messages.js';

export const MAILS_CONSUMER = 'billing-mails';

interface Log {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface MailsDeps {
  db: Db;
  mailer: Mailer;
  appUrl: string;
  log?: Log;
}

export type MailOutcome = 'sent' | 'none' | 'duplicate' | 'rejected';

/** Traite un événement ; une erreur (Kourrier injoignable, base) fait relivrer le message. */
export async function handleMailEvent(deps: MailsDeps, event: EventEnvelope): Promise<MailOutcome> {
  const [seen] = await deps.db
    .select({ eventId: inbox.eventId })
    .from(inbox)
    .where(and(eq(inbox.eventId, event.id), eq(inbox.consumer, MAILS_CONSUMER)));
  if (seen) return 'duplicate';

  const mail = await mailFor(deps.db, deps.appUrl, event);
  let outcome: MailOutcome = 'none';
  if (mail) {
    try {
      await deps.mailer.send(mail);
      outcome = 'sent';
      deps.log?.info({ template: mail.template, eventId: event.id }, 'e-mail de paiement envoyé');
    } catch (e) {
      if (!(e instanceof MailFailed) || e.retryable) throw e;
      outcome = 'rejected';
      deps.log?.error(
        { template: mail.template, eventId: event.id, status: e.status },
        'e-mail de paiement refusé par Kourrier, abandonné',
      );
    }
  }
  await deps.db
    .insert(inbox)
    .values({ eventId: event.id, consumer: MAILS_CONSUMER })
    .onConflictDoNothing();
  return outcome;
}

/**
 * Démarre le consommateur durable ; renvoie la fonction d'arrêt. À sa
 * création, il ne lit que les événements à venir : un déploiement n'envoie
 * jamais d'e-mails pour le passé.
 */
export function startMailsConsumer(
  opts: MailsDeps & { bus: Bus; logger?: ConsumeOptions['logger'] },
): Promise<() => Promise<void>> {
  const { bus, logger, ...deps } = opts;
  return consumeEvents(bus, {
    durable: MAILS_CONSUMER,
    subjects: ['vtt.global.billing.>'],
    deliver: 'new',
    ...(logger ? { logger } : {}),
    handler: async (event) => {
      await handleMailEvent(deps, event);
    },
  });
}
