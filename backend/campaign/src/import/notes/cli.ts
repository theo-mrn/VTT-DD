/**
 * Import des notes Firebase (Notes, SharedNotes) dans le service campaign,
 * APRÈS les comptes, les personnages et les campagnes. Sous-commande du CLI
 * d'import de campaign :
 *
 *   node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js notes \
 *     --export ~/vtt-export --report ~/vtt-export/rapport-notes.ndjson [--importer]
 *
 *   --export    dossier des exports NDJSON de tools/firebase-export : Notes et
 *               SharedNotes (récursifs), users et cartes (personnages)
 *   --report    rapport par campagne (compteurs, avertissements ; jamais de texte de note)
 *   --importer  écrit en base ; sans lui, simulation (rien n'est écrit)
 *
 * Environnement :
 *   DATABASE_URL            rôle campaign_svc (campagnes importées, engagements ; écriture)
 *   CHARACTER_DATABASE_URL  rôle characters_svc : personnages importés (lecture)
 *   IDENTITY_DATABASE_URL   rôle identity_svc : compte migré de chaque UID Firebase (lecture)
 *   S3_*                    stockage : images Firebase Storage et `data:` rapatriées
 * La sortie ne contient que des compteurs ; le détail est dans le rapport (0600).
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { createDb } from '../../db/client.js';
import { campaignCharacters, campaigns, legacyIds } from '../../db/schema.js';
import { isDataUrl, isFirebaseStorage, mediaRehoster } from '../images.js';
import type { FirestoreDoc } from '../legacy.js';
import { LEGACY_SOURCE } from '../loading.js';
import { countNotes, existingNotes, loadNotes, type NoteCounts } from './load.js';
import { transformNotes, type MigratedNotes, type NotesMappings } from './transform.js';

const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    export: { type: 'string' },
    report: { type: 'string' },
    importer: { type: 'boolean', default: false },
  },
});
if (!values.export || !values.report) {
  console.error('usage : cli.js notes --export <dossier> --report <fichier> [--importer]');
  process.exit(2);
}
const write = values.importer;
const env = {
  campaign: process.env.DATABASE_URL || undefined,
  character: process.env.CHARACTER_DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
};
const missing = [
  !env.campaign && 'DATABASE_URL (campaign_svc)',
  !env.character && 'CHARACTER_DATABASE_URL (characters_svc)',
  !env.identity && 'IDENTITY_DATABASE_URL (identity_svc)',
].filter(Boolean);
if (missing.length) {
  console.error(`Manquant : ${missing.join(', ')}`);
  process.exit(2);
}

// ─── Lecture des exports ─────────────────────────────────────────────────────

/** Lit un export en flux, en ne gardant que les documents utiles. */
async function read(name: string, keep: (path: string) => boolean): Promise<FirestoreDoc[]> {
  const file = join(values.export!, `${name}.ndjson`);
  if (!existsSync(file)) {
    console.warn(`  (absent : ${name}.ndjson)`);
    return [];
  }
  const docs: FirestoreDoc[] = [];
  let i = 0;
  for await (const line of createInterface({ input: createReadStream(file, 'utf8') })) {
    i++;
    if (!line.trim()) continue;
    let doc: FirestoreDoc;
    try {
      const { path, id, data } = JSON.parse(line) as FirestoreDoc;
      doc = { path: path ?? id, id, data: data ?? {} };
    } catch {
      throw new Error(`${file}:${i} : JSON invalide`);
    }
    if (keep(doc.path)) docs.push(doc);
  }
  return docs;
}

const depth = (p: string) => p.split('/').length;
const privateDocs = await read('Notes', (p) => depth(p) === 4);
const sharedDocs = await read('SharedNotes', (p) => depth(p) === 4);
if (!privateDocs.length && !sharedDocs.length) {
  console.error(
    'Aucune note : exporter d’abord Notes et SharedNotes (tools/firebase-export --recursive)',
  );
  process.exit(1);
}
const codes = new Set([...privateDocs, ...sharedDocs].map((d) => d.path.split('/')[1]!));
const characterDocs = await read('cartes', (p) => {
  const parts = p.split('/');
  return parts.length === 4 && parts[2] === 'characters' && codes.has(parts[1]!);
});
const userDocs = await read('users', (p) => depth(p) === 2);
console.log(
  `${codes.size} salle(s) avec des notes : ${privateDocs.length} privée(s), ${sharedDocs.length} partagée(s)`,
);

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

const base = createDb(env.campaign!);
const characterDb = new pg.Pool({ connectionString: env.character, max: 2 });
const identityDb = new pg.Pool({ connectionString: env.identity, max: 2 });

const imported = await base.db
  .select({ legacyId: legacyIds.legacyId, id: campaigns.id, ownerId: campaigns.ownerId })
  .from(legacyIds)
  .innerJoin(campaigns, eq(campaigns.id, legacyIds.campaignId))
  .where(
    and(
      eq(legacyIds.source, LEGACY_SOURCE),
      inArray(
        legacyIds.legacyId,
        [...codes].map((c) => `Salle/${c}`),
      ),
    ),
  );
const campaignOf = new Map(imported.map((c) => [c.legacyId.slice('Salle/'.length), c]));

const { rows: characterRows } = await characterDb.query<{
  legacy_id: string;
  id: string;
  owner_id: string;
}>(
  `select l.legacy_id, c.id, c.owner_id
     from characters.legacy_ids l join characters.characters c on c.id = l.character_id
    where l.source = $1 and l.legacy_id = any($2)`,
  [LEGACY_SOURCE, characterDocs.map((d) => d.path)],
);
const engagedRows = imported.length
  ? await base.db
      .select({
        campaignId: campaignCharacters.campaignId,
        id: campaignCharacters.characterId,
        ownerId: campaignCharacters.ownerId,
        playedBy: campaignCharacters.playedBy,
      })
      .from(campaignCharacters)
      .where(
        inArray(
          campaignCharacters.campaignId,
          imported.map((c) => c.id),
        ),
      )
  : [];
const engaged = new Map(engagedRows.map((e) => [`${e.campaignId}/${e.id}`, e]));

const accounts = new Map<string, string>();
{
  const { rows } = await identityDb.query<{ legacy_id: string; id: string }>(
    "select legacy_id, id from identity.legacy_ids where kind = 'firebase_uid'",
  );
  for (const r of rows) accounts.set(r.legacy_id, r.id);
}
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const users = new Map(
  userDocs.map((d) => [
    d.id,
    { persoId: text(d.data.persoId), perso: text(d.data.perso), roomId: text(d.data.room_id) },
  ]),
);

// ─── Médias ──────────────────────────────────────────────────────────────────

const rehost = write
  ? mediaRehoster(process.env, { maxSize: 10 * 1024 * 1024, folder: 'campaigns/imported/notes' })
  : undefined;
const rehosted = new Map<string, Promise<string>>();
const needsRehost = (u: unknown): u is string =>
  typeof u === 'string' && (isFirebaseStorage(u) || isDataUrl(u));
/** Images des notes : `src` des balises img du texte. */
const INLINE = /(<img\b[^>]*?\bsrc=")([^"]+)(")/g;

/** Copie les images Firebase Storage et `data:` dans notre stockage (simulation : compte seulement). */
async function rehostMedia(m: MigratedNotes, warn: (w: string) => void) {
  let count = 0;
  const one = async (url: string, what: string): Promise<string | null> => {
    count++;
    if (!rehost) {
      if (write) warn(`${what} : stockage S3 non configuré, image non rapatriée`);
      return null;
    }
    try {
      if (!rehosted.has(url)) rehosted.set(url, rehost(url));
      return await rehosted.get(url)!;
    } catch (err) {
      rehosted.delete(url);
      warn(`${what} : image non rapatriée (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }
  };
  for (const n of m.notes) {
    if (needsRehost(n.imageUrl)) {
      const url = await one(n.imageUrl, `Note ${n.id}, image`);
      // Une image `data:` non rapatriée ne tient pas dans image_url : retirée
      n.imageUrl = url ?? (isDataUrl(n.imageUrl) ? null : n.imageUrl);
    }
    const content = n.content ?? '';
    const inline = [...content.matchAll(INLINE)].map((x) => x[2]!).filter(needsRehost);
    if (!inline.length) continue;
    const replaced = new Map<string, string>();
    for (const u of new Set(inline)) {
      const url = await one(u, `Note ${n.id}, image du texte`);
      if (url) replaced.set(u, url);
    }
    n.content = content.replace(INLINE, (all, a: string, src: string, b: string) =>
      replaced.has(src) ? `${a}${replaced.get(src)}${b}` : all,
    );
  }
  return count;
}

// ─── Import ──────────────────────────────────────────────────────────────────

const report = createWriteStream(values.report, { mode: 0o600 });
const correlationId = uuidv7();
const importedAt = new Date();
const totals = { campaigns: 0, noCampaign: 0, skipped: 0, errors: 0, warnings: 0, media: 0 };
const produced: NoteCounts = { private: 0, shared: 0 };
const written: NoteCounts = { private: 0, shared: 0 };
let already = 0;
const add = (into: NoteCounts, from: NoteCounts) => {
  into.private += from.private;
  into.shared += from.shared;
};

for (const code of codes) {
  const out: Record<string, unknown> = { legacyId: `Salle/${code}` };
  const inRoom = (d: FirestoreDoc) => d.path.split('/')[1] === code;
  const campaign = campaignOf.get(code);
  if (!campaign) {
    Object.assign(out, {
      status: 'no-campaign',
      ignored: countNotes([
        ...privateDocs.filter(inRoom).map(() => ({ shared: false })),
        ...sharedDocs.filter(inRoom).map(() => ({ shared: true })),
      ]),
    });
    totals.noCampaign++;
    report.write(JSON.stringify(out) + '\n');
    continue;
  }
  try {
    const characters: NotesMappings['characters'] = new Map(
      characterRows
        .filter((r) => r.legacy_id.startsWith(`cartes/${code}/`))
        .map((r) => {
          const e = engaged.get(`${campaign.id}/${r.id}`);
          return [
            r.legacy_id,
            {
              id: r.id,
              engaged: !!e,
              ownerId: e?.ownerId ?? r.owner_id,
              playedBy: e?.playedBy ?? null,
            },
          ];
        }),
    );
    const legacyCharacters = new Map(
      characterDocs
        .filter(inRoom)
        .map((d) => [d.id, { name: text(d.data.Nomperso), type: text(d.data.type) }]),
    );
    const migrated = transformNotes(code, privateDocs.filter(inRoom), sharedDocs.filter(inRoom), {
      campaignId: campaign.id,
      gmId: campaign.ownerId,
      characters,
      legacyCharacters,
      accounts,
      users,
      importedAt,
    });
    const warnings = migrated.warnings;
    totals.media += await rehostMedia(migrated, (w) => warnings.push(w));
    const counts = countNotes(migrated.notes);
    add(produced, counts);
    totals.skipped += migrated.skipped;
    Object.assign(out, { id: campaign.id, produced: counts, skipped: migrated.skipped });
    if (write) {
      const w = await loadNotes(base.db, campaign.id, migrated.notes, correlationId);
      add(written, w);
      Object.assign(out, { status: 'imported', written: w });
    } else {
      const n = await existingNotes(base.db, migrated.notes);
      already += n;
      Object.assign(out, { status: 'dry-run', alreadyImported: n });
    }
    out.warnings = warnings;
    totals.warnings += warnings.length;
    totals.campaigns++;
  } catch (err) {
    totals.errors++;
    out.status = 'error';
    out.error = err instanceof Error ? err.message : String(err);
  }
  report.write(JSON.stringify(out) + '\n');
}

await new Promise((ok) => report.end(ok));
await base.pool.end();
await characterDb.end();
await identityDb.end();

const fmt = (c: NoteCounts) => `${c.private} privée(s), ${c.shared} partagée(s)`;
console.log(
  `Campagnes : ${totals.campaigns}, salles sans campagne importée : ${totals.noCampaign}`,
);
console.log(`Notes produites : ${fmt(produced)} ; ignorées (auteur, doublon) : ${totals.skipped}`);
console.log(
  write
    ? `Notes écrites : ${fmt(written)} (le reste existait déjà)`
    : `Simulation : rien n'a été écrit, ${already} déjà importée(s) (--importer pour importer)`,
);
console.log(
  `Images à rapatrier : ${totals.media}, avertissements : ${totals.warnings}, erreurs : ${totals.errors}`,
);
console.log(`Rapport : ${values.report}`);
if (totals.errors) process.exitCode = 1;
