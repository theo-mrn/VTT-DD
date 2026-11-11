/**
 * Instantané des tables d'une campagne et sa réinsertion (docs/export-campagne.md § 4) : le
 * moteur commun à campaign, character et audio. Chaque service décrit ses tables
 * (`ArchiveTable`) ; le moteur les lit, les rend en JSON, puis à l'import les remet en forme et
 * les insère dans l'ordre donné, dans la transaction de l'appelant.
 *
 * Garde-fous de l'import, quel que soit le contenu de l'archive :
 * - la colonne de rattachement (`scope`) vaut toujours la nouvelle campagne ;
 * - les colonnes de comptes (`users`) valent qui importe, les listes de comptes sont vidées ;
 * - tout autre identifiant (colonne `uuid` ou liste d'`uuid`) doit désigner une ligne de
 *   l'archive (`known`) : sinon il devient null, ou la ligne est écartée s'il est obligatoire.
 *   Une archive ne peut donc pas viser les données d'une autre campagne.
 */
import type { ArchiveOptions, ArchiveRows } from '@vtt/contracts';
import { and, asc, eq, getTableColumns, getTableName, type SQL } from 'drizzle-orm';
import type { PgColumn, PgDatabase, PgTable } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<any, any, any>;
type Row = Record<string, unknown>;

export interface ArchiveTable {
  table: PgTable;
  /**
   * Colonne qui rattache la ligne à la campagne ; à défaut (table de liaison), `where` choisit
   * les lignes et seuls les identifiants de l'archive les protègent à l'import.
   */
  scope?: PgColumn;
  /** État de jeu (brouillard découvert, jetons, mesures) : seulement avec `keepProgress`. */
  progress?: boolean;
  /** Filtre de plus à l'export (ex. : notes du MJ seulement). */
  where?: (ctx: ArchiveExportContext) => SQL | undefined;
  /** Ordre de lecture, qui est l'ordre de réinsertion (ex. : zones de brouillard). */
  orderBy?: PgColumn[];
  /** Colonnes (noms de propriétés) qui désignent un compte : qui importe. */
  users?: string[];
  /** Listes de comptes (destinataires, partages) : vidées. */
  userLists?: string[];
  /** Identifiants hors campagne, gardés tels quels (bibliothèque, packs). */
  external?: string[];
  /** Colonnes jamais réécrites (obsolètes, recalculées). */
  skip?: string[];
  /** Colonne du parent dans la même table (dossiers) : parents insérés avant leurs enfants. */
  parent?: string;
  /** Dernière retouche d'une ligne à l'export ; null l'écarte. */
  exportRow?: (row: Row, ctx: ArchiveExportContext) => Row | null;
  /**
   * Juste avant d'insérer les lignes prêtes de la table (ex. : retirer ce qu'un déclencheur a
   * déjà créé pour les lignes parentes).
   */
  beforeInsert?: (tx: AnyDb, rows: Row[], ctx: ArchiveImportContext) => Promise<void>;
  /** Dernière retouche d'une ligne à l'import ; null l'écarte. */
  importRow?: (row: Row, ctx: ArchiveImportContext) => Row | null;
}

export interface ArchiveExportContext {
  campaignId: string;
  options: ArchiveOptions;
  /** Comptes dont le contenu est au MJ (MJ de la campagne). */
  gmIds: ReadonlySet<string>;
}

export interface ArchiveImportContext {
  campaignId: string;
  ownerId: string;
  options: ArchiveOptions;
  /** Identifiants (déjà renouvelés) des lignes de l'archive, tous services confondus. */
  known: ReadonlySet<string>;
}

/** Lignes d'insertion par requête. */
const INSERT_BATCH = 500;

/** Lit les tables de la campagne, dans l'ordre des descriptions. */
export async function exportArchiveTables(
  db: AnyDb,
  specs: readonly ArchiveTable[],
  ctx: ArchiveExportContext,
): Promise<Record<string, ArchiveRows>> {
  const out: Record<string, ArchiveRows> = {};
  for (const spec of specs) {
    const name = getTableName(spec.table);
    if (!spec.scope && !spec.where) throw new Error(`${name} : ni scope ni where`);
    if (spec.progress && !ctx.options.keepProgress) {
      out[name] = [];
      continue;
    }
    const rows = (await db
      .select()
      .from(spec.table)
      .where(and(spec.scope ? eq(spec.scope, ctx.campaignId) : undefined, spec.where?.(ctx)))
      .orderBy(...(spec.orderBy ?? []).map((c) => asc(c)))) as Row[];
    out[name] = rows.flatMap((row) => {
      const kept = spec.exportRow ? spec.exportRow(row, ctx) : row;
      return kept ? [encodeRow(kept)] : [];
    });
  }
  return out;
}

/** Réinsère les tables (identifiants déjà renouvelés) ; rend le nombre de lignes écrites. */
export async function importArchiveTables(
  tx: AnyDb,
  specs: readonly ArchiveTable[],
  tables: Readonly<Record<string, ArchiveRows>>,
  ctx: ArchiveImportContext,
): Promise<Record<string, number>> {
  const written: Record<string, number> = {};
  // Une ligne écartée ne peut plus être citée par les tables suivantes
  const known = new Set(ctx.known);
  const live: ArchiveImportContext = { ...ctx, known };
  for (const spec of specs) {
    const name = getTableName(spec.table);
    if (spec.progress && !ctx.options.keepProgress) {
      written[name] = 0;
      continue;
    }
    let rows = (tables[name] ?? []).flatMap((raw) => {
      const row = prepareRow(spec, raw, live);
      if (!row && typeof raw.id === 'string') known.delete(raw.id.toLowerCase());
      return row ? [row] : [];
    });
    if (spec.parent) rows = parentsFirst(rows, spec.parent);
    if (spec.beforeInsert) await spec.beforeInsert(tx, rows, live);
    for (let i = 0; i < rows.length; i += INSERT_BATCH)
      await tx.insert(spec.table).values(rows.slice(i, i + INSERT_BATCH));
    written[name] = rows.length;
  }
  return written;
}

/** Ligne prête à insérer, ou null si elle cite ce qu'elle ne peut pas citer. */
export function prepareRow(spec: ArchiveTable, raw: Row, ctx: ArchiveImportContext): Row | null {
  const columns = getTableColumns(spec.table) as Record<string, PgColumn>;
  const scopeKey = spec.scope
    ? Object.keys(columns).find((k) => columns[k] === spec.scope)
    : undefined;
  const users = new Set(spec.users);
  const userLists = new Set(spec.userLists);
  const external = new Set(spec.external);
  const skip = new Set(spec.skip);
  const row: Row = {};
  for (const [key, column] of Object.entries(columns)) {
    if (key === scopeKey) {
      row[key] = ctx.campaignId;
      continue;
    }
    if (skip.has(key) || isGenerated(column)) continue;
    if (users.has(key)) {
      row[key] = ctx.ownerId;
      continue;
    }
    if (!(key in raw)) continue;
    const value = decodeValue(raw[key], column);
    if (userLists.has(key)) {
      row[key] = column.notNull ? [] : null;
      continue;
    }
    if (external.has(key) || value === null || value === undefined) {
      row[key] = value;
      continue;
    }
    if (isUuid(column)) {
      if (typeof value === 'string' && ctx.known.has(value.toLowerCase())) row[key] = value;
      else if (column.notNull) return null;
      else row[key] = null;
      continue;
    }
    if (isUuidArray(column) && Array.isArray(value)) {
      row[key] = value.filter((v) => typeof v === 'string' && ctx.known.has(v.toLowerCase()));
      continue;
    }
    row[key] = value;
  }
  return spec.importRow ? spec.importRow(row, ctx) : row;
}

/**
 * Lignes triées parents d'abord ; un parent absent est coupé (null), une boucle aussi : la
 * ligne remonte à la racine plutôt que de faire échouer l'import.
 */
export function parentsFirst(rows: Row[], parentKey: string): Row[] {
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const out: Row[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (row: Row) => {
    const id = row.id as string;
    if (state.get(id) === 'done') return;
    state.set(id, 'visiting');
    const parentId = row[parentKey] as string | null | undefined;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!parent || state.get(parentId!) === 'visiting') row[parentKey] = null;
    else visit(parent);
    state.set(id, 'done');
    out.push(row);
  };
  rows.forEach(visit);
  return out;
}

// ─── JSON ───────────────────────────────────────────────────────────────────

const BYTES = '$bytes';

/** Valeurs JSON : dates en ISO 8601, octets en base64 (`{ $bytes }`). */
export function encodeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = encodeValue(v);
  return out;
}

function encodeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return { [BYTES]: Buffer.from(v).toString('base64') };
  if (typeof v === 'bigint') return Number(v);
  return v;
}

function decodeValue(v: unknown, column: PgColumn): unknown {
  if (v === null || v === undefined) return v;
  if (column.dataType === 'date' && typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Row)[BYTES] === 'string')
    return new Uint8Array(Buffer.from((v as Record<string, string>)[BYTES]!, 'base64'));
  return v;
}

// ─── Colonnes ───────────────────────────────────────────────────────────────

function isGenerated(column: PgColumn): boolean {
  const c = column as PgColumn & {
    generated?: unknown;
    generatedIdentity?: { type?: string };
  };
  return !!c.generated || c.generatedIdentity?.type === 'always';
}

const isUuid = (column: PgColumn) => column.columnType === 'PgUUID';

function isUuidArray(column: PgColumn): boolean {
  const base = (column as PgColumn & { baseColumn?: PgColumn }).baseColumn;
  return column.columnType === 'PgArray' && !!base && base.columnType === 'PgUUID';
}
