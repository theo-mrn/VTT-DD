/**
 * Consommateur durable du bus : chaque événement publié sur `vtt.>` (flux
 * VTT_EVENTS) est ajouté au journal. Un seul consommateur durable par
 * environnement (HISTORY_CONSUMER), partagé par les réplicas : JetStream
 * répartit les messages, l'inbox écarte les doublons, le verrou de la tête de
 * chaîne garde l'ordre dans chaque campagne.
 *
 * Acquittement (par @vtt/platform) : après l'ajout (ou un doublon) ; un échec
 * passager (Postgres injoignable, délai) relivre le message 5 s plus tard. Un
 * événement que Postgres refusera toujours (donnée invalide, contrainte) est
 * journalisé en erreur puis acquitté : le relivrer bloquerait sans fin.
 */
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import type { Db } from '../db/client.js';
import { appendEvents, dbErrorCode, isPermanentDbError } from '../journal/append.js';
import { eraseFor } from '../journal/erase.js';

/** Logger pino (celui de Fastify). */
export type Logger = NonNullable<ConsumeOptions['logger']>;

export interface ConsumerOptions {
  bus: Bus;
  db: Db;
  logger: Logger;
  /** Nom du consommateur durable. */
  durable: string;
  /** Sujets écoutés (défaut : `vtt.>`). */
  subjects?: string[];
}

/** Démarre la consommation ; renvoie la fonction d'arrêt. */
export async function startConsumer(o: ConsumerOptions): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: o.durable,
    subjects: o.subjects ?? ['vtt.>'],
    deliver: 'all',
    logger: o.logger,
    async handler(event) {
      try {
        const [r] = await appendEvents(o.db, [event], 'history');
        o.logger.debug(
          { eventId: event.id, type: event.type, status: r?.status, seq: r?.seq },
          'événement journalisé',
        );
        // Compte ou campagne supprimés : effacement (docs/legal.md), rejouable sans effet
        const erased = await eraseFor(o.db, event);
        if (erased !== null)
          o.logger.info({ eventId: event.id, type: event.type, erased }, 'journal effacé');
      } catch (err) {
        // L'erreur de Drizzle cite la requête et ses paramètres (charge utile, auteur) :
        // seuls l'id de l'événement et le code SQLSTATE partent dans les logs
        const code = dbErrorCode(err);
        if (!isPermanentDbError(err))
          throw new Error(`ajout au journal impossible (${code ?? 'inconnu'})`);
        o.logger.error(
          { eventId: event.id, type: event.type, roomId: event.roomId, code },
          'événement refusé par Postgres : ignoré',
        );
      }
    },
  });
}
