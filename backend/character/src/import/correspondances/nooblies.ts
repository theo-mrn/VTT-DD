/**
 * Noobliés Chroniques : identifiants legacy → nouveaux ids.
 *
 * Généré une fois depuis legacy/nooblies-chroniques.json (système importé
 * dans les salles) et packages/systemes/systemes/nooblies, puis relu. Les
 * profils gardent leur id ; seule une race change (`_` → `-`).
 */

/** Race (`Race`) → race. */
export const RACES: Readonly<Record<string, string>> = {
  humain: 'humain',
  elfe: 'elfe',
  elfe_noir: 'elfe-noir',
  nain: 'nain',
  orque: 'orque',
  halfelin: 'halfelin',
  minotaure: 'minotaure',
  drakonide: 'drakonide',
};

/** Profil (`Profile`) → profil. */
export const PROFILS: Readonly<Record<string, string>> = {
  barbare: 'barbare',
  barde: 'barde',
  chevalier: 'chevalier',
  druide: 'druide',
  ensorceleur: 'ensorceleur',
  guerrier: 'guerrier',
  magicien: 'magicien',
  moine: 'moine',
  pretre: 'pretre',
  rodeur: 'rodeur',
  voleur: 'voleur',
};
