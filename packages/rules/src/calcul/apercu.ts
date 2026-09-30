/**
 * Aperçu lisible d'une formule pour une fiche : tout ce qui ne dépend pas des dés est
 * calculé (attributs, modificateurs, champs de l'objet, constantes), les dés restent
 * écrits. « 1d6 - @CON + 8 » avec CON 2 → « 1d6 − 2 + 8 » ; « des(source.nbDes,
 * source.faces) » → « 1d8 ». Sans générateur : rien n'est tiré.
 */
import {
  ErreurEvaluation,
  evaluer,
  type FormuleVerifiee,
  type Noeud,
  type Valeur,
} from '../formules/index.js';
import type { Fiche } from './fiche.js';

function contientDes(n: Noeud): boolean {
  switch (n.t) {
    case 'des':
      return true;
    case 'appel':
      return n.args.some(contientDes);
    case 'unaire':
      return contientDes(n.arg);
    case 'binaire':
      return contientDes(n.g) || contientDes(n.d);
    case 'si':
      return contientDes(n.condition) || contientDes(n.alors) || contientDes(n.sinon);
    default:
      return false;
  }
}

function nombreLisible(v: Valeur): string {
  if (typeof v === 'number') return String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'vrai' : 'faux';
  return v;
}

const OPERATEURS: Partial<Record<string, string>> = { '-': '−', '*': '×', '/': '÷' };

/**
 * Aperçu de `f` sur `fiche` ; `variable` : valeurs des variables de la formule (champs de
 * l'objet `source.x`, `rang`…). Une partie qui ne se calcule pas reste écrite telle quelle.
 */
export function apercuFormule(
  fiche: Fiche,
  f: FormuleVerifiee,
  variable: (nom: string) => Valeur | undefined = () => undefined,
): string {
  const ctx = fiche.contexte({
    variable: (nom) => {
      const v = variable(nom);
      if (v === undefined) throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
      return v;
    },
  });
  const calcule = (n: Noeud): Valeur | undefined => {
    if (contientDes(n)) return undefined;
    try {
      return evaluer(n, ctx).valeur;
    } catch {
      return undefined;
    }
  };

  const ecrire = (n: Noeud): string => {
    const v = calcule(n);
    if (v !== undefined) return nombreLisible(v);
    switch (n.t) {
      case 'des': {
        const nb = calcule(n.nombre);
        const faces = calcule(n.faces);
        const k = n.garder ? calcule(n.garder.n) : undefined;
        const garder = n.garder
          ? `k${n.garder.sens === 'bas' ? 'l' : ''}${k ?? ecrire(n.garder.n)}`
          : '';
        return `${nb ?? `(${ecrire(n.nombre)})`}d${faces ?? `(${ecrire(n.faces)})`}${garder}${n.explose ? '!' : ''}`;
      }
      case 'unaire':
        return n.op === '-' ? `−${ecrire(n.arg)}` : `non ${ecrire(n.arg)}`;
      case 'binaire': {
        const g = ecrire(n.g);
        const d = calcule(n.d);
        // Un terme nul ne s'écrit pas : « 1d20 + 4 », pas « 1d20 + 4 + 0 + 0 »
        if (n.op === '+' || n.op === '-') {
          const nul = (v: Valeur | undefined) => v === 0 || v === '' || v === false;
          if (nul(d)) return g;
          if (n.op === '+' && nul(calcule(n.g)))
            return d !== undefined ? nombreLisible(d) : ecrire(n.d);
        }
        // « + −2 » s'écrit « − 2 », « − −2 » s'écrit « + 2 »
        if (typeof d === 'number' && d < 0 && (n.op === '+' || n.op === '-'))
          return `${g} ${n.op === '+' ? '−' : '+'} ${nombreLisible(-d)}`;
        const droite = d !== undefined ? nombreLisible(d) : ecrire(n.d);
        const entoure = (x: string, noeud: Noeud) =>
          noeud.t === 'binaire' && (n.op === '*' || n.op === '/') ? `(${x})` : x;
        return `${entoure(g, n.g)} ${OPERATEURS[n.op] ?? n.op} ${entoure(droite, n.d)}`;
      }
      case 'si': {
        const c = calcule(n.condition);
        if (c === true) return ecrire(n.alors);
        if (c === false) return ecrire(n.sinon);
        return `si(${ecrire(n.condition)}, ${ecrire(n.alors)}, ${ecrire(n.sinon)})`;
      }
      case 'appel':
        if (n.fn === 'multiplier_des') {
          const k = calcule(n.args[0]!);
          return k === 1
            ? ecrire(n.args[1]!)
            : `${nombreLisible(k ?? '?')} × (${ecrire(n.args[1]!)})`;
        }
        if (n.fn === 'maximum_des') return `max(${ecrire(n.args[0]!)})`;
        return `${n.fn}(${n.args.map(ecrire).join(', ')})`;
      case 'attribut':
        return n.entite ? `@${n.entite}.${n.cle}` : `@${n.cle}`;
      case 'variable':
        return n.nom;
      default:
        return nombreLisible(n.v);
    }
  };
  return ecrire(f.noeud);
}
