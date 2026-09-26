/**
 * Parcours des arbres : ouverture, nœuds acquis et nœuds reliés. Un lien
 * `double` se traverse dans les deux sens, un lien `simple` de `de` vers `vers`.
 */
import type { Fiche } from '../calcul/index.js';
import type { Arbre, EtatEntite } from '../schema/index.js';

/** Un arbre est ouvert si l'entrée qui l'ouvre est possédée (ou s'il n'en déclare pas). */
export function arbreOuvert(fiche: Fiche, arbre: Arbre): boolean {
  return !arbre.ouvertPar || fiche.possessions.has(arbre.ouvertPar);
}

export function noeudsAcquis(etat: EtatEntite, arbre: string): Set<string> {
  return new Set(etat.noeuds[arbre] ?? []);
}

/** Nœuds atteignables en un pas depuis `id`. */
export function voisins(arbre: Arbre, id: string): string[] {
  const r: string[] = [];
  for (const l of arbre.liens) {
    if (l.de === id) r.push(l.vers);
    if (l.sens === 'double' && l.vers === id) r.push(l.de);
  }
  return r;
}

/** Nœud de départ, ou relié à un nœud acquis par un lien traversable vers lui. */
export function noeudRelie(arbre: Arbre, acquis: Set<string>, id: string): boolean {
  const n = arbre.noeuds.find((x) => x.id === id);
  if (!n) return false;
  if (n.depart) return true;
  return [...acquis].some((a) => voisins(arbre, a).includes(id));
}

/** Nœuds acquis qui ne sont plus reliés à un nœud de départ (après un retrait). */
export function noeudsIsoles(arbre: Arbre, acquis: Set<string>): string[] {
  const atteints = new Set<string>();
  const file = arbre.noeuds.filter((n) => n.depart && acquis.has(n.id)).map((n) => n.id);
  file.forEach((id) => atteints.add(id));
  while (file.length) {
    const id = file.shift()!;
    for (const v of voisins(arbre, id)) {
      if (acquis.has(v) && !atteints.has(v)) {
        atteints.add(v);
        file.push(v);
      }
    }
  }
  return [...acquis].filter((id) => !atteints.has(id));
}
