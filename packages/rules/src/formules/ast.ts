/**
 * Arbre syntaxique des formules. Union fermée : une formule n'est jamais
 * exécutée comme du code, seulement parcourue par le vérificateur et
 * l'évaluateur de ce module.
 */

export type TypeValeur = 'nombre' | 'booleen' | 'texte';
export type Valeur = number | boolean | string;

export type OperateurBinaire =
  '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'et' | 'ou';

export type OperateurUnaire = '-' | 'non';

export type Noeud =
  | { t: 'nombre'; v: number; pos: number }
  | { t: 'booleen'; v: boolean; pos: number }
  | { t: 'texte'; v: string; pos: number }
  /** `@FOR` (entité courante) ou `@cible.ENC` (entité nommée par le contexte). */
  | { t: 'attribut'; cle: string; entite?: string; pos: number }
  /** Variable fournie par le contexte d'évaluation : `rang`, `arme.degats`… */
  | { t: 'variable'; nom: string; pos: number }
  | { t: 'appel'; fn: string; args: Noeud[]; pos: number }
  | { t: 'unaire'; op: OperateurUnaire; arg: Noeud; pos: number }
  | { t: 'binaire'; op: OperateurBinaire; g: Noeud; d: Noeud; pos: number }
  | { t: 'si'; condition: Noeud; alors: Noeud; sinon: Noeud; pos: number }
  /** `4d6k3` : lancer `nombre` dés à `faces` faces, garder éventuellement les meilleurs/pires. */
  | {
      t: 'des';
      nombre: Noeud;
      faces: Noeud;
      garder?: { sens: 'haut' | 'bas'; n: Noeud };
      explose: boolean;
      pos: number;
    };

/** Limites de sûreté : une formule saisie par un MJ ne doit pas pouvoir bloquer le moteur. */
export const LIMITES = {
  longueur: 2000,
  profondeur: 64,
  desParJet: 200,
  faces: 10_000,
  explosions: 50,
} as const;

/** Réécrit une formule sous forme canonique (utile à l'éditeur et aux tests). */
export function afficher(n: Noeud): string {
  switch (n.t) {
    case 'nombre':
      return String(n.v);
    case 'booleen':
      return n.v ? 'vrai' : 'faux';
    case 'texte':
      return JSON.stringify(n.v);
    case 'attribut':
      return n.entite ? `@${n.entite}.${n.cle}` : `@${n.cle}`;
    case 'variable':
      return n.nom;
    case 'appel':
      return `${n.fn}(${n.args.map(afficher).join(', ')})`;
    case 'unaire':
      return n.op === '-' ? `-${afficherOperande(n.arg)}` : `non ${afficherOperande(n.arg)}`;
    case 'binaire':
      return `${afficherOperande(n.g)} ${n.op} ${afficherOperande(n.d)}`;
    case 'si':
      return `si(${afficher(n.condition)}, ${afficher(n.alors)}, ${afficher(n.sinon)})`;
    case 'des': {
      const simple = (x: Noeud) => (x.t === 'nombre' ? String(x.v) : null);
      const nb = simple(n.nombre);
      const fa = simple(n.faces);
      const gk = n.garder && simple(n.garder.n);
      if (nb !== null && fa !== null && (!n.garder || gk !== null)) {
        const garder = n.garder ? `k${n.garder.sens === 'bas' ? 'l' : ''}${gk}` : '';
        return `${nb}d${fa}${garder}${n.explose ? '!' : ''}`;
      }
      const args = [afficher(n.nombre), afficher(n.faces)];
      if (n.garder) args.push(afficher(n.garder.n), JSON.stringify(n.garder.sens));
      return `${n.explose ? 'des_explosifs' : 'des'}(${args.join(', ')})`;
    }
  }
}

function afficherOperande(n: Noeud): string {
  return n.t === 'binaire' ? `(${afficher(n)})` : afficher(n);
}
