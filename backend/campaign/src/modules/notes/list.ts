/**
 * Listes de notes : filtres, recherche plein texte, pagination par curseur et
 * facettes (compteurs et étiquettes de l'espace Notes).
 *
 * Ordre : épinglées par l'appelant d'abord, puis les plus récemment modifiées
 * (curseur opaque sur l'épingle, `updated_at` à la microseconde et l'id).
 *
 * Recherche : chaque terme (sans accents, voir `searchForm`) doit figurer, par
 * préfixe, dans le titre, les étiquettes, les détails ou le texte. Vecteur
 * « french » (racines) et « simple » (mots vides gardés) : `chevaux` trouve
 * « cheval », `la` trouve « la légende » dès la frappe.
 */
import { HttpError } from '@vtt/platform';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { NOTE_TYPES, notePins, notes, type NoteType } from '../../db/schema.js';
import { NOTE_COLUMNS, readableBy, type NoteReader, type NoteRow } from './common.js';
import { PREVIEW_LENGTH, searchTerms } from './html.js';
import { LIMITS, type ListQuery } from './schemas.js';

// ─── Curseur ─────────────────────────────────────────────────────────────────

interface Cursor {
  pinned: 0 | 1;
  /** `updated_at` en microsecondes depuis l'époque (précision de la base). */
  micros: string;
  id: string;
}

const invalidCursor = () =>
  HttpError.badRequest('Curseur de pagination invalide', 'invalid_cursor');

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.pinned}.${c.micros}.${c.id}`).toString('base64url');
}

export function decodeCursor(s: string): Cursor {
  const m = /^([01])\.(\d{1,20})\.([0-9a-f-]{36})$/.exec(
    Buffer.from(s, 'base64url').toString('utf8'),
  );
  if (!m) throw invalidCursor();
  return { pinned: m[1] === '1' ? 1 : 0, micros: m[2]!, id: m[3]! };
}

// ─── Extraits ────────────────────────────────────────────────────────────────

/**
 * Lettres accentuées ramenées à leur lettre de base, caractère pour caractère
 * (les positions sont conservées : l'extrait se découpe dans le texte d'origine).
 */
const ACCENTS: [string, string][] = [
  ['àáâãäåāăą', 'a'],
  ['ÀÁÂÃÄÅĀĂĄ', 'a'],
  ['çćĉċč', 'c'],
  ['ÇĆĈĊČ', 'c'],
  ['ďđ', 'd'],
  ['ĎĐ', 'd'],
  ['èéêëēĕėęě', 'e'],
  ['ÈÉÊËĒĔĖĘĚ', 'e'],
  ['ìíîïĩīĭįı', 'i'],
  ['ÌÍÎÏĨĪĬĮİ', 'i'],
  ['ñńņňŉ', 'n'],
  ['ÑŃŅŇ', 'n'],
  ['òóôõöøōŏő', 'o'],
  ['ÒÓÔÕÖØŌŎŐ', 'o'],
  ['ùúûüũūŭůűų', 'u'],
  ['ÙÚÛÜŨŪŬŮŰŲ', 'u'],
  ['ýÿŷ', 'y'],
  ['ÝŸŶ', 'y'],
  ['ŕŗř', 'r'],
  ['ŔŖŘ', 'r'],
  ['śŝşš', 's'],
  ['ŚŜŞŠ', 's'],
  ['ţťŧ', 't'],
  ['ŢŤŦ', 't'],
  ['źżž', 'z'],
  ['ŹŻŽ', 'z'],
];
const FROM = ACCENTS.map(([a]) => a).join('');
const TO = ACCENTS.map(([a, b]) => b.repeat([...a].length)).join('');

/** Nombre de caractères gardés avant le premier terme trouvé. */
const CONTEXT_BEFORE = 50;

/**
 * Extrait centré sur le premier terme trouvé dans le texte, coupé aux mots,
 * avec « … » aux bords coupés. `start` : position (1 = début) du premier terme.
 */
export function snippet(raw: string, start: number, windowStart: number, length: number) {
  let text = raw;
  let cutBefore = windowStart > 1;
  if (cutBefore) {
    // Pas de mot coupé au début, sans sauter le terme trouvé
    const space = text.indexOf(' ');
    if (space >= 0 && space < start - windowStart) text = text.slice(space + 1);
    cutBefore = true;
  }
  let cutAfter = windowStart - 1 + raw.length < length;
  if (text.length > PREVIEW_LENGTH) {
    const end = text.lastIndexOf(' ', PREVIEW_LENGTH);
    text = text.slice(0, end > PREVIEW_LENGTH / 2 ? end : PREVIEW_LENGTH);
    cutAfter = true;
  }
  return `${cutBefore ? '… ' : ''}${text.trim()}${cutAfter ? '…' : ''}`;
}

// ─── Requêtes ────────────────────────────────────────────────────────────────

const pinnedFlag = sql<number>`(case when ${notePins.userId} is null then 0 else 1 end)`;
const micros = sql`(extract(epoch from ${notes.updatedAt}) * 1000000)::bigint`;

/** Préfixe tsquery d'un terme (lettres et chiffres seulement, voir searchTerms). */
const prefix = (t: string) => `'${t}':*`;

function searchCondition(terms: string[]): SQL | undefined {
  if (!terms.length) return undefined;
  return and(
    ...terms.map(
      (t) =>
        sql`${notes.search} @@ (to_tsquery('french', ${prefix(t)}) || to_tsquery('simple', ${prefix(t)}))`,
    ),
  );
}

function filters(r: NoteReader, q: ListQuery, terms: string[]): SQL {
  return and(
    readableBy(r),
    q.campaignId === 'none'
      ? isNull(notes.campaignId)
      : q.campaignId
        ? eq(notes.campaignId, q.campaignId)
        : undefined,
    q.type ? eq(notes.type, q.type) : undefined,
    q.pinned === undefined ? undefined : sql`${pinnedFlag} = ${q.pinned ? 1 : 0}`,
    searchCondition(terms),
  )!;
}

export interface ListedNote {
  row: NoteRow;
  pinned: boolean;
  excerpt: string;
}

/** Une page de notes lisibles par l'appelant, et le total de la première page. */
export async function listNotes(
  db: Db,
  r: NoteReader,
  q: ListQuery,
): Promise<{ items: ListedNote[]; nextCursor: string | null; total: number | null }> {
  const terms = q.q ? searchTerms(q.q) : [];
  const where = filters(r, q, terms);
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;

  // Position du premier terme dans le texte, sans accents (même longueur que le texte)
  const folded = sql`translate(lower(${notes.plainText}), ${FROM}, ${TO})`;
  const position = terms.length
    ? sql<number | null>`least(${sql.join(
        terms.map((t) => sql`nullif(strpos(${folded}, ${t}), 0)`),
        sql`, `,
      )})`
    : sql<number | null>`null::int`;

  const rows = await db
    .select({
      ...NOTE_COLUMNS,
      pinnedFlag,
      micros: sql<string>`${micros}::text`,
      position,
      excerptWindow: terms.length
        ? sql<
            string | null
          >`substr(${notes.plainText}, greatest(1, ${position} - ${CONTEXT_BEFORE}), ${PREVIEW_LENGTH + CONTEXT_BEFORE + 40})`
        : sql<string | null>`null::text`,
      plainLength: sql<number>`char_length(${notes.plainText})`,
    })
    .from(notes)
    .leftJoin(notePins, and(eq(notePins.noteId, notes.id), eq(notePins.userId, r.userId)))
    .where(
      and(
        where,
        cursor
          ? sql`(${pinnedFlag}, ${micros}, ${notes.id}) < (${cursor.pinned}, ${cursor.micros}::bigint, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(pinnedFlag), desc(notes.updatedAt), desc(notes.id))
    .limit(q.limit + 1);

  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > q.limit && last
      ? encodeCursor({ pinned: last.pinnedFlag ? 1 : 0, micros: last.micros, id: last.id })
      : null;

  let total: number | null = null;
  if (!cursor) {
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .leftJoin(notePins, and(eq(notePins.noteId, notes.id), eq(notePins.userId, r.userId)))
      .where(where);
    total = c?.n ?? 0;
  }

  return {
    items: page.map(
      ({ pinnedFlag: p, micros: _m, position: pos, excerptWindow, plainLength, ...row }) => {
        const start = pos === null ? null : Number(pos);
        const windowStart = start === null ? 0 : Math.max(1, start - CONTEXT_BEFORE);
        return {
          row,
          pinned: p === 1,
          excerpt:
            start !== null && excerptWindow !== null
              ? snippet(excerptWindow, start, windowStart, Number(plainLength))
              : row.preview,
        };
      },
    ),
    nextCursor,
    total,
  };
}

/** Compteurs de l'espace Notes (toutes mes notes lisibles) et étiquettes les plus utilisées. */
export async function noteFacets(db: Db, r: NoteReader) {
  const readable = readableBy(r);
  const groups = await db
    .select({
      type: notes.type,
      campaignId: notes.campaignId,
      pinned: pinnedFlag,
      n: sql<number>`count(*)::int`,
    })
    .from(notes)
    .leftJoin(notePins, and(eq(notePins.noteId, notes.id), eq(notePins.userId, r.userId)))
    .where(readable)
    .groupBy(notes.type, notes.campaignId, pinnedFlag);

  const types = Object.fromEntries(NOTE_TYPES.map((t) => [t, 0])) as Record<NoteType, number>;
  const campaigns = new Map<string | null, number>();
  let total = 0;
  let pinned = 0;
  for (const g of groups) {
    total += g.n;
    if (g.pinned) pinned += g.n;
    types[g.type] += g.n;
    campaigns.set(g.campaignId, (campaigns.get(g.campaignId) ?? 0) + g.n);
  }

  const { rows: tags } = await db.execute<{ label: string; n: number }>(sql`
    select t.value->>'label' as label, count(*)::int as n
    from ${notes}, jsonb_array_elements(${notes.tags}) t
    where ${readable}
    group by 1
    order by 2 desc, 1
    limit ${LIMITS.facetTags}`);

  return {
    total,
    pinned,
    types,
    campaigns: [...campaigns].map(([campaignId, count]) => ({ campaignId, count })),
    tags: tags.map((t) => ({ label: t.label, count: t.n })),
  };
}
