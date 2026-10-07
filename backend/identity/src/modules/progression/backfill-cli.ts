/**
 * Reprise de l'existant de la progression du compte (docs/progression.md § 9),
 * à lancer une fois au déploiement ; rejouable sans risque.
 *
 *   BACKFILL_SOURCE_URL=postgres://… DATABASE_URL=postgres://identity_svc:… \
 *     node dist/modules/progression/backfill-cli.js [--dry-run] [--user <uuid>]…
 *
 *   BACKFILL_SOURCE_URL  rôle qui lit identity, characters, campaign et dice
 *   DATABASE_URL         rôle identity_svc (écritures, par le code du service)
 *   --dry-run            affiche le rapport sans rien écrire
 *   --user               limite à ces comptes (répétable)
 *
 * La sortie ne contient que des compteurs, jamais d'identifiant ni d'e-mail.
 */
import { parseArgs } from 'node:util';
import pg from 'pg';
import { createDb } from '../../db/client.js';
import { applyFacts, readFacts } from './backfill.js';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    user: { type: 'string', multiple: true },
  },
});

const sourceUrl = process.env.BACKFILL_SOURCE_URL;
const targetUrl = process.env.DATABASE_URL;
if (!sourceUrl || (!targetUrl && !values['dry-run'])) {
  console.error('BACKFILL_SOURCE_URL et DATABASE_URL sont requises (DATABASE_URL sauf --dry-run)');
  process.exit(2);
}

const source = new pg.Pool({ connectionString: sourceUrl, max: 1 });
try {
  const facts = await readFacts(source, values.user?.length ? values.user : null);
  const totals: Record<string, number> = {};
  for (const f of facts.values())
    for (const [kind, n] of Object.entries(f.totals)) totals[kind] = (totals[kind] ?? 0) + (n ?? 0);
  console.log(JSON.stringify({ comptes: facts.size, totaux: totals }, null, 2));

  if (!values['dry-run']) {
    const { db, pool } = createDb(targetUrl!, { max: 2, applicationName: 'progression-backfill' });
    try {
      const report = await applyFacts(db, facts);
      console.log(JSON.stringify({ rapport: report }, null, 2));
    } finally {
      await pool.end();
    }
  }
} finally {
  await source.end();
}
