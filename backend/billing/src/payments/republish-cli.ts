/**
 * Republie l'état des droits (billing.entitlements_changed, version +1) : dice
 * et identity se réalignent sur billing. À lancer après une restauration de
 * leur base, ou pour corriger un écart constaté.
 *
 *   pnpm --filter @vtt/billing rights:republish                  tous les utilisateurs
 *   pnpm --filter @vtt/billing rights:republish --user <uuid>    un seul
 *
 * Variable : DATABASE_URL (rôle billing_svc). Les événements partent par
 * l'outbox : billing doit tourner (relais) pour qu'ils soient publiés.
 */
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { entitlements } from '../db/schema.js';
import { SYSTEM } from './common.js';
import { publishRights } from './entitlements.js';

const { values } = parseArgs({ options: { user: { type: 'string' } } });
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL est requise');
  process.exit(2);
}
const { db, pool } = createDb(process.env.DATABASE_URL);
const rows = await db
  .selectDistinct({ userId: entitlements.userId })
  .from(entitlements)
  .where(values.user ? eq(entitlements.userId, values.user) : sql`true`);

const ctx = { correlationId: uuidv7() };
for (const { userId } of rows) {
  await db.transaction((tx) => publishRights(tx, ctx, SYSTEM, userId));
}
await pool.end();
console.log(
  `Droits republiés pour ${rows.length} utilisateur(s) (corrélation ${ctx.correlationId}).`,
);
