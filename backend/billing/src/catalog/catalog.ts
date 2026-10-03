/**
 * Articles vendus et abonnement premium. Les montants viennent d'ici et
 * seulement d'ici : le client n'envoie qu'un identifiant d'article (comme
 * l'ancienne route /api/checkout, qui relisait DICE_SKINS et TOKEN_DEFINITIONS).
 */
import type { ItemKind } from '../db/schema.js';
import { DICE_ITEMS, TOKEN_ITEMS } from './items.js';

export interface CatalogEntry {
  id: string;
  name: string;
  /** Prix en centimes d'euro ; 0 : gratuit, jamais vendu. */
  price: number;
  description?: string;
  /** Image affichée par Stripe Checkout (URL absolue). */
  image?: string;
}

export interface CatalogItem extends CatalogEntry {
  kind: ItemKind;
}

export const CURRENCY = 'eur';

/** Préfixe des cadres de jetons dans l'identifiant d'achat (`token_Token3`), comme l'ancienne app. */
export const TOKEN_PREFIX = 'token_';

const DICE = new Map(DICE_ITEMS.map((i) => [i.id, { ...i, kind: 'dice' as const }]));
const TOKENS = new Map(TOKEN_ITEMS.map((i) => [i.id, { ...i, kind: 'token' as const }]));

/**
 * Article désigné par l'identifiant d'achat de l'ancienne boutique : un skin
 * de dés (`bismuth`) ou un cadre préfixé (`token_Token3`).
 */
export function findItem(ref: string): CatalogItem | undefined {
  if (ref.startsWith(TOKEN_PREFIX)) return TOKENS.get(ref.slice(TOKEN_PREFIX.length));
  return DICE.get(ref);
}

/** Article déjà enregistré (type et identifiant séparés). */
export function itemOf(kind: ItemKind, id: string): CatalogItem | undefined {
  return kind === 'token' ? TOKENS.get(id) : DICE.get(id);
}

/** Libellé de la ligne Stripe Checkout (ancienne route /api/checkout). */
export const lineName = (item: CatalogItem) =>
  item.kind === 'dice' ? `Dés : ${item.name}` : `Cadre : ${item.name}`;

/** Abonnement premium de l'ancienne route /api/subscribe. */
export const PREMIUM = {
  name: 'Abonnement Premium VTT-DD',
  description: 'Accès à tous les dés, badge exclusif, soutien au développeur.',
  /** 4,99 € par mois, prix de l'ancienne app (si STRIPE_PREMIUM_PRICE_ID est absent). */
  monthlyPriceCents: 499,
} as const;
