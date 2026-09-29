/**
 * Contenu d'un objet à fouiller (`items`, docs/carte.md § 10) : la logique de l'éditeur du MJ,
 * sans React. Chaque opération rend une nouvelle liste (jamais de mutation), prête à partir dans
 * une commande annulable.
 *
 * - Depuis le catalogue du marché du système : l'entrée est référencée par `ref` (son
 *   identifiant), jamais par une clé en dur ; une même entrée s'empile.
 * - Objet libre : nom, quantité, description (et image) propres ; un objet libre identique
 *   s'empile aussi.
 * - Limites du contrat : 500 contenus, quantité de 1 à 1 000 000, nom de 200 caractères,
 *   description de 10 000.
 */
import type { MapObjectItem } from '@vtt/contracts';

export const ITEMS_MAX = 500;
export const QUANTITY_MAX = 1_000_000;
export const ITEM_NAME_MAX = 200;
export const ITEM_DESCRIPTION_MAX = 10_000;

export type ItemIdFactory = () => string;

/** Identifiant d'un contenu, unique dans son objet. */
export const newItemId: ItemIdFactory = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Quantité entière entre 1 et le maximum du contrat. */
export function clampQuantity(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(QUANTITY_MAX, Math.max(1, Math.round(q)));
}

/** Entrée du catalogue, telle que le marché la connaît (`Entree` de @vtt/rules). */
export interface CatalogueEntryLike {
  id: string;
  nom: string;
}

/** Ajoute une entrée du catalogue (une de plus sur la pile si elle y est déjà). */
export function addCatalogueItem(
  items: readonly MapObjectItem[],
  entry: CatalogueEntryLike,
  quantity = 1,
  makeId: ItemIdFactory = newItemId,
): MapObjectItem[] {
  const q = clampQuantity(quantity);
  const existing = items.find((i) => i.ref === entry.id);
  if (existing)
    return items.map((i) =>
      i === existing ? { ...i, quantity: clampQuantity(i.quantity + q) } : i,
    );
  if (items.length >= ITEMS_MAX) return [...items];
  return [
    ...items,
    { id: makeId(), name: entry.nom.slice(0, ITEM_NAME_MAX), quantity: q, ref: entry.id },
  ];
}

export interface FreeItemInput {
  name: string;
  quantity: number;
  description?: string;
  imageUrl?: string;
}

/** Message d'erreur d'un objet libre, ou null s'il est valable. */
export function freeItemError(input: FreeItemInput): string | null {
  const name = input.name.trim();
  if (!name) return 'Donnez un nom à l’objet.';
  if (name.length > ITEM_NAME_MAX) return `${ITEM_NAME_MAX} caractères au plus pour le nom.`;
  if ((input.description ?? '').length > ITEM_DESCRIPTION_MAX)
    return `${ITEM_DESCRIPTION_MAX} caractères au plus pour la description.`;
  if (!Number.isFinite(input.quantity) || input.quantity < 1) return 'Quantité : 1 au moins.';
  return null;
}

/** Ajoute un objet libre (empilé sur un objet libre identique). Liste inchangée s'il est invalide. */
export function addFreeItem(
  items: readonly MapObjectItem[],
  input: FreeItemInput,
  makeId: ItemIdFactory = newItemId,
): MapObjectItem[] {
  if (freeItemError(input)) return [...items];
  const name = input.name.trim();
  const description = input.description?.trim() || undefined;
  const imageUrl = input.imageUrl?.trim() || undefined;
  const q = clampQuantity(input.quantity);
  const same = items.find(
    (i) =>
      !i.ref &&
      i.name === name &&
      (i.description ?? undefined) === description &&
      (i.imageUrl ?? undefined) === imageUrl,
  );
  if (same)
    return items.map((i) => (i === same ? { ...i, quantity: clampQuantity(i.quantity + q) } : i));
  if (items.length >= ITEMS_MAX) return [...items];
  return [
    ...items,
    {
      id: makeId(),
      name,
      quantity: q,
      ...(description ? { description } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
  ];
}

export function setItemQuantity(
  items: readonly MapObjectItem[],
  id: string,
  quantity: number,
): MapObjectItem[] {
  const q = clampQuantity(quantity);
  return items.map((i) => (i.id === id && i.quantity !== q ? { ...i, quantity: q } : i));
}

/** Renomme ou décrit un objet libre (un objet du catalogue garde son nom). */
export function updateFreeItem(
  items: readonly MapObjectItem[],
  id: string,
  patch: { name?: string; description?: string },
): MapObjectItem[] {
  return items.map((i) => {
    if (i.id !== id || i.ref) return i;
    const name = patch.name !== undefined ? patch.name.trim().slice(0, ITEM_NAME_MAX) : i.name;
    const description =
      patch.description !== undefined
        ? patch.description.trim().slice(0, ITEM_DESCRIPTION_MAX) || undefined
        : i.description;
    const { description: _old, ...rest } = i;
    return { ...rest, name: name || i.name, ...(description ? { description } : {}) };
  });
}

export function removeItem(items: readonly MapObjectItem[], id: string): MapObjectItem[] {
  return items.filter((i) => i.id !== id);
}

/** Nombre total d'unités (« 7 objets »). */
export const totalUnits = (items: readonly MapObjectItem[]) =>
  items.reduce((n, i) => n + i.quantity, 0);

/** Texte d'une quantité prise (« 2 × Potion », « Potion »). */
export const quantityLabel = (name: string, quantity: number) =>
  quantity > 1 ? `${quantity} × ${name}` : name;
