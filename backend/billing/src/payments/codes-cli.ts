/**
 * Codes à échanger (docs/paiement.md, « Codes »).
 *
 *   pnpm --filter @vtt/billing codes:create --premium 30                 premium 30 jours, 1 utilisation
 *   pnpm --filter @vtt/billing codes:create --dice bismuth --uses 20     skin de dés, 20 comptes
 *   pnpm --filter @vtt/billing codes:create --frame Token5 --code DISCORD2026 --until 2026-12-31
 *   pnpm --filter @vtt/billing codes:create --premium 30 --count 10      dix codes à usage unique
 *   pnpm --filter @vtt/billing codes:list                                codes et utilisations
 *
 * Options : --uses N (comptes différents), --until AAAA-MM-JJ (fin de validité, incluse),
 * --code TEXTE (code choisi, sinon généré), --note TEXTE (pour qui, pourquoi).
 * Variable : DATABASE_URL (rôle billing_svc).
 */
import { parseArgs } from 'node:util';
import { desc } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { codes } from '../db/schema.js';
import { createCode, type CodeReward } from './codes.js';

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    premium: { type: 'string' },
    dice: { type: 'string' },
    frame: { type: 'string' },
    uses: { type: 'string' },
    until: { type: 'string' },
    code: { type: 'string' },
    note: { type: 'string' },
    count: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL est requise');
const { db, pool } = createDb(process.env.DATABASE_URL);

try {
  if (command === 'create') {
    const rewards = [values.premium, values.dice, values.frame].filter((v) => v !== undefined);
    if (rewards.length !== 1)
      fail('Une récompense et une seule : --premium <jours>, --dice <skin> ou --frame <cadre>');
    let reward: CodeReward;
    if (values.premium !== undefined) reward = { kind: 'premium', days: Number(values.premium) };
    else if (values.dice !== undefined) reward = { kind: 'dice_skin', itemId: values.dice };
    else reward = { kind: 'token_frame', itemId: values.frame! };
    // Fin de validité incluse : le code marche jusqu'à la fin du jour donné (heure de Paris)
    const validUntil = values.until ? new Date(`${values.until}T23:59:59+02:00`) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) fail('--until attend AAAA-MM-JJ');
    const count = Number(values.count ?? 1);
    if (!Number.isInteger(count) || count < 1) fail('--count attend un entier positif');
    if (count > 1 && values.code) fail('--code et --count ne vont pas ensemble');
    for (let i = 0; i < count; i++) {
      const code = await createCode(db, {
        reward,
        ...(values.code ? { code: values.code } : {}),
        maxUses: Number(values.uses ?? 1),
        validUntil,
        note: values.note ?? null,
      });
      console.log(code);
    }
  } else if (command === 'list') {
    const rows = await db.select().from(codes).orderBy(desc(codes.createdAt));
    for (const c of rows) {
      const reward = c.kind === 'premium' ? `premium ${c.durationDays} j` : `${c.kind} ${c.itemId}`;
      const until = c.validUntil ? ` jusqu'au ${c.validUntil.toISOString().slice(0, 10)}` : '';
      console.log(
        `${c.code}\t${reward}\t${c.uses}/${c.maxUses}${until}${c.note ? `\t${c.note}` : ''}`,
      );
    }
    if (!rows.length) console.log('Aucun code.');
  } else {
    fail('Commande : create ou list');
  }
} catch (e) {
  fail((e as Error).message);
} finally {
  await pool.end();
}
