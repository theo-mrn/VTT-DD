/**
 * Import des jets et préférences de dés Firebase dans le service dice, APRÈS
 * les comptes (identity), les personnages (character) et les campagnes
 * (campaign).
 *
 *   node --env-file=backend/dice/.env backend/dice/dist/import/cli.js \
 *     --export ~/vtt-export --report ~/vtt-export/rapport-des.ndjson [--dry-run]
 *
 *   --export   dossier des exports NDJSON de tools/firebase-export :
 *              rolls (récursif), users, salles (facultatif : auteurs des vieux jets)
 *   --report   rapport : une ligne par campagne, par utilisateur (préférences)
 *              et par jet en erreur
 *   --dry-run  convertit et produit le rapport sans rien écrire en base
 *
 * Environnement :
 *   DATABASE_URL           rôle dice_svc (écriture ; en simulation, lecture de legacy_ids)
 *   IDENTITY_DATABASE_URL  rôle identity_svc : compte migré de chaque UID Firebase
 *   CAMPAIGN_DATABASE_URL  rôle campaign_svc : campagnes importées
 *   CHARACTER_DATABASE_URL rôle characters_svc (facultatif) : personnages des jets
 * En simulation, les correspondances sont vérifiées si les URL sont fournies
 * (lecture seule). Rejouable : les jets déjà importés sont ignorés.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { createDb } from '../db/client.js';
import type { FirestoreDoc, LegacyName, LegacyRoll, LegacyUser } from './legacy.js';
import {
  alreadyImported,
  LEGACY_SOURCE,
  loadPreferences,
  loadRolls,
  nameKey,
  prepareRoll,
  type Mappings,
  type NewRollRow,
} from './loading.js';
import { isRollPath, transformPreferences, transformRoll } from './transform.js';

const BATCH = 500;

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
  dice: process.env.DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
  campaign: process.env.CAMPAIGN_DATABASE_URL || undefined,
  character: process.env.CHARACTER_DATABASE_URL || undefined,
};
if (!dryRun) {
  const missing = [
    !env.dice && 'DATABASE_URL (dice_svc)',
    !env.identity && 'IDENTITY_DATABASE_URL (identity_svc)',
    !env.campaign && 'CAMPAIGN_DATABASE_URL (campaign_svc)',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Manquant : ${missing.join(', ')}`);
    process.exit(2);
  }
}

/** Lit un export en flux, document par document. */
async function* read(name: string): AsyncGenerator<FirestoreDoc> {
  const file = join(values.export!, `${name}.ndjson`);
  if (!existsSync(file)) {
    console.warn(`  (absent : ${name}.ndjson)`);
    return;
  }
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

if (!existsSync(join(values.export, 'rolls.ndjson'))) {
  console.error(`${join(values.export, 'rolls.ndjson')} introuvable : exporte d'abord rolls`);
  process.exit(1);
}

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

async function rows<T extends pg.QueryResultRow>(url: string | undefined, sql: string) {
  if (!url) return undefined;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    return (await pool.query<T>(sql)).rows;
  } finally {
    await pool.end();
  }
}

console.log('Lecture des correspondances…');
const accounts = new Map(
  (
    (await rows<{ legacy_id: string; id: string }>(
      env.identity,
      "select legacy_id, id from identity.legacy_ids where kind = 'firebase_uid'",
    )) ?? []
  ).map((x) => [x.legacy_id, x.id]),
);
const campaigns = new Map(
  (
    (await rows<{ legacy_id: string; campaign_id: string }>(
      env.campaign,
      `select legacy_id, campaign_id from campaign.legacy_ids where source = '${LEGACY_SOURCE}'`,
    )) ?? []
  )
    .filter((x) => x.legacy_id.startsWith('Salle/'))
    .map((x) => [x.legacy_id.slice('Salle/'.length), x.campaign_id]),
);
const characters = new Map(
  (
    (await rows<{ legacy_id: string; character_id: string }>(
      env.character,
      `select legacy_id, character_id from characters.legacy_ids where source = '${LEGACY_SOURCE}'`,
    )) ?? []
  ).map((x) => [x.legacy_id, x.character_id]),
);
// Auteurs des vieux jets sans uid : nom affiché dans la campagne (unique)
const names = new Map<string, string>();
const ambiguous = new Set<string>();
for await (const doc of read('salles')) {
  const m = /^salles\/([^/]+)\/Noms\/([^/]+)$/.exec(doc.path);
  const nom = (doc.data as LegacyName | undefined)?.nom;
  if (!m || typeof nom !== 'string' || !nom.trim()) continue;
  const key = nameKey(m[1]!, nom.trim());
  if (names.has(key) && names.get(key) !== m[2]) ambiguous.add(key);
  names.set(key, m[2]!);
}
for (const k of ambiguous) names.delete(k);
const verify = !!env.identity && !!env.campaign;
if (dryRun && !verify)
  console.warn(
    '  (comptes et campagnes non vérifiés : IDENTITY_ et CAMPAIGN_DATABASE_URL absents)',
  );
console.log(
  `Comptes migrés : ${accounts.size}, campagnes importées : ${campaigns.size}, ` +
    `personnages importés : ${characters.size}, noms connus : ${names.size}`,
);
const maps: Mappings = { accounts, campaigns, characters, names };

// ─── Jets ────────────────────────────────────────────────────────────────────

const base = env.dice ? createDb(env.dice) : null;
const report = createWriteStream(values.report, { mode: 0o600 });
const write = (line: Record<string, unknown>) => report.write(JSON.stringify(line) + '\n');

interface CampaignLine {
  code: string;
  campaignId: string | null;
  rolls: number;
  imported: number;
  alreadyImported: number;
  noAuthor: number;
  noCharacter: number;
  errors: number;
  warnings: Record<string, number>;
}
const byCampaign = new Map<string, CampaignLine>();
const line = (code: string) => {
  let l = byCampaign.get(code);
  if (!l) {
    l = {
      code,
      campaignId: campaigns.get(code) ?? null,
      rolls: 0,
      imported: 0,
      alreadyImported: 0,
      noAuthor: 0,
      noCharacter: 0,
      errors: 0,
      warnings: {},
    };
    byCampaign.set(code, l);
  }
  return l;
};

let pending: { legacyId: string; code: string; row: NewRollRow }[] = [];
async function flush() {
  const batch = pending;
  pending = [];
  if (!batch.length || !base) return;
  const done = await alreadyImported(
    base.db,
    batch.map((b) => b.legacyId),
  );
  const fresh = batch.filter((b) => !done.has(b.legacyId));
  for (const b of batch) if (done.has(b.legacyId)) line(b.code).alreadyImported++;
  if (dryRun) return;
  await loadRolls(base.db, fresh);
  for (const b of fresh) line(b.code).imported++;
}

console.log('Lecture des jets…');
let total = 0;
for await (const doc of read('rolls')) {
  if (!isRollPath(doc.path)) continue;
  total++;
  const code = doc.path.split('/')[1]!;
  const l = line(code);
  l.rolls++;
  try {
    const roll = transformRoll(doc as FirestoreDoc<LegacyRoll>);
    for (const w of roll.warnings) l.warnings[w] = (l.warnings[w] ?? 0) + 1;
    if (dryRun && !verify) continue;
    const prep = prepareRoll(roll, maps);
    if (prep.status === 'no-campaign') continue;
    if (!prep.authorFound) l.noAuthor++;
    if (!prep.characterFound) l.noCharacter++;
    pending.push({ legacyId: roll.legacyId, code, row: prep.row });
    if (pending.length >= BATCH) await flush();
  } catch (err) {
    l.errors++;
    write({
      kind: 'roll',
      legacyId: doc.path,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
await flush();

const totals = { imported: 0, alreadyImported: 0, noCampaign: 0, noAuthor: 0, errors: 0 };
for (const l of byCampaign.values()) {
  const status =
    dryRun && !verify ? 'dry-run' : !l.campaignId ? 'no-campaign' : dryRun ? 'dry-run' : 'imported';
  if (verify && !l.campaignId) totals.noCampaign += l.rolls - l.errors;
  totals.imported += l.imported;
  totals.alreadyImported += l.alreadyImported;
  totals.noAuthor += l.noAuthor;
  totals.errors += l.errors;
  write({ kind: 'campaign', status, ...l });
}

// ─── Préférences ─────────────────────────────────────────────────────────────

console.log('Lecture des préférences…');
const prefs = { users: 0, imported: 0, noAccount: 0, skins: 0 };
for await (const doc of read('users')) {
  if (!/^users\/[^/]+$/.test(doc.path)) continue;
  const p = transformPreferences(doc as FirestoreDoc<LegacyUser>);
  if (!p) continue;
  prefs.users++;
  const userId = accounts.get(p.uid);
  const out: Record<string, unknown> = {
    kind: 'preferences',
    uid: p.uid,
    skinId: p.skinId,
    inventory: p.inventory,
    warnings: p.warnings,
  };
  if (!userId) {
    out.status = verify ? 'no-account' : 'dry-run';
    if (verify) prefs.noAccount++;
  } else if (dryRun) {
    out.status = 'dry-run';
  } else {
    const r = await loadPreferences(base!.db, userId, p);
    Object.assign(out, { status: 'imported', userId, ...r });
    if (r.preferences || r.skins) prefs.imported++;
    prefs.skins += r.skins;
  }
  write(out);
}

await new Promise((ok) => report.end(ok));
await base?.pool.end();

console.log(
  dryRun
    ? `Simulation : rien n'a été écrit. ${total} jet(s) lus, déjà importés : ` +
        `${totals.alreadyImported}, sans campagne importée : ${totals.noCampaign}, ` +
        `sans auteur retrouvé : ${totals.noAuthor}, erreurs : ${totals.errors}. ` +
        `Préférences : ${prefs.users} utilisateur(s), sans compte migré : ${prefs.noAccount}.`
    : `Jets importés : ${totals.imported}, déjà importés : ${totals.alreadyImported}, ` +
        `sans campagne importée : ${totals.noCampaign}, sans auteur retrouvé ` +
        `(importés sans compte) : ${totals.noAuthor}, erreurs : ${totals.errors}. ` +
        `Préférences importées : ${prefs.imported}/${prefs.users} (${prefs.skins} skin(s)), ` +
        `sans compte migré : ${prefs.noAccount}.`,
);
console.log(`Rapport : ${values.report}`);
if (totals.errors) process.exitCode = 1;
