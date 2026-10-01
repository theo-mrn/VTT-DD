/**
 * Fichiers orphelins (docs/nettoyage.md § Fichiers) : un fichier envoyé que plus rien ne référence
 * (image remplacée, envoi abandonné, personnage purgé) est supprimé du stockage.
 *
 * Prudence avant tout :
 * - seuls les fichiers au format exact de nos envois (`<dossier>/<uuid>/<uuid>.<ext>`, `uploadKey`)
 *   sont candidats ; tout autre fichier (reprise de l'ancienne app…) n'est jamais touché ;
 * - un fichier de moins de `minAgeMs` est laissé (envoi en cours, adresse pas encore enregistrée) ;
 * - « référencé » se cherche dans **toutes** les tables de chaque service (la ligne entière en
 *   texte), pas dans une liste de colonnes à tenir à jour : une nouvelle colonne est couverte
 *   d'office. Seuls le journal des événements (outbox, inbox) et Liquibase sont exclus ;
 * - un service qui ne répond pas arrête la passe : rien n'est supprimé sur une réponse incomplète.
 */
import { UPLOAD_EXTENSIONS, UPLOAD_USAGES } from '@vtt/contracts';
import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { requireInternalSecret } from './internal-secret.js';
import type { ObjectStore } from './storage.js';

const FOLDERS = [...new Set(Object.values(UPLOAD_USAGES).map((u) => u.folder))];
const EXTENSIONS = [...new Set(Object.values(UPLOAD_EXTENSIONS))];
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Clé d'un de nos envois, en minuscules ; même motif côté JS et côté Postgres (ARE). */
const KEY_PATTERN = `(?:${FOLDERS.join('|')})/${UUID}/${UUID}\\.(?:${EXTENSIONS.join('|')})`;
const KEY = new RegExp(`^${KEY_PATTERN}$`);

/** La clé est au format de nos envois : seule candidate à la suppression. */
export function isUploadKey(key: string): boolean {
  return KEY.test(key);
}

/** Tables jamais lues : journal des événements et suivi des migrations. */
export const REFERENCE_EXCLUDED_TABLES = [
  'outbox',
  'inbox',
  'databasechangelog',
  'databasechangeloglock',
] as const;

/** Parmi `keys`, celles qu'une ligne d'une table du schéma mentionne (adresse, vignette, JSON…). */
export async function referencedKeys(
  pool: pg.Pool,
  schema: string,
  keys: readonly string[],
  exclude: readonly string[] = REFERENCE_EXCLUDED_TABLES,
): Promise<string[]> {
  const wanted = keys.map((k) => k.toLowerCase()).filter(isUploadKey);
  if (!wanted.length) return [];
  // Lecture seule, délai propre : un service peut couper ses requêtes plus tôt (5 s)
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const { rows: tables } = await client.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND NOT (table_name = ANY($2::text[]))`,
      [schema, exclude],
    );
    const found = new Set<string>();
    const ident = (s: string) => `"${s.replaceAll('"', '""')}"`;
    for (const { name } of tables) {
      const { rows } = await client.query<{ key: string }>(
        `SELECT DISTINCT r.m[1] AS key
           FROM ${ident(schema)}.${ident(name)} AS t
           CROSS JOIN LATERAL regexp_matches(lower(t::text), $1, 'g') AS r(m)
          WHERE r.m[1] = ANY($2::text[])`,
        [`(${KEY_PATTERN})`, wanted],
      );
      for (const r of rows) found.add(r.key);
    }
    await client.query('COMMIT');
    return [...found];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const ReferencesBody = z.object({ keys: z.array(z.string().max(512)).max(1000) });
const ReferencesReply = z.object({ referenced: z.array(z.string()) });

/**
 * Route interne `POST /internal/storage/references` `{ keys }` → `{ referenced }` : chaque service
 * qui garde des adresses de fichiers l'expose. Sans secret configuré, elle n'existe pas.
 */
export function registerStorageReferences(
  app: {
    post(
      url: string,
      opts: { preValidation: (req: FastifyRequest) => Promise<void> },
      handler: (req: FastifyRequest) => Promise<unknown>,
    ): unknown;
  },
  o: { pool: pg.Pool; schema: string; secret: string | undefined },
): void {
  if (!o.secret) return;
  app.post(
    '/internal/storage/references',
    { preValidation: requireInternalSecret(o.secret) },
    async (req) => {
      const { keys } = ReferencesBody.parse(req.body);
      return { referenced: await referencedKeys(o.pool, o.schema, keys) };
    },
  );
}

/** Interroge la route d'un autre service. Une erreur fait échouer la passe (rien supprimé). */
export type ReferenceChecker = (keys: readonly string[]) => Promise<string[]>;

export function remoteReferences(
  baseUrl: string,
  secret: string,
  fetcher: typeof fetch = fetch,
): ReferenceChecker {
  const url = `${baseUrl.replace(/\/+$/, '')}/internal/storage/references`;
  return async (keys) => {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ keys }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${url} : ${res.status}`);
    return ReferencesReply.parse(await res.json()).referenced;
  };
}

export interface SweepReport {
  /** Fichiers vus sous les préfixes. */
  seen: number;
  /** Hors format de nos envois : jamais touchés. */
  foreign: number;
  /** Trop récents. */
  young: number;
  referenced: number;
  orphans: number;
  orphanBytes: number;
  /** Supprimés (0 en essai). */
  removed: number;
  /** Exemples d'orphelins, pour vérifier un essai. */
  sample: string[];
}

const BATCH = 500;

/**
 * Une passe sur les dossiers `prefixes` (ex. `characters/`). `checkers` : **tous** les services
 * qui peuvent garder une adresse de fichier, celui-ci compris.
 */
export async function sweepOrphans(o: {
  store: ObjectStore;
  prefixes: readonly string[];
  checkers: readonly ReferenceChecker[];
  minAgeMs: number;
  dryRun: boolean;
  now?: number;
}): Promise<SweepReport> {
  const now = o.now ?? Date.now();
  const report: SweepReport = {
    seen: 0,
    foreign: 0,
    young: 0,
    referenced: 0,
    orphans: 0,
    orphanBytes: 0,
    removed: 0,
    sample: [],
  };
  let batch: { key: string; size: number }[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const keys = batch.map((b) => b.key);
    // Toutes les réponses ou rien : un service en échec rejette la passe entière
    const answers = await Promise.all(o.checkers.map((check) => check(keys)));
    const used = new Set(answers.flat());
    const orphans = batch.filter((b) => !used.has(b.key));
    report.referenced += batch.length - orphans.length;
    report.orphans += orphans.length;
    report.orphanBytes += orphans.reduce((n, b) => n + b.size, 0);
    for (const b of orphans) if (report.sample.length < 20) report.sample.push(b.key);
    if (!o.dryRun && orphans.length)
      report.removed += await o.store.remove(orphans.map((b) => b.key));
    batch = [];
  };

  for (const prefix of o.prefixes) {
    for await (const obj of o.store.list(prefix)) {
      report.seen += 1;
      if (!isUploadKey(obj.key)) {
        report.foreign += 1;
        continue;
      }
      if (now - obj.lastModified.getTime() < o.minAgeMs) {
        report.young += 1;
        continue;
      }
      batch.push({ key: obj.key, size: obj.size });
      if (batch.length >= BATCH) await flush();
    }
  }
  await flush();
  return report;
}

/**
 * Réglages du balayage, communs aux services qui possèdent un dossier du stockage (à étendre dans
 * leur configuration). `ORPHAN_SWEEP` vaut `dry-run` par défaut : journalise sans rien supprimer.
 */
export const OrphanSweepSettings = {
  /** off : jamais ; dry-run : journalise ce qui serait supprimé ; on : supprime. */
  ORPHAN_SWEEP: z.enum(['off', 'dry-run', 'on']).default('dry-run'),
  ORPHAN_MIN_AGE_HOURS: z.coerce.number().positive().default(24),
  ORPHAN_SWEEP_EVERY_MINUTES: z.coerce.number().int().positive().default(60),
  /**
   * Adresses des **autres** services qui gardent des adresses de fichiers (character, campaign,
   * identity, dice, audio), séparées par des virgules. Absent : pas de balayage.
   */
  STORAGE_REFERENCE_URLS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .transform((s) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      )
      .optional(),
  ),
};
