/**
 * Calques du MJ (docs/carte.md § 5, « Calques du MJ ») : une pile ordonnée par carte, pour
 * faire passer n'importe quel objet ou personnage au-dessus ou en dessous d'un autre. Tokens
 * et objets appartiennent à un calque (`layerId`) avec un ordre `z` (réel) ; dessins et textes
 * peuvent n'en avoir aucun (annotations).
 *
 * Calcul pur : tri des calques, nouvel ordre d'une sélection (avancer, reculer, premier plan,
 * arrière-plan) et `z` pris **entre les voisins**, pour n'écrire que les éléments déplacés.
 */
import { compareCodeUnits } from '@vtt/contracts';

/**
 * Rôle d'un calque par défaut (`MapLayer.role`) : `ground` (Sol), `objects` (objet posé sans
 * calque), `tokens` (token posé sans calque).
 */
export type DefaultLayerRole = 'ground' | 'objects' | 'tokens';

/** Ce que le moteur lit d'un calque (`MapLayer` du contrat). */
export interface LayerLike {
  id: string;
  name: string;
  sortOrder: number;
  visibleToPlayers: boolean;
  locked: boolean;
  opacity: number;
  role?: DefaultLayerRole | null;
  version: number;
}

/** Identifiant du calque implicite, tant que la carte n'a pas de calques (ancien backend). */
export const IMPLICIT_LAYER_ID = '__implicit';

/** Du plus bas au plus haut (à ordre égal, par identifiant : même ordre chez tous). */
export function sortLayers<L extends Pick<LayerLike, 'id' | 'sortOrder'>>(
  layers: Iterable<L>,
): L[] {
  return [...layers].sort((a, b) => a.sortOrder - b.sortOrder || compareCodeUnits(a.id, b.id));
}

/** Élément d'une pile : identifiant et ordre dans son calque. */
export interface Stackable {
  id: string;
  z: number;
}

export type OrderOp = 'forward' | 'backward' | 'front' | 'back';

/** Pile triée par `z` croissant (à `z` égal, par identifiant). */
export function sortStack<S extends Stackable>(items: Iterable<S>): S[] {
  return [...items].sort((a, b) => a.z - b.z || compareCodeUnits(a.id, b.id));
}

/**
 * Nouvel ordre (du dessous vers le dessus) après une opération sur la sélection. L'ordre
 * relatif des éléments sélectionnés est toujours gardé.
 * - `forward` / `backward` : chaque bloc sélectionné passe l'élément voisin non sélectionné ;
 * - `front` / `back` : la sélection passe tout en haut ou tout en bas.
 */
export function reorderStack(
  order: readonly string[],
  selected: ReadonlySet<string>,
  op: OrderOp,
): string[] {
  const out = [...order];
  switch (op) {
    case 'front':
      return [...out.filter((id) => !selected.has(id)), ...out.filter((id) => selected.has(id))];
    case 'back':
      return [...out.filter((id) => selected.has(id)), ...out.filter((id) => !selected.has(id))];
    case 'forward':
      // Du haut vers le bas : un bloc sélectionné monte d'un cran d'un seul tenant
      for (let i = out.length - 2; i >= 0; i--)
        if (selected.has(out[i]!) && !selected.has(out[i + 1]!))
          [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
      return out;
    case 'backward':
      for (let i = 1; i < out.length; i++)
        if (selected.has(out[i]!) && !selected.has(out[i - 1]!))
          [out[i], out[i - 1]] = [out[i - 1]!, out[i]!];
      return out;
  }
}

/** Écart minimal entre deux `z` voisins avant de renuméroter la pile. */
export const Z_EPSILON = 1e-7;

/**
 * `z` à écrire pour que la pile suive `order` : les éléments de `movable` prennent un `z` entre
 * leurs voisins fixes, les autres gardent le leur. Seuls les éléments qui en ont besoin sont
 * renvoyés. Si l'écart est épuisé (précision), toute la pile est renumérotée (0, 1, 2…).
 */
export function assignZ(
  order: readonly string[],
  zOf: ReadonlyMap<string, number>,
  movable: ReadonlySet<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  let prevFixed: number | null = null;
  let i = 0;
  while (i < order.length) {
    const id = order[i]!;
    if (!movable.has(id)) {
      prevFixed = zOf.get(id) ?? 0;
      i += 1;
      continue;
    }
    // Suite d'éléments déplacés, entre deux voisins fixes
    const run: string[] = [];
    while (i < order.length && movable.has(order[i]!)) run.push(order[i++]!);
    const nextId = order[i];
    const nextFixed = nextId !== undefined ? (zOf.get(nextId) ?? 0) : null;
    const lo = prevFixed;
    const hi = nextFixed;

    const current = run.map((r) => zOf.get(r));
    const inPlace = current.every(
      (z, k) =>
        z !== undefined &&
        (lo === null || z > lo) &&
        (hi === null || z < hi) &&
        (k === 0 || z > current[k - 1]!),
    );
    if (!inPlace) {
      const k = run.length;
      let values: number[];
      if (lo === null && hi === null) values = run.map((_, j) => j);
      else if (lo === null) values = run.map((_, j) => hi! - (k - j));
      else if (hi === null) values = run.map((_, j) => lo + j + 1);
      else {
        const step = (hi - lo) / (k + 1);
        if (!(step > Z_EPSILON)) return renumber(order, zOf);
        values = run.map((_, j) => lo + step * (j + 1));
      }
      run.forEach((r, j) => out.set(r, values[j]!));
    }
    if (nextId !== undefined) prevFixed = nextFixed;
  }
  return out;
}

/** Renumérote toute la pile (0, 1, 2…), en n'écrivant que ce qui change. */
function renumber(order: readonly string[], zOf: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  order.forEach((id, i) => {
    if (zOf.get(id) !== i) out.set(id, i);
  });
  return out;
}

/** `z` de `count` éléments posés tout en haut d'une pile (dans l'ordre donné). */
export function zOnTop(stack: readonly Stackable[], count: number): number[] {
  const top = stack.reduce((m, s) => Math.max(m, s.z), -Infinity);
  const base = Number.isFinite(top) ? Math.floor(top) : -1;
  return Array.from({ length: count }, (_, i) => base + i + 1);
}

/** `z` de `count` éléments posés tout en bas d'une pile (dans l'ordre donné). */
export function zAtBottom(stack: readonly Stackable[], count: number): number[] {
  const bottom = stack.reduce((m, s) => Math.min(m, s.z), Infinity);
  const base = Number.isFinite(bottom) ? Math.ceil(bottom) : count;
  return Array.from({ length: count }, (_, i) => base - count + i);
}
