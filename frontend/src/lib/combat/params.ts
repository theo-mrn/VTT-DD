/**
 * Paramètres d'une action du système (docs/combat.md § 5.2, regles.md § 7) : ce qui se lit
 * dans la définition de l'action et la fiche de qui agit, sans une clé de jeu. Partagé par le
 * menu d'attaque, le lanceur d'actions de la fiche et le formulaire d'initiative (lot 4).
 *
 * - Un paramètre `par: cible` (défense active, Esquive) n'est jamais demandé à l'attaquant :
 *   c'est la cible qui le choisit (`reactionParams`).
 * - Un paramètre dont l'`exige` est faux pour qui décide (option d'un talent non possédé) est
 *   caché : le moteur lui garde sa valeur par défaut.
 * - Une entrée possédée en plusieurs exemplaires en propose chacun (`entree#exemplaire`).
 */
import {
  chemins,
  nomPossession,
  type Action,
  type Fiche,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import type { ActionParams } from '@vtt/contracts';

export type ActionParam = Action['parametres'][number];
export type AttributeParam = Extract<ActionParam, { type: 'attribut' }>;
export type EntryParam = Extract<ActionParam, { type: 'entree' }>;

/** Qui choisit ce paramètre : l'acteur (défaut) ou la cible (réaction). */
export const paramChooser = (p: ActionParam): 'acteur' | 'cible' =>
  (p as { par?: 'acteur' | 'cible' }).par === 'cible' ? 'cible' : 'acteur';

/** Attributs proposés par un paramètre `attribut` (ceux d'une règle éteinte sont retirés). */
export function attributeOptions(fiche: Fiche, p: AttributeParam): string[] {
  if (p.attributs?.length) return p.attributs.filter((c) => fiche.attributActif(c));
  return [...fiche.entite.attributs.values()]
    .filter((a) => a.groupe === p.groupe && fiche.attributActif(a.cle))
    .map((a) => a.cle);
}

export interface EntryOption {
  /** `entree`, ou `entree#exemplaire` pour un exemplaire précis. */
  id: string;
  nom: string;
  rang: number;
}

/**
 * Entrées proposées pour un paramètre `entree` : possédées (ou tout le catalogue de la sorte si
 * `possedee` est faux), filtrées par l'étiquette ; un exemplaire par ligne s'il y en a plusieurs.
 */
export function entryOptions(fiche: Fiche, p: EntryParam): EntryOption[] {
  const fits = (e: { sorte: string; etiquettes: string[] }) =>
    e.sorte === p.sorte && (!p.etiquette || e.etiquettes.includes(p.etiquette));
  const copies = (id: string): EntryOption[] | null => {
    const x = fiche.possessions.get(id);
    if (!x || x.exemplaires.length < 2) return null;
    return x.exemplaires.map((ex, i) => {
      const nom = nomPossession(x.entree, x.sorte, ex);
      return {
        id: ex.exemplaire === undefined ? id : `${id}#${ex.exemplaire}`,
        nom: nom === x.entree.nom ? `${nom} (n° ${i + 1})` : nom,
        rang: x.rang,
      };
    });
  };
  if (!p.possedee)
    return [...fiche.systeme.entrees.values()]
      .filter(fits)
      .flatMap(
        (e) =>
          copies(e.id) ?? [{ id: e.id, nom: e.nom, rang: fiche.possessions.get(e.id)?.rang ?? 0 }],
      );
  return [...fiche.possessions.values()]
    .filter((x) => fits(x.entree))
    .flatMap(
      (x) =>
        copies(x.entree.id) ?? [
          { id: x.entree.id, nom: nomPossession(x.entree, x.sorte, x.possession), rang: x.rang },
        ],
    );
}

/** Valeur par défaut d'un paramètre, pour préremplir le formulaire (`''` : aucune). */
export function defaultParamValue(fiche: Fiche, p: ActionParam): Valeur {
  switch (p.type) {
    case 'nombre':
      return p.defaut;
    case 'booleen':
      return p.defaut;
    case 'attribut':
      return attributeOptions(fiche, p)[0] ?? '';
    case 'entree':
      return p.facultatif ? '' : (entryOptions(fiche, p)[0]?.id ?? '');
  }
}

/** L'`exige` du paramètre est vrai pour `decideur` (vrai sans condition). */
export function paramAllowed(
  systeme: SystemeCharge,
  action: Action,
  p: ActionParam,
  decideur: Fiche,
): boolean {
  const exige = systeme.formules.get(chemins.action(action.id, `parametres/${p.id}/exige`));
  if (!exige) return true;
  try {
    return decideur.evaluer(exige, {}, false) === true;
  } catch {
    return false;
  }
}

/** Paramètres demandés à l'attaquant : les siens (pas ceux de la cible), permis par sa fiche. */
export function attackerParams(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
): ActionParam[] {
  return action.parametres.filter(
    (p) => paramChooser(p) === 'acteur' && paramAllowed(systeme, action, p, fiche),
  );
}

/** Paramètres de défense active, choisis par la cible (proposés à qui l'incarne). */
export function reactionParams(action: Action): ActionParam[] {
  return action.parametres.filter((p) => paramChooser(p) === 'cible');
}

/** Valeurs par défaut des paramètres de l'attaquant. */
export function defaultParams(systeme: SystemeCharge, action: Action, fiche: Fiche): ActionParams {
  return Object.fromEntries(
    attackerParams(systeme, action, fiche).map((p) => [p.id, defaultParamValue(fiche, p)]),
  );
}

/**
 * Valeurs d'un formulaire gardées pour l'action : défauts pour les paramètres manquants,
 * valeurs connues d'une action précédente reprises si elles restent valides (§ 8.2, « même
 * attaque » pour le PNJ suivant).
 */
export function mergeParams(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
  previous: ActionParams = {},
): ActionParams {
  const out: ActionParams = {};
  for (const p of attackerParams(systeme, action, fiche)) {
    const v = previous[p.id];
    out[p.id] = v !== undefined && paramValueValid(fiche, p, v) ? v : defaultParamValue(fiche, p);
  }
  return out;
}

/** La valeur convient à ce paramètre pour cette fiche (type, option proposée). */
export function paramValueValid(fiche: Fiche, p: ActionParam, v: Valeur): boolean {
  switch (p.type) {
    case 'nombre':
      return typeof v === 'number' && Number.isFinite(v);
    case 'booleen':
      return typeof v === 'boolean';
    case 'attribut':
      return typeof v === 'string' && attributeOptions(fiche, p).includes(v);
    case 'entree':
      return (
        typeof v === 'string' &&
        ((p.facultatif && v === '') || entryOptions(fiche, p).some((o) => o.id === v))
      );
  }
}

/**
 * Paramètres envoyés au service : ceux de l'attaquant seulement (jamais un paramètre de la
 * cible), sans les valeurs vides (entrée facultative non choisie).
 */
export function paramsToSend(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche | null,
  values: ActionParams,
): ActionParams {
  const allowed = fiche
    ? new Set(attackerParams(systeme, action, fiche).map((p) => p.id))
    : new Set(action.parametres.filter((p) => paramChooser(p) === 'acteur').map((p) => p.id));
  return Object.fromEntries(
    Object.entries(values).filter(([k, v]) => allowed.has(k) && v !== ''),
  ) as ActionParams;
}

/** Paramètres qui manquent (entrée requise sans option : « aucune arme »). */
export function missingParams(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
  values: ActionParams,
): ActionParam[] {
  return attackerParams(systeme, action, fiche).filter(
    (p) => p.type === 'entree' && !p.facultatif && !values[p.id],
  );
}
