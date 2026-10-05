/**
 * Durées de conservation d'identity (politique de confidentialité du front, /privacy) :
 * - sessions : une ligne par jeton, avec l'IP et le navigateur ; supprimée 30 jours après sa
 *   rotation, sa révocation ou son expiration. Pendant ces 30 jours, un jeton déjà consommé
 *   qui revient est encore reconnu et révoque sa famille (vol probable) ; le dernier jeton
 *   d'une session ouverte n'est jamais concerné ;
 * - jetons envoyés par e-mail : supprimés un jour après leur utilisation ou leur expiration
 *   (le temps d'afficher « lien déjà utilisé » plutôt que « lien invalide »).
 */
import { uuidv7 } from '@vtt/contracts';
import type { Logger } from '@vtt/platform';
import { lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { emailTokens, sessions } from '../db/schema.js';
import type { Mailer } from '../mail/mailer.js';
import {
  inactiveToExpire,
  inactiveToWarn,
  INACTIVITY_NOTICE_DAYS,
  markInactivityWarned,
  purgeRequestedDeletions,
  requestDeletion,
} from '../modules/securite/account-lifecycle.js';
import { lienConnexion } from '../modules/securite/jetons.js';
import { mailInactivite, mailSuppressionProgrammee } from '../modules/securite/mails.js';

const DAY_MS = 86_400_000;
export const SESSIONS_KEPT_DAYS = 30;
export const EMAIL_TOKENS_KEPT_DAYS = 1;

export async function purgeExpired(
  db: Db,
  now: Date = new Date(),
): Promise<{ sessions: number; emailTokens: number }> {
  const sessionsBefore = new Date(now.getTime() - SESSIONS_KEPT_DAYS * DAY_MS);
  const tokensBefore = new Date(now.getTime() - EMAIL_TOKENS_KEPT_DAYS * DAY_MS);
  const purgedSessions = await db
    .delete(sessions)
    .where(
      lt(
        sql`coalesce(${sessions.revokedAt}, ${sessions.rotatedAt}, ${sessions.expiresAt})`,
        sessionsBefore,
      ),
    )
    .returning({ id: sessions.id });
  const purgedTokens = await db
    .delete(emailTokens)
    .where(lt(sql`coalesce(${emailTokens.usedAt}, ${emailTokens.expiresAt})`, tokensBefore))
    .returning({ hash: emailTokens.tokenHash });
  return { sessions: purgedSessions.length, emailTokens: purgedTokens.length };
}

/**
 * Cycle de vie des comptes (docs/legal.md), dans la même passe : suppressions arrivées à
 * échéance purgées, comptes inactifs prévenus puis, sans retour, mis en suppression (avec
 * l'e-mail qui donne la date et le moyen d'annuler). Un avertissement n'est noté qu'une fois
 * l'e-mail accepté : un échec d'envoi sera retenté à la passe suivante.
 */
export async function runAccountLifecycle(o: {
  db: Db;
  mailer: Mailer;
  appUrl: string;
  log: Pick<Logger, 'warn'>;
  now?: Date;
}): Promise<{ purged: number; expired: number; warned: number }> {
  const now = o.now ?? new Date();
  const ctx = { correlationId: uuidv7() };
  const login = lienConnexion(o.appUrl);

  const purged = await purgeRequestedDeletions(o.db, ctx, now);

  const expiring = await inactiveToExpire(o.db, now);
  for (const { id } of expiring) {
    const request = await requestDeletion(o.db, ctx, id, { now, reason: 'inactivity' });
    if (request?.email)
      await o.mailer
        .envoyer(mailSuppressionProgrammee(request.email, login, request.purgeAt))
        .catch((err: unknown) =>
          o.log.warn({ err, userId: id }, 'e-mail de suppression non envoyé'),
        );
  }

  let warned = 0;
  const deadline = new Date(now.getTime() + INACTIVITY_NOTICE_DAYS * DAY_MS);
  for (const { id, email } of await inactiveToWarn(o.db, now)) {
    try {
      await o.mailer.envoyer(mailInactivite(email!, login, deadline));
      await markInactivityWarned(o.db, id, now);
      warned += 1;
    } catch (err) {
      o.log.warn({ err, userId: id }, 'e-mail d’inactivité non envoyé');
    }
  }
  return { purged, expired: expiring.length, warned };
}
