/**
 * Dégâts reçus : passage d'une valeur de dégâts par les résistances
 * (`sur: degats`) des sources d'effets actives de l'entité qui les reçoit
 * (entrées, exemplaires, bonus libres).
 */
import type { Fiche } from '../calcul/index.js';
import type { EffetDegats } from '../schema/index.js';

export interface LigneResistance {
  source: string;
  nom: string;
  operation: EffetDegats['operation'];
  valeur: number;
  /** Écartée : une résistance plus forte de la même famille s'applique. */
  ignore?: boolean;
}

export interface DegatsRecus {
  /** Dégâts avant résistances. */
  brut: number;
  /** Dégâts après résistances (entier, jamais négatif). */
  valeur: number;
  lignes: LigneResistance[];
  /** Minimum qui a relevé le résultat (« au moins 1 DM ») ; absent s'il n'a rien changé. */
  minimum?: number;
}

/**
 * Applique les résistances de `fiche` à `montant` dégâts de type `type`
 * (facultatif) sur `attribut`. Une résistance sans `types` vaut pour tous les
 * dégâts ; une résistance typée ne vaut que pour ses types.
 */
export function reduireDegats(
  fiche: Fiche,
  montant: number,
  type: string | undefined,
  attribut: string,
  minimum = 0,
): DegatsRecus {
  const candidates: LigneResistance[] = [];
  // Entrées du catalogue, exemplaires et bonus libres, par le même chemin
  for (const s of fiche.sources) {
    const variable = s.variable;
    s.effets.forEach((f, i) => {
      if (f.sur !== 'degats' || s.desactive(i)) return;
      if (f.types && (type === undefined || !f.types.includes(type))) return;
      if (f.attributs && !f.attributs.includes(attribut)) return;
      const cond = s.formule(i, 'condition');
      if (f.condition !== undefined && (!cond || fiche.evaluer(cond, { variable }, false) !== true))
        return;
      const f2 = s.formule(i, 'valeur');
      const valeur = f2 ? Number(fiche.evaluer(f2, { variable }, 0)) : 0;
      const ligne: LigneResistance = {
        source: s.id,
        nom: f.description ?? s.nom,
        operation: f.operation,
        valeur,
      };
      if (f.famille) (ligne as LigneResistance & { famille?: string }).famille = f.famille;
      candidates.push(ligne);
    });
  }

  // Familles : une seule résistance par famille et par opération, la plus forte
  const meilleures = new Map<string, LigneResistance>();
  for (const l of candidates) {
    const famille = (l as LigneResistance & { famille?: string }).famille;
    if (!famille) continue;
    const k = `${l.operation}/${famille}`;
    const m = meilleures.get(k);
    const plusForte =
      l.operation === 'multiplier'
        ? l.valeur < (m?.valeur ?? Infinity)
        : l.valeur > (m?.valeur ?? -Infinity);
    if (!m || plusForte) meilleures.set(k, l);
  }
  for (const l of candidates) {
    const famille = (l as LigneResistance & { famille?: string }).famille;
    if (famille && meilleures.get(`${l.operation}/${famille}`) !== l) l.ignore = true;
    delete (l as LigneResistance & { famille?: string }).famille;
  }

  let v = montant;
  const actives = candidates.filter((l) => !l.ignore);
  if (actives.some((l) => l.operation === 'annuler')) v = 0;
  for (const l of actives) if (l.operation === 'multiplier') v *= l.valeur;
  for (const l of actives) if (l.operation === 'reduire') v -= l.valeur;

  const immunise = actives.some((l) => l.operation === 'annuler');
  const plancher = !immunise && montant > 0 ? Math.max(0, minimum) : 0;
  const reduit = Math.max(0, Math.floor(v));
  return {
    brut: montant,
    valeur: Math.max(plancher, reduit),
    lignes: candidates,
    ...(plancher > reduit ? { minimum: plancher } : {}),
  };
}
