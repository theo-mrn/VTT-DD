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
      case 'des':
        return ecrireDes(n);
      case 'unaire':
        return n.op === '-' ? `−${ecrire(n.arg)}` : `non ${ecrire(n.arg)}`;
      case 'binaire':
        return ecrireBinaire(n);
      case 'si': {
        const c = calcule(n.condition);
        if (c === true) return ecrire(n.alors);
        if (c === false) return ecrire(n.sinon);
        return `si(${ecrire(n.condition)}, ${ecrire(n.alors)}, ${ecrire(n.sinon)})`;
      }
      case 'appel':
        return ecrireAppel(n);
      case 'attribut':
        return n.entite ? `@${n.entite}.${n.cle}` : `@${n.cle}`;
      case 'variable':
        return n.nom;
      default:
        return nombreLisible(n.v);
    }
  };
  /** Écrit ce qui se calcule, sinon le sous-terme entre parenthèses. */
  const valeurOuTerme = (x: Noeud) => {
    const v = calcule(x);
    return v === undefined ? `(${ecrire(x)})` : String(v);
  };
  const ecrireDes = (n: Extract<Noeud, { t: 'des' }>): string => {
    let garder = '';
    if (n.garder) {
      const sens = n.garder.sens === 'bas' ? 'kl' : 'k';
      garder = `${sens}${calcule(n.garder.n) ?? ecrire(n.garder.n)}`;
    }
    return `${valeurOuTerme(n.nombre)}d${valeurOuTerme(n.faces)}${garder}${n.explose ? '!' : ''}`;
  };
  const ecrireBinaire = (n: Extract<Noeud, { t: 'binaire' }>): string => {
    const g = ecrire(n.g);
    const d = calcule(n.d);
    const additif = n.op === '+' || n.op === '-';
    // Un terme nul ne s'écrit pas : « 1d20 + 4 », pas « 1d20 + 4 + 0 + 0 »
    if (additif && estNul(d)) return g;
    const droite = d === undefined ? ecrire(n.d) : nombreLisible(d);
    if (n.op === '+' && estNul(calcule(n.g))) return droite;
    // « + −2 » s'écrit « − 2 », « − −2 » s'écrit « + 2 »
    if (additif && typeof d === 'number' && d < 0)
      return `${g} ${n.op === '+' ? '−' : '+'} ${nombreLisible(-d)}`;
    const entoure = (x: string, noeud: Noeud) =>
      noeud.t === 'binaire' && (n.op === '*' || n.op === '/') ? `(${x})` : x;
    return `${entoure(g, n.g)} ${OPERATEURS[n.op] ?? n.op} ${entoure(droite, n.d)}`;
  };
  const ecrireAppel = (n: Extract<Noeud, { t: 'appel' }>): string => {
    if (n.fn === 'maximum_des') return `max(${ecrire(n.args[0]!)})`;
    if (n.fn !== 'multiplier_des') return `${n.fn}(${n.args.map(ecrire).join(', ')})`;
    const k = calcule(n.args[0]!);
    if (k === 1) return ecrire(n.args[1]!);
    return `${nombreLisible(k ?? '?')} × (${ecrire(n.args[1]!)})`;
  };
  return ecrire(f.noeud);
}

/** Terme nul, qui ne s'écrit pas dans une somme. */
function estNul(v: Valeur | undefined): boolean {
  return v === 0 || v === '' || v === false;
}
