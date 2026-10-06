/**
 * Catalogue de la boutique : raretés, prix, filtres et tris, sans React (testé
 * dans catalogue.test.ts). La possession suit la règle du service dice
 * (`ownsSkin` : `allSkins`, ou skin dans l'inventaire).
 */
import { ownsSkin, type DicePreferences } from '@/lib/dice-preferences';
import { DICE_SKINS, type DiceSkin } from '../three/dice-definitions';

export type Rarete = NonNullable<DiceSkin['rarity']>;
export type Possession = 'tous' | 'possedes' | 'a-debloquer';
export type Tri = 'rarete' | 'prix' | 'nom';

/** Couleur d'une rareté : jeton de thème (pastille, liseré, badge). */
export const RARETES: Record<
  Rarete,
  {
    libelle: string;
    ordre: number;
    ton: 'neutre' | 'succes' | 'info' | 'arcane' | 'primaire';
    teinte: string;
  }
> = {
  legendary: { libelle: 'Légendaire', ordre: 4, ton: 'primaire', teinte: 'bg-primary' },
  epic: { libelle: 'Épique', ordre: 3, ton: 'arcane', teinte: 'bg-arcane' },
  rare: { libelle: 'Rare', ordre: 2, ton: 'info', teinte: 'bg-info' },
  uncommon: { libelle: 'Peu commun', ordre: 1, ton: 'succes', teinte: 'bg-success' },
  common: { libelle: 'Commun', ordre: 0, ton: 'neutre', teinte: 'bg-muted-foreground' },
};
export const ORDRE_RARETES: Rarete[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export const rareteDe = (s: DiceSkin): Rarete => s.rarity ?? 'common';

export function prix(s: DiceSkin): string {
  if (s.price === 0) return 'Gratuit';
  return (s.price / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

export const CATALOGUE: readonly DiceSkin[] = Object.values(DICE_SKINS);

const COMPARER: Record<Tri, (a: DiceSkin, b: DiceSkin) => number> = {
  rarete: (a, b) => RARETES[rareteDe(b)].ordre - RARETES[rareteDe(a)].ordre,
  prix: (a, b) => b.price - a.price,
  nom: () => 0,
};
const parNom = (a: DiceSkin, b: DiceSkin) => a.name.localeCompare(b.name, 'fr');

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

export function filtrer(
  catalogue: readonly DiceSkin[],
  prefs: DicePreferences,
  f: Filtres,
): DiceSkin[] {
  const q = plier(f.recherche.trim());
  return catalogue
    .filter((s) => {
      if (f.rarete && rareteDe(s) !== f.rarete) return false;
      if (f.possession !== 'tous' && ownsSkin(prefs, s.id) !== (f.possession === 'possedes'))
        return false;
      return !q || plier(s.name).includes(q);
    })
    .sort((a, b) => COMPARER[f.tri](a, b) || parNom(a, b));
}

/** Compteurs du sélecteur Tous / Possédés / À débloquer, sur tout le catalogue. */
export function compter(catalogue: readonly DiceSkin[], prefs: DicePreferences) {
  const possedes = catalogue.filter((s) => ownsSkin(prefs, s.id)).length;
  return { tous: catalogue.length, possedes, 'a-debloquer': catalogue.length - possedes };
}
