/**
 * Dégâts reçus : passage d'une valeur de dégâts par les résistances
 * (`sur: degats`) des possessions actives de l'entité qui les reçoit.
 */
import { estEffective, type Fiche, type PossessionEffective } from '../calcul/index.js';
import { chemins } from '../chargement/index.js';
import { ErreurEvaluation, type Valeur } from '../formules/index.js';
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
}

/** Variables d'un effet : rang et état de sa source, champs de la source. */
function variablesSource(fiche: Fiche, p: PossessionEffective) {
  return (nom: string): Valeur => {
    if (nom === 'rang') return p.rang;
    if (nom === 'actif') return p.actif;
    if (nom.startsWith('source.')) {
      const c = nom.slice('source.'.length);
      const def = p.sorte.champs.find((x) => x.id === c);
      if (def?.type === 'formule') {
        const f = fiche.systeme.formules.get(chemins.champ(p.entree.id, c));
        return f ? fiche.evaluer(f, {}, 0) : 0;
      }
      const v = p.possession?.champs[c] ?? p.entree.champs[c];
      if (v !== undefined && !Array.isArray(v)) return v;
      if (def && 'defaut' in def && def.defaut !== undefined) return def.defaut;
      return def?.type === 'nombre' ? 0 : def?.type === 'booleen' ? false : '';
    }
    throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
  };
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
  for (const p of fiche.possessions.values()) {
    if (!p.actif || !estEffective(p)) continue;
    const variable = variablesSource(fiche, p);
    p.entree.effets.forEach((f, i) => {
      if (f.sur !== 'degats') return;
      if (f.types && (type === undefined || !f.types.includes(type))) return;
      if (f.attributs && !f.attributs.includes(attribut)) return;
      const cond = fiche.systeme.formules.get(chemins.effet(p.entree.id, i, 'condition'));
      if (cond && fiche.evaluer(cond, { variable }, false) !== true) return;
      const f2 = fiche.systeme.formules.get(chemins.effet(p.entree.id, i, 'valeur'));
      const valeur = f2 ? Number(fiche.evaluer(f2, { variable }, 0)) : 0;
      const ligne: LigneResistance = {
        source: p.entree.id,
        nom: f.description ?? p.entree.nom,
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
  return { brut: montant, valeur: Math.max(plancher, Math.floor(v)), lignes: candidates };
}
