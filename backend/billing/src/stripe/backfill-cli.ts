/**
 * Rattrapage depuis Stripe de tous les clients connus (voir backfill.ts).
 *
 *   pnpm --filter @vtt/billing stripe:backfill                  tous les clients
 *   pnpm --filter @vtt/billing stripe:backfill --user <uuid>    un seul utilisateur
 *
 * Variables : DATABASE_URL (rôle billing_svc), STRIPE_SECRET_KEY ; pour
 * appliquer les droits dans dice et identity : DICE_URL, IDENTITY_URL,
 * INTERNAL_API_SECRET (sinon --sans-effets).
 */
import { parseArgs } from 'node:util';
import { eq, isNotNull } from 'drizzle-orm';
import { httpEffects, type Effects } from '../clients/effects.js';
import { createDb } from '../db/client.js';
import { customers } from '../db/schema.js';
import { backfillCustomer } from './backfill.js';
import { stripeApi } from './client.js';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    'sans-effets': { type: 'boolean', default: false },
  },
});
const { DATABASE_URL, STRIPE_SECRET_KEY } = process.env;
if (!DATABASE_URL || !STRIPE_SECRET_KEY) {
  console.error('DATABASE_URL et STRIPE_SECRET_KEY sont requises');
  process.exit(2);
}

const noEffects: Effects = {
  grantSkin: async () => {},
  setAllSkins: async () => {},
  setPremium: async () => {},
};
const effects = values['sans-effets']
  ? noEffects
  : httpEffects({
      diceUrl: process.env.DICE_URL,
      identityUrl: process.env.IDENTITY_URL,
      secret: process.env.INTERNAL_API_SECRET,
    });

const { db, pool } = createDb(DATABASE_URL);
const deps = { db, stripe: stripeApi(STRIPE_SECRET_KEY), effects };
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
