/**
 * Différences avant/après d'un changement d'état, pour le champ `changes` des
 * événements (timeline « PV 24 → 17 », audit, annuler/refaire). Format décrit
 * dans docs/bus.md.
 *
 * Générique : aucune clé métier n'est connue ici. Les éléments d'un tableau
 * sont repérés par leurs clés d'identité (`identityKeys`, `id` par défaut)
 * quand tous en ont une, unique ; sinon par leur index, après avoir retiré le
 * début et la fin communs (un ajout ou un retrait au milieu ne décale pas tout).
 * Un tableau de valeurs simples (textes, nombres) est rapporté en entier.
 *
 * Bornes : profondeur, nombre de changements, longueur des valeurs et taille
 * totale. Une valeur coupée porte `truncated: true` ; le résultat porte
 * `truncated: true` dès que quelque chose a été coupé ou omis.
 */
import { z } from 'zod';
import { compareCodeUnits } from './order.js';

export const Change = z.object({
  /** Chemin lisible : `etat.valeurs.PV`, `etat.possessions[epee-longue#2].quantite`, `nom`. */
  path: z.string(),
  /** Valeur avant ; absente : le chemin n'existait pas (ajout). */
  before: z.unknown().optional(),
  /** Valeur après ; absente : le chemin n'existe plus (retrait). */
  after: z.unknown().optional(),
  /** Vrai si `before` ou `after` a été raccourci (texte coupé, objet remplacé par un aperçu). */
  truncated: z.literal(true).optional(),
});
export type Change = z.infer<typeof Change>;

export interface Diff {
  changes: Change[];
  /** Vrai si une valeur a été coupée ou si des changements ont été omis. */
  truncated: boolean;
}

/** Clé d'identité d'un élément de tableau : simple (`'id'`) ou composée (`['entree', 'exemplaire']`). */
export type IdentityKey = string | readonly string[];

export interface DiffOptions {
  /**
   * Clés d'identité essayées, dans l'ordre, sur les éléments d'un tableau
   * d'objets. Composée : la première partie est obligatoire, les suivantes
   * facultatives ; l'identité rendue joint les parties présentes par `#`.
   */
  identityKeys?: readonly IdentityKey[];
  /** Profondeur de chemin au-delà de laquelle la valeur est rapportée en entier. */
  maxDepth?: number;
  maxChanges?: number;
  /** Longueur maximale d'un texte (avant ou après). */
  maxStringLength?: number;
  /** Longueur JSON maximale d'un objet ou d'un tableau rapporté en entier. */
  maxValueLength?: number;
  /** Longueur JSON maximale de l'ensemble des changements. */
  maxTotalLength?: number;
}

export const DIFF_DEFAULTS = {
  identityKeys: ['id'] as readonly IdentityKey[],
  maxDepth: 8,
  maxChanges: 50,
  maxStringLength: 1000,
  maxValueLength: 2000,
  maxTotalLength: 64_000,
} as const;

type Limits = Required<DiffOptions>;

interface State {
  limits: Limits;
  changes: Change[];
  size: number;
  truncated: boolean;
  full: boolean;
}

type PlainObject = Record<string, unknown>;

const isPlainObject = (v: unknown): v is PlainObject => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Deux tableaux de même longueur, égaux élément par élément (faux si l'un n'est pas un tableau). */
function arraysEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((x, i) => deepEqual(x, b[i]));
}

/** Objets simples égaux clé par clé (union des clés des deux). */
function objectsEqual(a: PlainObject, b: PlainObject): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

/** Égalité profonde de valeurs JSON ; une clé à `undefined` compte comme absente. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return arraysEqual(a, b);
  if (isPlainObject(a) && isPlainObject(b)) return objectsEqual(a, b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // Nombres : NaN égal à lui-même
  return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
}

// ─── Chemins ─────────────────────────────────────────────────────────────────

const PLAIN_KEY = /^[\p{L}\p{N}_$-]+$/u;
const PLAIN_ID = /^[\p{L}\p{N}_$#.:/-]+$/u;

function keySegment(path: string, key: string): string {
  if (PLAIN_KEY.test(key)) return path ? `${path}.${key}` : key;
  return `${path}[${JSON.stringify(key)}]`;
}

/** Identité entre crochets ; entre guillemets si elle pourrait passer pour un index. */
function idSegment(path: string, id: string): string {
  return PLAIN_ID.test(id) && !/^\d+$/.test(id)
    ? `${path}[${id}]`
    : `${path}[${JSON.stringify(id)}]`;
}

const indexSegment = (path: string, i: number) => `${path}[${i}]`;

// ─── Valeurs bornées ─────────────────────────────────────────────────────────

function bounded(v: unknown, limits: Limits): { value: unknown; cut: boolean } {
  if (typeof v === 'string') {
    return v.length > limits.maxStringLength
      ? { value: `${v.slice(0, limits.maxStringLength)}…`, cut: true }
      : { value: v, cut: false };
  }
  if (v === null || typeof v === 'number' || typeof v === 'boolean')
    return { value: v, cut: false };
  let json: string | undefined;
  try {
    json = JSON.stringify(v);
  } catch {
    json = undefined;
  }
  if (json === undefined) return { value: String(v), cut: true };
  // Objet trop long : aperçu de son JSON, signalé par `truncated`
  if (json.length > limits.maxValueLength)
    return { value: `${json.slice(0, limits.maxStringLength)}…`, cut: true };
  return { value: JSON.parse(json) as unknown, cut: false };
}

function record(s: State, path: string, before: unknown, after: unknown) {
  if (s.full) return;
  if (s.changes.length >= s.limits.maxChanges) {
    s.full = true;
    s.truncated = true;
    return;
  }
  const change: Change = { path };
  let cut = false;
  if (before !== undefined) {
    const b = bounded(before, s.limits);
    change.before = b.value;
    cut ||= b.cut;
  }
  if (after !== undefined) {
    const a = bounded(after, s.limits);
    change.after = a.value;
    cut ||= a.cut;
  }
  if (cut) {
    change.truncated = true;
    s.truncated = true;
  }
  const size = JSON.stringify(change).length + 1;
  if (s.size + size > s.limits.maxTotalLength) {
    s.full = true;
    s.truncated = true;
    return;
  }
  s.size += size;
  s.changes.push(change);
}

// ─── Parcours ────────────────────────────────────────────────────────────────

const isScalar = (v: unknown) =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Identité d'un élément selon une clé, ou undefined s'il n'en a pas. */
function identityOf(element: unknown, key: IdentityKey): string | undefined {
  if (!isPlainObject(element)) return undefined;
  const parts = typeof key === 'string' ? [key] : key;
  const values: string[] = [];
  for (const [i, part] of parts.entries()) {
    const v = element[part];
    if (typeof v === 'string' || typeof v === 'number') values.push(String(v));
    else if (i === 0 || v !== undefined) return undefined;
  }
  return values.join('#');
}

/** Identités des deux tableaux selon la première clé qui les distingue tous, sinon null. */
function identities(
  a: unknown[],
  b: unknown[],
  keys: readonly IdentityKey[],
): { before: string[]; after: string[] } | null {
  for (const key of keys) {
    const before = a.map((e) => identityOf(e, key));
    const after = b.map((e) => identityOf(e, key));
    const all = (ids: (string | undefined)[]): ids is string[] =>
      ids.every((id) => id !== undefined) && new Set(ids).size === ids.length;
    if (all(before) && all(after)) return { before, after };
  }
  return null;
}

function walkArrays(s: State, a: unknown[], b: unknown[], path: string, depth: number) {
  // Valeurs simples : le tableau entier se lit mieux qu'une suite d'index
  if (a.every(isScalar) && b.every(isScalar)) {
    if (!deepEqual(a, b)) record(s, path, a, b);
    return;
  }
  const ids = identities(a, b, s.limits.identityKeys);
  if (ids) {
    const after = new Map(ids.after.map((id, i) => [id, b[i]]));
    const before = new Set(ids.before);
    ids.before.forEach((id, i) => walk(s, a[i], after.get(id), idSegment(path, id), depth + 1));
    ids.after.forEach((id, i) => {
      if (!before.has(id)) walk(s, undefined, b[i], idSegment(path, id), depth + 1);
    });
    return;
  }
  // Par index, sans le début ni la fin communs
  let start = 0;
  while (start < a.length && start < b.length && deepEqual(a[start], b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && deepEqual(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  for (let k = 0; start + k < Math.max(endA, endB); k++) {
    const i = start + k;
    walk(
      s,
      i < endA ? a[i] : undefined,
      i < endB ? b[i] : undefined,
      indexSegment(path, i),
      depth + 1,
    );
  }
}

function walk(s: State, a: unknown, b: unknown, path: string, depth: number) {
  if (s.full || a === b) return;
  if (isPlainObject(a) && isPlainObject(b) && depth < s.limits.maxDepth) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareCodeUnits);
    for (const k of keys) walk(s, a[k], b[k], keySegment(path, k), depth + 1);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && depth < s.limits.maxDepth) {
    walkArrays(s, a, b, path, depth);
    return;
  }
  // Ajout, retrait, changement de nature ou profondeur atteinte : valeurs entières
  if (!deepEqual(a, b)) record(s, path, a, b);
}

/**
 * Différences entre deux valeurs JSON (typiquement deux objets racines dont
 * les clés deviennent le début des chemins : `{ etat, nom }`).
 */
export function diffValues(before: unknown, after: unknown, options: DiffOptions = {}): Diff {
  const defined = Object.entries(options).filter(([, v]) => v !== undefined);
  const limits: Limits = { ...DIFF_DEFAULTS, ...Object.fromEntries(defined) };
  const s: State = { limits, changes: [], size: 0, truncated: false, full: false };
  walk(s, before, after, '', 0);
  return { changes: s.changes, truncated: s.truncated };
}

/**
 * Champs à ajouter au payload d'un événement : `changes`, et `truncated`
 * seulement si quelque chose a été coupé.
 */
export function changesPayload(
  before: unknown,
  after: unknown,
  options: DiffOptions = {},
): { changes: Change[]; truncated?: true } {
  const d = diffValues(before, after, options);
  return { changes: d.changes, ...(d.truncated ? { truncated: true as const } : {}) };
}
