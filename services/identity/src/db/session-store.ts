/**
 * Stockage Postgres des refresh tokens. La session est verrouillée
 * (SELECT … FOR UPDATE) pendant la rotation : deux renouvellements simultanés
 * du même jeton ne peuvent pas tous deux réussir.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { SessionStore, SessionTx } from '../tokens/refresh.js';
import type { Db } from './client.js';
import { sessions } from './schema.js';

export function pgSessionStore(db: Db): SessionStore {
  return {
    transaction(fn) {
      return db.transaction(async (tx) => {
        const operations: SessionTx = {
          async findByHashForUpdate(tokenHash) {
            const [ligne] = await tx
              .select({
                id: sessions.id,
                userId: sessions.userId,
                familyId: sessions.familyId,
                expiresAt: sessions.expiresAt,
                rotatedAt: sessions.rotatedAt,
                revokedAt: sessions.revokedAt,
              })
              .from(sessions)
              .where(eq(sessions.tokenHash, tokenHash))
              .for('update');
            return ligne ?? null;
          },
          async insert(s) {
            await tx.insert(sessions).values({
              id: s.id,
              userId: s.userId,
              familyId: s.familyId,
              tokenHash: s.tokenHash,
              expiresAt: s.expiresAt,
              userAgent: s.userAgent ?? null,
              ip: s.ip ?? null,
            });
          },
          async markRotated(id, at) {
            await tx.update(sessions).set({ rotatedAt: at }).where(eq(sessions.id, id));
          },
          async revokeFamily(familyId, at) {
            await tx
              .update(sessions)
              .set({ revokedAt: at })
              .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
          },
        };
        return fn(operations);
      });
    },
  };
}
