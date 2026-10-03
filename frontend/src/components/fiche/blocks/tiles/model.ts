/**
 * Disposition interne d'un bloc de tuiles (attributs, ressources…) : nombre de colonnes,
 * ordre des valeurs, valeurs masquées. Réglée en personnalisation, elle est enregistrée dans
 * les paramètres du bloc de la mise en page (service character) ; absente, le bloc suit la
 * présentation du système. Fonctions pures, sans React ni clé de jeu.
 */

/** Colonnes fixes au plus (le service refuse au-delà). */
export const MAX_TILE_COLUMNS = 6;
/** Valeurs au plus dans l'ordre ou les masques enregistrés (borne du service). */
export const MAX_TILE_KEYS = 64;

/** `auto` : autant de colonnes que la largeur du bloc en permet ; sinon un nombre fixe. */
export type TileColumns = 'auto' | number;

export interface TileArrangement {
  columns?: TileColumns;
  /** Ordre des valeurs (clés) ; celles qui n'y sont pas suivent, dans l'ordre du système. */
  order?: string[];
  /** Valeurs masquées ; il en reste toujours au moins une affichée. */
  hidden?: string[];
}

/** Valeur que le bloc peut afficher, telle que le popover de disposition la liste. */
export interface Tile {
  key: string;
  label: string;
  /** Complément affiché en second (abréviation de la tuile). */
  hint?: string;
}

/** Noms des paramètres du bloc dans la mise en page enregistrée (docs/api-character.md). */
export const ARRANGEMENT_PARAMS = {
  columns: 'colonnesTuiles',
  order: 'ordre',
  hidden: 'masques',
} as const;

const PARAM_NAMES = new Set<string>(Object.values(ARRANGEMENT_PARAMS));

/** Le paramètre appartient à la disposition (et non au widget de la présentation). */
export function isArrangementParam(name: string): boolean {
  return PARAM_NAMES.has(name);
}

function keyList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const keys = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  return keys.length ? keys.slice(0, MAX_TILE_KEYS) : undefined;
}

function columnsOf(v: unknown): TileColumns | undefined {
  if (v === 'auto') return 'auto';
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_TILE_COLUMNS) return v;
  return undefined;
}

/** Disposition lue dans les paramètres d'un bloc enregistré ; absente si rien n'est réglé. */
export function readArrangement(params: Record<string, unknown>): TileArrangement | undefined {
  return normalize({
    columns: columnsOf(params[ARRANGEMENT_PARAMS.columns]),
    order: keyList(params[ARRANGEMENT_PARAMS.order]),
    hidden: keyList(params[ARRANGEMENT_PARAMS.hidden]),
  });
}

/** Paramètres à enregistrer pour une disposition (rien pour celle du système). */
export function arrangementParams(a?: TileArrangement): Record<string, string | number | string[]> {
  const n = normalize(a);
  if (!n) return {};
  return {
    ...(n.columns !== undefined ? { [ARRANGEMENT_PARAMS.columns]: n.columns } : {}),
    ...(n.order ? { [ARRANGEMENT_PARAMS.order]: n.order } : {}),
    ...(n.hidden ? { [ARRANGEMENT_PARAMS.hidden]: n.hidden } : {}),
  };
}

/** Disposition sans champ vide ; undefined si elle ne change rien (colonnes auto, rien d'autre). */
export function normalize(a?: TileArrangement): TileArrangement | undefined {
  if (!a) return undefined;
  const r: TileArrangement = {};
  if (a.columns !== undefined && a.columns !== 'auto') r.columns = a.columns;
  if (a.order?.length) r.order = a.order;
  if (a.hidden?.length) r.hidden = a.hidden;
  return Object.keys(r).length ? r : undefined;
}

/**
 * Toutes les valeurs du bloc dans l'ordre choisi : celles de `order` d'abord (si le bloc les
 * a encore), puis les autres dans l'ordre du système. Une clé inconnue du bloc est ignorée.
 */
export function orderedKeys(keys: readonly string[], a?: TileArrangement): string[] {
  const disponibles = new Set(keys);
  const tete = (a?.order ?? []).filter((k) => disponibles.has(k));
  const vues = new Set(tete);
  return [...tete, ...keys.filter((k) => !vues.has(k))];
}

/** Valeurs affichées, dans l'ordre choisi ; toutes si le masquage n'en laisse aucune. */
export function arrangeTiles(keys: readonly string[], a?: TileArrangement): string[] {
  const ordre = orderedKeys(keys, a);
  const masques = new Set(a?.hidden ?? []);
  const visibles = ordre.filter((k) => !masques.has(k));
  return visibles.length ? visibles : ordre;
}

/**
 * Disposition après un réglage, ramenée aux valeurs du bloc : l'ordre n'est gardé que s'il
 * diffère de celui du système, les masques ne visent que des valeurs du bloc et en laissent
 * une affichée. undefined : la présentation du système.
 */
export function withArrangement(
  keys: readonly string[],
  a: TileArrangement,
): TileArrangement | undefined {
  const disponibles = new Set(keys);
  const ordre = orderedKeys(keys, a);
  const masques = [...new Set(a.hidden ?? [])].filter((k) => disponibles.has(k));
  const hidden = masques.length >= keys.length ? masques.slice(0, keys.length - 1) : masques;
  const naturel = ordre.every((k, i) => k === keys[i]);
  return normalize({
    columns: a.columns,
    order: naturel ? undefined : ordre.slice(0, MAX_TILE_KEYS),
    hidden: hidden.slice(0, MAX_TILE_KEYS),
  });
}

/**
 * Colonnes en `auto` : autant que la largeur en laisse à des tuiles de `minPx` au moins, au
 * plus `cap` (préférence de la présentation) et le nombre de tuiles, puis équilibrées (6
 * tuiles sur 5 colonnes possibles : 2 rangées de 3, pas 5 + 1).
 */
export function autoColumns(
  count: number,
  widthPx: number,
  minPx: number,
  gapPx: number,
  cap?: number,
): number {
  if (count <= 1) return 1;
  const tiennent = Math.max(1, Math.floor((widthPx + gapPx) / (minPx + gapPx)));
  const n = Math.max(1, Math.min(tiennent, cap ?? count, count));
  const rangees = Math.ceil(count / n);
  return Math.ceil(count / rangees);
}

/** Colonnes affichées : le nombre fixe choisi (pas plus que de tuiles), sinon `auto`. */
export function resolveColumns(
  columns: TileColumns | undefined,
  count: number,
  auto: () => number,
): number {
  if (typeof columns === 'number') return Math.max(1, Math.min(columns, Math.max(1, count)));
  return auto();
}
