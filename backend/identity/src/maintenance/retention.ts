/**
 * Durées de conservation d'identity (politique de confidentialité du front, /privacy) :
 * - sessions : une ligne par jeton, avec l'IP et le navigateur ; supprimée 30 jours après sa
 *   rotation, sa révocation ou son expiration. Pendant ces 30 jours, un jeton déjà consommé
 *   qui revient est encore reconnu et révoque sa famille (vol probable) ; le dernier jeton
 *   d'une session ouverte n'est jamais concerné ;
 * - jetons envoyés par e-mail : supprimés un jour après leur utilisation ou leur expiration
 *   (le temps d'afficher « lien déjà utilisé » plutôt que « lien invalide »).
 */
import { lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { emailTokens, sessions } from '../db/schema.js';

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
