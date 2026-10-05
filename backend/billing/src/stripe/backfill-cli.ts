/**
 * Rattrapage depuis Stripe de tous les clients connus (voir backfill.ts).
 *
 *   pnpm --filter @vtt/billing stripe:backfill                  tous les clients
 *   pnpm --filter @vtt/billing stripe:backfill --user <uuid>    un seul utilisateur
 *
 * Variables : DATABASE_URL (rôle billing_svc), STRIPE_SECRET_KEY. Les droits
 * modifiés sont publiés sur le bus par l'outbox de billing.
 */
import { parseArgs } from 'node:util';
import { eq, isNotNull } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { customers } from '../db/schema.js';
import { backfillCustomer } from './backfill.js';
import { stripeApi } from './client.js';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
  },
});
const { DATABASE_URL, STRIPE_SECRET_KEY } = process.env;
if (!DATABASE_URL || !STRIPE_SECRET_KEY) {
  console.error('DATABASE_URL et STRIPE_SECRET_KEY sont requises');
  process.exit(2);
}

const { db, pool } = createDb(DATABASE_URL);
const deps = { db, stripe: stripeApi(STRIPE_SECRET_KEY) };
const rows = await db
  .select({ userId: customers.userId, customerId: customers.stripeCustomerId })
  .from(customers)
  .where(values.user ? eq(customers.userId, values.user) : isNotNull(customers.stripeCustomerId));

let failed = 0;
for (const row of rows) {
  if (!row.customerId) continue;
  try {
    const done = await backfillCustomer(deps, row.userId, row.customerId);
    console.log(`${row.userId} : ${done.subscriptions} abonnement(s), ${done.invoices} facture(s)`);
  } catch (e) {
    failed++;
    console.error(`${row.userId} : échec, ${(e as Error).message.split('\n')[0]}`);
  }
}
await pool.end();
console.log(`${rows.length} client(s) relus chez Stripe, ${failed} en échec.`);
if (failed) process.exitCode = 1;
