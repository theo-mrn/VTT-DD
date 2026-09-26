/** Mise en forme des valeurs de la fiche, d'après la nature déclarée par le système. */
import type { Attribut, LigneJournal, Operation, SystemeCharge, Valeur } from '@vtt/rules';

export function formaterNombre(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** « +2 », « −1 », « +0 ». */
export function formaterSigne(n: number): string {
  return n < 0 ? `−${formaterNombre(-n)}` : `+${formaterNombre(n)}`;
}

export function formaterValeur(attribut: Attribut | undefined, v: Valeur | undefined): string {
  if (v === undefined) return '—';
  if (attribut?.nature === 'choix') return attribut.options.find((o) => o.valeur === v)?.nom ?? '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'number') return formaterNombre(v);
  return v || '—';
}

/** Symbole d'une ligne d'explication. */
export const SYMBOLES_OPERATION: Record<Operation, string> = {
  base: '=',
  formule: '=',
  ajouter: '+',
  multiplier: '×',
  fixer: '=',
  minimum: '≥',
  maximum: '≤',
  borne: '⇥',
};

export const LIBELLES_OPERATION: Record<Operation, string> = {
  base: 'valeur de base',
  formule: 'calcul',
  ajouter: 'ajout',
  multiplier: 'multiplication',
  fixer: 'valeur fixée',
  minimum: 'minimum',
  maximum: 'maximum',
  borne: 'borne',
};

/** Nom lisible de l'objet d'un achat : attribut, entrée ou `arbre/nœud`. */
export function nomObjet(systeme: SystemeCharge, type: string, ligne: Pick<LigneJournal, 'objet'>) {
  const o = ligne.objet;
  const entree = systeme.entrees.get(o);
  if (entree) return entree.nom;
  const attribut = systeme.entites.get(type)?.attributs.get(o);
  if (attribut) return attribut.nom;
  const [arbreId, noeudId] = o.split('/');
  const arbre = arbreId ? systeme.arbres.get(arbreId) : undefined;
  const noeud = arbre?.noeuds.find((n) => n.id === noeudId);
  if (arbre && noeud)
    return `${systeme.entrees.get(noeud.entree)?.nom ?? noeud.entree} (${arbre.nom})`;
  return o;
}

/** Nom lisible d'une marque (clé posée par un effet) : « carriere » → « Carriere ». */
export function nomMarque(marque: string) {
  const mots = marque.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return mots.charAt(0).toUpperCase() + mots.slice(1).toLowerCase();
}
