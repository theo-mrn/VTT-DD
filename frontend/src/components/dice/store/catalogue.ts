/**
 * Catalogue de la boutique : raretés, prix, filtres et tris, sans React (testé
 * dans catalogue.test.ts).
 *
 * - « Ma collection » : les dés à soi en propre (inventaire du service dice :
 *   gratuits, achetés, offerts par code), premium ou non ;
 * - « À débloquer » : ceux qu'on ne peut pas équiper (`ownsSkin` faux) ; vide
 *   avec `allSkins` (premium).
 */
import { activeLocale, translate } from '@/i18n/runtime';
import { ownsSkin, type DicePreferences } from '@/lib/dice-preferences';
import { DICE_SKINS, type DiceSkin } from '../three/dice-definitions';

export type Rarete = NonNullable<DiceSkin['rarity']>;
export type Possession = 'tous' | 'collection' | 'a-debloquer';
export type Tri = 'rarete' | 'prix' | 'nom';

/**
 * Couleur d'une rareté : jeton de thème (pastille, liseré, badge) ; son nom :
 * `dice.store.rarities.<rareté>`.
 */
export const RARETES: Record<
  Rarete,
  {
    ordre: number;
    ton: 'neutre' | 'succes' | 'info' | 'arcane' | 'primaire';
    teinte: string;
  }
> = {
  legendary: { ordre: 4, ton: 'primaire', teinte: 'bg-primary' },
  epic: { ordre: 3, ton: 'arcane', teinte: 'bg-arcane' },
  rare: { ordre: 2, ton: 'info', teinte: 'bg-info' },
  uncommon: { ordre: 1, ton: 'succes', teinte: 'bg-success' },
  common: { ordre: 0, ton: 'neutre', teinte: 'bg-muted-foreground' },
};
export const ORDRE_RARETES: Rarete[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export const rareteDe = (s: DiceSkin): Rarete => s.rarity ?? 'common';

export function prix(s: DiceSkin): string {
  if (s.price === 0) return translate('dice.store.free');
  return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency: 'EUR' }).format(
    s.price / 100,
  );
}

export const CATALOGUE: readonly DiceSkin[] = Object.values(DICE_SKINS);

const COMPARER: Record<Tri, (a: DiceSkin, b: DiceSkin) => number> = {
  rarete: (a, b) => RARETES[rareteDe(b)].ordre - RARETES[rareteDe(a)].ordre,
  prix: (a, b) => b.price - a.price,
  nom: () => 0,
};

/** Sans accents ni casse : « singularite » trouve « Singularité ». */
const plier = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export interface Filtres {
  recherche: string;
  possession: Possession;
  rarete: Rarete | null;
  tri: Tri;
}

/**
 * Dés affichés, filtrés et triés. `nom` donne le nom affiché d'un skin (langue de la page) :
 * la recherche et le tri par nom portent sur lui.
 */
export function filtrer(
  catalogue: readonly DiceSkin[],
  prefs: DicePreferences,
  f: Filtres,
  nom: (s: DiceSkin) => string,
): DiceSkin[] {
  const q = plier(f.recherche.trim());
  const parNom = (a: DiceSkin, b: DiceSkin) =>
    nom(a).localeCompare(nom(b), activeLocale(), { sensitivity: 'base' });
  return catalogue
    .filter((s) => {
      if (f.rarete && rareteDe(s) !== f.rarete) return false;
      if (f.possession === 'collection' && !prefs.inventory.includes(s.id)) return false;
      if (f.possession === 'a-debloquer' && ownsSkin(prefs, s.id)) return false;
      return !q || plier(nom(s)).includes(q);
    })
    .sort((a, b) => COMPARER[f.tri](a, b) || parNom(a, b));
}

/** Compteurs du sélecteur Tous / Ma collection / À débloquer, sur tout le catalogue. */
export function compter(
  catalogue: readonly DiceSkin[],
  prefs: DicePreferences,
): Record<Possession, number> {
  return {
    tous: catalogue.length,
    collection: catalogue.filter((s) => prefs.inventory.includes(s.id)).length,
    'a-debloquer': catalogue.filter((s) => !ownsSkin(prefs, s.id)).length,
  };
}
