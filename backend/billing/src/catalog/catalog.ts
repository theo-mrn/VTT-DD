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

/** Libellé du produit Stripe (ligne de facture), comme l'ancienne route /api/checkout. */
export const lineName = (item: CatalogItem) =>
  item.kind === 'dice' ? `Dés : ${item.name}` : `Cadre : ${item.name}`;

/**
 * Produit et prix Stripe d'un article. Le produit porte un identifiant fixe
 * (créé par catalog:sync) ; le prix est retrouvé par sa `lookup_key`, reprise
 * par un nouveau prix quand le montant change (un prix Stripe est immuable).
 */
export const productIdOf = (item: CatalogItem) => `yner_${item.kind}_${item.id}`;
export const lookupKeyOf = (item: CatalogItem) => `${item.kind}_${item.id}`;

/** Cadres de jetons du catalogue, gratuits compris. */
export const TOKEN_FRAMES: readonly CatalogItem[] = [...TOKENS.values()];

/** Articles payants : ceux qui existent chez Stripe. */
export const SOLD_ITEMS: readonly CatalogItem[] = [...DICE.values(), ...TOKENS.values()].filter(
  (i) => i.price > 0,
);

// ─── Premium ─────────────────────────────────────────────────────────────────

export const PREMIUM = {
  productId: 'yner_premium',
  name: 'Yner Premium',
  description: 'Tous les dés, présents et à venir, badge et bordures premium.',
} as const;

export type PlanId = 'monthly' | 'annual';

export interface PlanEntry {
  id: PlanId;
  name: string;
  /** Prix TTC en centimes d'euro, par période. */
  amount: number;
  interval: 'month' | 'year';
  lookupKey: string;
}

/** Formules vendues : prix TTC (tax_behavior inclusive), TVA ou pas. */
export const PLANS: Readonly<Record<PlanId, PlanEntry>> = {
  monthly: {
    id: 'monthly',
    name: 'Mensuel',
    amount: 499,
    interval: 'month',
    lookupKey: 'premium_monthly',
  },
  annual: {
    id: 'annual',
    name: 'Annuel',
    amount: 4990,
    interval: 'year',
    lookupKey: 'premium_annual',
  },
};

/** Formule d'un prix Stripe, par sa lookup_key ; legacy : prix de l'ancienne app. */
export function planOfLookupKey(key: string | null | undefined): 'monthly' | 'annual' | 'legacy' {
  if (key === PLANS.monthly.lookupKey) return 'monthly';
  if (key === PLANS.annual.lookupKey) return 'annual';
  return 'legacy';
}
