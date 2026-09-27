/**
 * Import de l'ancien Historique Firebase (`Historique/{code}/events`) dans le
 * journal du service history, APRÈS les comptes (identity), les personnages
 * (character) et les campagnes (campaign).
 *
 *   node --env-file=backend/history/.env backend/history/dist/import/cli.js \
 *     --export ~/vtt-export --report ~/vtt-export/rapport-historique.ndjson [--dry-run]
 *
 *   --export   dossier des exports NDJSON de tools/firebase-export : Historique (récursif)
 *   --report   rapport : une ligne par campagne et par événement en erreur
 *   --dry-run  convertit et produit le rapport sans rien écrire en base
 *
 * Environnement :
 *   DATABASE_URL           rôle history_svc (écriture ; en simulation, lecture de l'inbox)
 *   IDENTITY_DATABASE_URL  rôle identity_svc : compte migré de chaque UID Firebase
 *   CAMPAIGN_DATABASE_URL  rôle campaign_svc : campagnes importées et rôles des membres
 *   CHARACTER_DATABASE_URL rôle characters_svc (facultatif) : personnages des événements
 * En simulation, les correspondances sont vérifiées si les URL sont fournies
 * (lecture seule). Rejouable : les événements déjà importés sont écartés.
 *
 * Sorties : compteurs seulement (ni contenu, ni nom, ni e-mail).
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import type { EventEnvelope } from '@vtt/contracts';
import pg from 'pg';
import { createDb } from '../db/client.js';
import { ensurePartitions, monthsBetween } from '../journal/partitions.js';
import type { FirestoreDoc, LegacyHistoryEvent } from './legacy.js';
import {
  alreadyImported,
  campaignsWithLiveEvents,
  chronological,
  importCampaign,
  prepareEvent,
  type Mappings,
  type MemberRole,
} from './loading.js';
import { isEventPath, transformEvent } from './transform.js';

const LEGACY_SOURCE = 'firebase';

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
  history: process.env.DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
  campaign: process.env.CAMPAIGN_DATABASE_URL || undefined,
  character: process.env.CHARACTER_DATABASE_URL || undefined,
};
if (!dryRun) {
  const missing = [
    !env.history && 'DATABASE_URL (history_svc)',
    !env.identity && 'IDENTITY_DATABASE_URL (identity_svc)',
    !env.campaign && 'CAMPAIGN_DATABASE_URL (campaign_svc)',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Manquant : ${missing.join(', ')}`);
    process.exit(2);
  }
}

const source = join(values.export, 'Historique.ndjson');
if (!existsSync(source)) {
  console.error(`${source} introuvable : exporte d'abord Historique`);
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

async function rows<T extends pg.QueryResultRow>(url: string | undefined, query: string) {
  if (!url) return undefined;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    return (await pool.query<T>(query)).rows;
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
const roles = new Map(
  (
    (await rows<{ campaign_id: string; user_id: string; role: MemberRole }>(
      env.campaign,
      'select campaign_id, user_id, role from campaign.campaign_members',
    )) ?? []
  ).map((x) => [`${x.campaign_id}:${x.user_id}`, x.role]),
);
const characters = new Map(
  (
    (await rows<{ legacy_id: string; character_id: string }>(
      env.character,
      `select legacy_id, character_id from characters.legacy_ids where source = '${LEGACY_SOURCE}'`,
    )) ?? []
  ).map((x) => [x.legacy_id, x.character_id]),
);
const verify = !!env.identity && !!env.campaign;
if (dryRun && !verify)
  console.warn(
    '  (comptes et campagnes non vérifiés : IDENTITY_ et CAMPAIGN_DATABASE_URL absents)',
  );
console.log(
  `Comptes migrés : ${accounts.size}, campagnes importées : ${campaigns.size}, ` +
    `personnages importés : ${characters.size}`,
);
const maps: Mappings = { accounts, campaigns, characters, roles };

// ─── Lecture et conversion ───────────────────────────────────────────────────

const report = createWriteStream(values.report, { mode: 0o600 });
const write = (line: Record<string, unknown>) => report.write(JSON.stringify(line) + '\n');

interface CampaignLine {
  code: string;
  campaignId: string | null;
  events: number;
  imported: number;
  alreadyImported: number;
  private: number;
  noOwner: number;
  noCharacter: number;
  errors: number;
  warnings: Record<string, number>;
  error?: string;
}
const byCode = new Map<string, CampaignLine>();
const line = (code: string) => {
  let l = byCode.get(code);
  if (!l) {
    l = {
      code,
      campaignId: campaigns.get(code) ?? null,
      events: 0,
      imported: 0,
      alreadyImported: 0,
      private: 0,
      noOwner: 0,
      noCharacter: 0,
      errors: 0,
      warnings: {},
    };
    byCode.set(code, l);
  }
  return l;
};

/** Événements prêts, par campagne importée. */
const ready = new Map<string, { code: string; events: (EventEnvelope & { legacyId: string })[] }>();
const types = new Map<string, number>();
let total = 0;
let summaries = 0;
let first: Date | undefined;
let last: Date | undefined;

console.log("Lecture de l'ancien Historique…");
for await (const doc of read(source)) {
  if (!isEventPath(doc.path)) {
    if (/^Historique\/[^/]+\/summaries\//.test(doc.path)) summaries++;
    continue;
  }
  total++;
  const code = doc.path.split('/')[1]!;
  const l = line(code);
  l.events++;
  try {
    const e = transformEvent(doc as FirestoreDoc<LegacyHistoryEvent>);
    for (const w of e.warnings) l.warnings[w] = (l.warnings[w] ?? 0) + 1;
    types.set(e.type, (types.get(e.type) ?? 0) + 1);
    if (e.targetUid) l.private++;
    if (dryRun && !verify) continue;
    const prep = prepareEvent(e, maps);
    if (prep.status === 'no-campaign') continue;
    if (!prep.ownerFound) l.noOwner++;
    if (!prep.characterFound) l.noCharacter++;
    const campaignId = prep.envelope.roomId!;
    const bucket = ready.get(campaignId) ?? { code, events: [] };
    bucket.events.push({ ...prep.envelope, legacyId: e.legacyId });
    ready.set(campaignId, bucket);
    if (!first || e.occurredAt < first) first = e.occurredAt;
    if (!last || e.occurredAt > last) last = e.occurredAt;
  } catch (err) {
    l.errors++;
    write({
      kind: 'event',
      legacyId: doc.path,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Chargement ──────────────────────────────────────────────────────────────

const base = env.history ? createDb(env.history) : null;
const live = base ? await campaignsWithLiveEvents(base.db, [...ready.keys()]) : new Set<string>();
if (base && !dryRun && first && last) {
  // Partitions des mois de l'ancien Historique (sinon tout irait dans events_default)
  const created = await ensurePartitions(base.db, first, monthsBetween(first, last));
  console.log(`Partitions mensuelles créées : ${created}`);
}

for (const [campaignId, bucket] of ready) {
  const l = line(bucket.code);
  const sorted = bucket.events
    .map((e) => ({ e, occurredAt: new Date(e.occurredAt), legacyId: e.legacyId }))
    .sort(chronological)
    .map(({ e }) => {
      const { legacyId: _legacyId, ...envelope } = e;
      return envelope as EventEnvelope;
    });
  if (!base) continue;
  if (dryRun) {
    l.alreadyImported = (
      await alreadyImported(
        base.db,
        sorted.map((e) => e.id),
      )
    ).size;
    continue;
  }
  const r = await importCampaign(base.db, sorted);
  l.imported = r.imported;
  l.alreadyImported = r.duplicates;
  if (r.error) {
    l.error = r.error;
    l.errors++;
  }
}

const totals = {
  imported: 0,
  alreadyImported: 0,
  noCampaign: 0,
  private: 0,
  noOwner: 0,
  noCharacter: 0,
  errors: 0,
};
const warnings = new Map<string, number>();
for (const l of byCode.values()) {
  const status =
    dryRun && !verify ? 'dry-run' : !l.campaignId ? 'no-campaign' : dryRun ? 'dry-run' : 'imported';
  if (verify && !l.campaignId) totals.noCampaign += l.events - l.errors;
  totals.imported += l.imported;
  totals.alreadyImported += l.alreadyImported;
  totals.private += l.private;
  totals.noOwner += l.noOwner;
  totals.noCharacter += l.noCharacter;
  totals.errors += l.errors;
  for (const [w, n] of Object.entries(l.warnings)) warnings.set(w, (warnings.get(w) ?? 0) + n);
  write({
    kind: 'campaign',
    status,
    liveEvents: l.campaignId ? live.has(l.campaignId) : false,
    ...l,
  });
}

await new Promise((ok) => report.end(ok));
await base?.pool.end();

const byType = [...types.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([t, n]) => `${t} ${n}`)
  .join(', ');
console.log(
  `${total} événement(s) lus dans ${byCode.size} campagne(s)` +
    (summaries ? ` (${summaries} résumé(s) IA non importés)` : '') +
    `. Types : ${byType || 'aucun'}.`,
);
console.log(
  (dryRun
    ? `Simulation : rien n'a été écrit. Déjà importés : ${totals.alreadyImported}, `
    : `Événements importés : ${totals.imported}, déjà importés : ${totals.alreadyImported}, `) +
    `sans campagne importée : ${totals.noCampaign}, privés : ${totals.private} ` +
    `(dont sans compte migré, visibles du MJ seul : ${totals.noOwner}), ` +
    `personnage non retrouvé : ${totals.noCharacter}, erreurs : ${totals.errors}.`,
);
if (warnings.size)
  console.log(
    `  Avertissements : ${[...warnings.entries()].map(([w, n]) => `${w} ${n}`).join(', ')}.`,
  );
if (live.size)
  console.log(
    `  ${live.size} campagne(s) avaient déjà des événements du bus : ` +
      "l'ancien historique y est ajouté à la suite.",
  );
console.log(`Rapport : ${values.report}`);
if (totals.errors) process.exitCode = 1;
