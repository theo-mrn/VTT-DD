/**
 * Règles optionnelles d'une campagne : le système les déclare (`options`, avec leur
 * `defaut`), la campagne en règle certaines, le moteur calcule avec le résultat.
 *
 * Deux façons de calculer avec les réglages d'une campagne :
 *   - `calculer(systeme, etat, { options })` pour une fiche ;
 *   - `avecOptions(systeme, options)` : le système « tel que la campagne le joue », à passer
 *     partout où un système est attendu (achats, création, actions) ; chaque calcul qui en
 *     part lit les mêmes réglages. Le résultat est mis en cache : mêmes réglages, même objet.
 *
 * Aucune option n'est connue ici : tout vient des déclarations du système.
 */
import type { Champ, Sorte } from '../schema/index.js';
import type { SystemeCharge } from './charger.js';

/** Réglages d'options : identifiant → allumée. Les identifiants inconnus sont ignorés. */
export type ReglagesOptions = Readonly<Record<string, boolean>>;

/** Système d'origine d'un système réglé par `avecOptions` (lui-même sinon). */
const racines = new WeakMap<SystemeCharge, SystemeCharge>();
/** Systèmes réglés, par système d'origine et par réglages normalisés. */
const regles = new WeakMap<SystemeCharge, Map<string, SystemeCharge>>();

/** Système tel que chargé, avant tout réglage de campagne. */
export function systemeRacine(systeme: SystemeCharge): SystemeCharge {
  return racines.get(systeme) ?? systeme;
}

/**
 * Réglages ramenés aux seuls écarts au `defaut` des options déclarées, triés : deux
 * réglages équivalents donnent la même forme (et le même système réglé).
 */
export function normaliserOptions(
  systeme: SystemeCharge,
  reglages: ReglagesOptions | null | undefined,
): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const [id, o] of [...systeme.options].sort(([a], [b]) => a.localeCompare(b))) {
    const v = reglages?.[id];
    if (typeof v === 'boolean' && v !== o.defaut) r[id] = v;
  }
  return r;
}

/**
 * Valeur de chaque option déclarée : son `defaut`, remplacé par les réglages du système
 * (`optionsCampagne`), puis par `reglages` s'ils sont donnés.
 */
export function optionsResolues(
  systeme: SystemeCharge,
  reglages?: ReglagesOptions | null,
): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const [id, o] of systeme.options) {
    const v = reglages?.[id] ?? systeme.optionsCampagne[id];
    r[id] = typeof v === 'boolean' ? v : o.defaut;
  }
  return r;
}

/**
 * Système réglé pour une campagne : mêmes règles, mêmes formules compilées, avec les
 * réglages `reglages` (qui remplacent ceux que `systeme` portait déjà). Sans écart aux
 * défauts, renvoie le système d'origine.
 */
export function avecOptions(
  systeme: SystemeCharge,
  reglages: ReglagesOptions | null | undefined,
): SystemeCharge {
  const racine = systemeRacine(systeme);
  const normalises = normaliserOptions(racine, reglages);
  const cle = JSON.stringify(normalises);
  if (cle === '{}') return racine;
  let parRacine = regles.get(racine);
  if (!parRacine) regles.set(racine, (parRacine = new Map()));
  let r = parRacine.get(cle);
  if (!r) {
    r = { ...racine, optionsCampagne: Object.freeze(normalises) };
    racines.set(r, racine);
    parRacine.set(cle, r);
  }
  return r;
}

/** Vrai si l'élément ne dépend d'aucune option, ou d'une option allumée. */
export function optionPermet(element: { option?: string }, options: ReglagesOptions): boolean {
  return element.option === undefined || options[element.option] === true;
}

/** Champs d'une sorte montrés avec ces options (les valeurs des autres restent dans l'état). */
export function champsActifs(sorte: Sorte, options: ReglagesOptions): Champ[] {
  return sorte.champs.filter((c) => optionPermet(c, options));
}
