/**
 * Import des clients Stripe et du premium de l'ancienne app (champs de
 * users/{uid}) dans le service billing, APRÈS les comptes (identity).
 *
 *   node --env-file=backend/billing/.env backend/billing/dist/import/cli.js \
 *     --export ~/vtt-export --report ~/vtt-export/rapport-billing.ndjson [--dry-run]
 *
 *   --export   dossier des exports NDJSON de tools/firebase-export (users)
 *   --report   rapport : une ligne par utilisateur ayant eu un premium ou un client Stripe
 *   --dry-run  convertit et produit le rapport sans rien écrire (ni base, ni effets)
 *
 * Environnement :
 *   DATABASE_URL           rôle billing_svc (écriture)
 *   IDENTITY_DATABASE_URL  rôle identity_svc (lecture) : compte migré de chaque UID Firebase
 *   INTERNAL_API_SECRET, DICE_URL, IDENTITY_URL (facultatifs) : effets du premium en
 *                          cours (badge dans identity, tous les skins dans dice), par
 *                          les routes internes idempotentes, rejoués à chaque import
 *
 * Rejouable : un utilisateur déjà présent dans billing n'est pas modifié.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { EffectFailed, httpEffects } from '../clients/effects.js';
import { createDb } from '../db/client.js';
import { customers } from '../db/schema.js';
import type { FirestoreDoc, LegacyUser } from './legacy.js';
import { loadCustomer } from './loading.js';
import { transformCustomer } from './transform.js';

const { values } = parseArgs({
  options: {
    export: { type: 'string' },
    report: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.export || !values.report) {
  console.error('usage : cli.js --export <dossier> --report <fichier> [--dry-run]');
  process.exit(2);
}
const dryRun = values['dry-run'];
const env = {
  billing: process.env.DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
  secret: process.env.INTERNAL_API_SECRET || undefined,
  diceUrl: process.env.DICE_URL || undefined,
  identityUrl: process.env.IDENTITY_URL || undefined,
};
if (!dryRun) {
  const missing = [
    !env.billing && 'DATABASE_URL (billing_svc)',
    !env.identity && 'IDENTITY_DATABASE_URL (identity_svc)',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Manquant : ${missing.join(', ')}`);
    process.exit(2);
  }
}
const usersFile = join(values.export, 'users.ndjson');
if (!existsSync(usersFile)) {
  console.error(`${usersFile} introuvable : exporte d'abord users`);
  process.exit(1);
}

/** Lit un export en flux, document par document. */
async function* read(file: string): AsyncGenerator<FirestoreDoc> {
  let i = 0;
  for await (const line of createInterface({ input: createReadStream(file, 'utf8') })) {
    i++;
    if (!line.trim()) continue;
    try {
      const { path, id, data } = JSON.parse(line) as FirestoreDoc;
      yield { path: path ?? id, id, data };
    } catch {
      throw new Error(`${file}:${i} : JSON invalide`);
    }
  }
}

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

console.log('Lecture des comptes migrés…');
const accounts = new Map<string, string>();
if (env.identity) {
  const pool = new pg.Pool({ connectionString: env.identity, max: 1 });
  try {
    const { rows } = await pool.query<{ legacy_id: string; id: string }>(
      "select legacy_id, id from identity.legacy_ids where kind = 'firebase_uid'",
    );
    for (const r of rows) accounts.set(r.legacy_id, r.id);
  } finally {
    await pool.end();
  }
} else {
  console.warn('  (comptes non vérifiés : IDENTITY_DATABASE_URL absent)');
}
const verify = !!env.identity;
console.log(`Comptes migrés : ${accounts.size}`);

// ─── Clients ─────────────────────────────────────────────────────────────────

const base = env.billing && !dryRun ? createDb(env.billing) : null;
const effects =
  env.secret && env.diceUrl && env.identityUrl
    ? httpEffects({ diceUrl: env.diceUrl, identityUrl: env.identityUrl, secret: env.secret })
    : null;
if (!dryRun && !effects)
  console.warn(
    '  (effets du premium non appliqués : INTERNAL_API_SECRET, DICE_URL ou IDENTITY_URL absent)',
  );

const report = createWriteStream(values.report, { mode: 0o600 });
const write = (line: Record<string, unknown>) => report.write(JSON.stringify(line) + '\n');

const totals = {
  users: 0,
  customers: 0,
  premium: 0,
  withStripe: 0,
  imported: 0,
  alreadyImported: 0,
  noAccount: 0,
  effectsApplied: 0,
  effectsFailed: 0,
  errors: 0,
  warnings: 0,
};

console.log('Lecture des utilisateurs…');
for await (const doc of read(usersFile)) {
  if (!/^users\/[^/]+$/.test(doc.path)) continue;
  totals.users++;
  const c = transformCustomer(doc as FirestoreDoc<LegacyUser>);
  if (!c) continue;
  totals.customers++;
  if (c.premium) totals.premium++;
  if (c.stripeCustomerId) totals.withStripe++;
  totals.warnings += c.warnings.length;
  const out: Record<string, unknown> = {
    kind: 'customer',
    uid: c.uid,
    premium: c.premium,
    stripe: !!c.stripeCustomerId,
    subscription: !!c.subscriptionId,
    cancelAtPeriodEnd: c.cancelAtPeriodEnd,
    warnings: c.warnings,
  };
  const userId = accounts.get(c.uid);
  if (!userId) {
    out.status = verify ? 'no-account' : 'dry-run';
    if (verify) totals.noAccount++;
    write(out);
    continue;
  }
  out.userId = userId;
  if (dryRun) {
    out.status = 'dry-run';
    write(out);
    continue;
  }
  try {
    out.status = await loadCustomer(base!.db, userId, c);
    if (out.status === 'imported') totals.imported++;
    else totals.alreadyImported++;
    // Effets du premium tel qu'il est dans billing (import précédent compris) : rejoués sans risque
    const [row] = await base!.db
      .select({ premium: customers.premium })
      .from(customers)
      .where(eq(customers.userId, userId));
    if (row?.premium && effects) {
      try {
        await effects.setAllSkins(userId, true);
        await effects.setPremium(userId, true);
        totals.effectsApplied++;
        out.effects = 'applied';
      } catch (e) {
        totals.effectsFailed++;
        out.effects = e instanceof EffectFailed ? e.message : 'échec';
      }
    }
  } catch (err) {
    totals.errors++;
    out.status = 'error';
    out.error = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
  write(out);
}

await new Promise((ok) => report.end(ok));
await base?.pool.end();

console.log(
  dryRun
    ? `Simulation : rien n'a été écrit. ${totals.users} utilisateur(s) lus, ${totals.customers} ` +
        `client(s) à importer dont ${totals.premium} premium en cours et ${totals.withStripe} ` +
        `avec un client Stripe ; sans compte migré : ${totals.noAccount}, avertissements : ` +
        `${totals.warnings}.`
    : `Clients importés : ${totals.imported}, déjà importés : ${totals.alreadyImported}, ` +
        `sans compte migré : ${totals.noAccount}, erreurs : ${totals.errors} ` +
        `(${totals.customers} client(s) dont ${totals.premium} premium en cours, ` +
        `${totals.withStripe} avec un client Stripe). Premium appliqué dans dice et identity : ` +
        `${totals.effectsApplied}, en échec : ${totals.effectsFailed}.`,
);
console.log(`Rapport : ${values.report}`);
if (totals.errors || totals.effectsFailed) process.exitCode = 1;
