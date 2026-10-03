/**
 * Évaluation d'une formule vérifiée. Pure : tout ce qu'elle lit vient du
 * contexte, et les dés passent par le générateur fourni.
 */
import type { Generateur } from './aleatoire.js';
import { LIMITES, type Noeud, type Valeur } from './ast.js';

/**
 * Façon de lancer les dés d'une sous-formule : `multiplier_des(2, x)` lance deux fois plus
 * de dés dans `x` (critique), `maximum_des(x)` donne à chaque dé sa valeur maximale.
 */
export interface ModeDes {
  multiplicateur: number;
  maximum: boolean;
}

export const MODE_DES_NORMAL: ModeDes = Object.freeze({ multiplicateur: 1, maximum: false });

export interface ContexteEvaluation {
  attribut(cle: string, entite?: string): Valeur;
  modificateur(cle: string, entite?: string): number;
  /**
   * `des` : mode de lancer en cours là où la variable est lue ; une variable qui porte une
   * formule de jet (dés d'une arme) l'applique à ses propres dés.
   */
  variable(nom: string, des?: ModeDes): Valeur;
  rang?(id: string): number;
  possede?(id: string): boolean;
  /** Règle optionnelle allumée pour la campagne (`option("encombrement")`). */
  option?(id: string): boolean;
  /** Implémentations des fonctions déclarées dans `EnvironnementTypes.fonctions`. */
  fonctions?: Record<string, (...args: Valeur[]) => Valeur>;
  aleatoire?: Generateur;
  /** Mode de lancer au départ de l'évaluation (défaut : normal). */
  modeDes?: ModeDes;
}

export interface De {
  valeur: number;
  /** Compté dans le total (faux pour un dé écarté par « garder »). */
  garde: boolean;
  /** Dé relancé par explosion. */
  explosion: boolean;
}

export interface JetDes {
  /** Position de la notation dans la formule. */
  position: number;
  faces: number;
  des: De[];
  total: number;
}

export interface ResultatEvaluation {
  valeur: Valeur;
  jets: JetDes[];
}

export class ErreurEvaluation extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(message);
    this.name = 'ErreurEvaluation';
  }
}

export function evaluer(noeud: Noeud, ctx: ContexteEvaluation): ResultatEvaluation {
  const jets: JetDes[] = [];
  let mode: ModeDes = ctx.modeDes ?? MODE_DES_NORMAL;

  const nombre = (n: Noeud): number => {
    const v = ev(n);
    if (typeof v !== 'number')
      throw new ErreurEvaluation(`Nombre attendu, ${typeof v} obtenu`, n.pos);
    return v;
  };
  const booleen = (n: Noeud): boolean => {
    const v = ev(n);
    if (typeof v !== 'boolean')
      throw new ErreurEvaluation(`Booléen attendu, ${typeof v} obtenu`, n.pos);
    return v;
  };
  const fini = (v: number, pos: number): number => {
    if (!Number.isFinite(v)) throw new ErreurEvaluation('Résultat non fini', pos);
    return v;
  };

  function ev(n: Noeud): Valeur {
    switch (n.t) {
      case 'nombre':
      case 'booleen':
      case 'texte':
        return n.v;
      case 'attribut':
        return ctx.attribut(n.cle, n.entite);
      case 'variable':
        return mode === MODE_DES_NORMAL ? ctx.variable(n.nom) : ctx.variable(n.nom, mode);
      case 'unaire':
        return n.op === '-' ? -nombre(n.arg) : !booleen(n.arg);
      case 'si':
        return booleen(n.condition) ? ev(n.alors) : ev(n.sinon);
      case 'binaire':
        return binaire(n);
      case 'des':
        return des(n);
      case 'appel':
        return appel(n);
    }
  }

  function binaire(n: Extract<Noeud, { t: 'binaire' }>): Valeur {
    switch (n.op) {
      // Évaluation paresseuse : la branche droite n'est pas lue (ni ses dés lancés) si inutile
      case 'et':
        return booleen(n.g) && booleen(n.d);
      case 'ou':
        return booleen(n.g) || booleen(n.d);
      case '==':
        return ev(n.g) === ev(n.d);
      case '!=':
        return ev(n.g) !== ev(n.d);
    }
    const g = nombre(n.g);
    const d = nombre(n.d);
    switch (n.op) {
      case '+':
        return fini(g + d, n.pos);
      case '-':
        return fini(g - d, n.pos);
      case '*':
        return fini(g * d, n.pos);
      case '/':
        if (d === 0) throw new ErreurEvaluation('Division par zéro', n.pos);
        return g / d;
      case '%':
        if (d === 0) throw new ErreurEvaluation('Modulo par zéro', n.pos);
        return ((g % d) + d) % d;
      case '<':
        return g < d;
      case '<=':
        return g <= d;
      case '>':
        return g > d;
      case '>=':
        return g >= d;
    }
  }

  /** Évalue `x` avec un autre mode de lancer (dés multipliés ou maximaux), puis le rétablit. */
  function avecMode(suivant: ModeDes, x: Noeud): number {
    const avant = mode;
    mode = suivant;
    try {
      return nombre(x);
    } finally {
      mode = avant;
    }
  }

  function appel(n: Extract<Noeud, { t: 'appel' }>): Valeur {
    const args = () => n.args.map(nombre);
    switch (n.fn) {
      case 'multiplier_des': {
        const k = nombre(n.args[0]!);
        if (!Number.isInteger(k) || k < 0)
          throw new ErreurEvaluation(`Multiplicateur de dés invalide : ${k}`, n.pos);
        return avecMode({ ...mode, multiplicateur: mode.multiplicateur * k }, n.args[1]!);
      }
      case 'maximum_des':
        return avecMode({ ...mode, maximum: true }, n.args[0]!);
      case 'mod': {
        const a = n.args[0] as Extract<Noeud, { t: 'attribut' }>;
        return ctx.modificateur(a.cle, a.entite);
      }
      case 'rang':
      case 'possede':
      case 'option':
        return appelPossessions(n);
      case 'valeur': {
        const cle = texteArgument(n);
        const v = ctx.attribut(cle);
        if (typeof v !== 'number') throw new ErreurEvaluation(`@${cle} n’est pas un nombre`, n.pos);
        return v;
      }
      case 'modificateur':
        return ctx.modificateur(texteArgument(n));
    }
    const math = MATHS[n.fn];
    if (math) return math(args());
    const f = ctx.fonctions?.[n.fn];
    if (!f) throw new ErreurEvaluation(`Fonction inconnue : ${n.fn}()`, n.pos);
    return f(...n.args.map(ev));
  }

  /** Unique argument texte d'un appel (`valeur("FOR")`). */
  function texteArgument(n: Extract<Noeud, { t: 'appel' }>): string {
    const v = ev(n.args[0]!);
    if (typeof v !== 'string') throw new ErreurEvaluation(`${n.fn}() attend un texte`, n.pos);
    return v;
  }

  /** `rang()`, `possede()`, `option()` : lus dans le contexte, s'il les fournit. */
  function appelPossessions(n: Extract<Noeud, { t: 'appel' }>): Valeur {
    const id = texteArgument(n);
    const f = { rang: ctx.rang, possede: ctx.possede, option: ctx.option }[n.fn as 'rang'];
    if (!f) throw new ErreurEvaluation(`${n.fn}() indisponible dans ce contexte`, n.pos);
    return f(id);
  }

  function des(n: Extract<Noeud, { t: 'des' }>): number {
    const g = ctx.aleatoire;
    if (!g && !mode.maximum) throw new ErreurEvaluation('Aucun générateur de dés fourni', n.pos);
    const nb = nombre(n.nombre) * mode.multiplicateur;
    const faces = nombre(n.faces);
    if (!Number.isInteger(nb) || nb < 0 || nb > LIMITES.desParJet) {
      throw new ErreurEvaluation(
        `Nombre de dés invalide : ${nb} (0 à ${LIMITES.desParJet})`,
        n.pos,
      );
    }
    if (!Number.isInteger(faces) || faces < 1 || faces > LIMITES.faces) {
      throw new ErreurEvaluation(`Nombre de faces invalide : ${faces}`, n.pos);
    }

    const tires: De[] = [];
    for (let i = 0; i < nb; i++)
      tires.push(...lancerDe(faces, n.explose, mode.maximum ? undefined : g));

    if (n.garder) {
      const k = nombre(n.garder.n);
      if (!Number.isInteger(k) || k < 0)
        throw new ErreurEvaluation(`Nombre de dés gardés invalide : ${k}`, n.pos);
      garderDes(tires, k, n.garder.sens);
    }

    const total = tires.reduce((s, d) => s + (d.garde ? d.valeur : 0), 0);
    jets.push({ position: n.pos, faces, des: tires, total });
    return total;
  }

  const valeur = ev(noeud);
  return { valeur, jets };
}

/** Fonctions mathématiques sur des nombres. */
const MATHS: Partial<Record<string, (a: number[]) => number>> = {
  floor: ([x]) => Math.floor(x!),
  ceil: ([x]) => Math.ceil(x!),
  round: ([x]) => Math.round(x!),
  abs: ([x]) => Math.abs(x!),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  clamp: ([x, bas, haut]) => Math.min(Math.max(x!, bas!), haut!),
};

/**
 * Un dé et ses explosions ; sans générateur (dés maximaux), il vaut ses faces sans exploser.
 * Un d1 explosif exploserait indéfiniment : l'explosion n'a de sens qu'à partir de 2 faces.
 */
function lancerDe(faces: number, explose: boolean, g: Generateur | undefined): De[] {
  let v = g ? g.entier(faces) : faces;
  const des: De[] = [{ valeur: v, garde: true, explosion: false }];
  if (!g) return des;
  for (let n = 0; explose && faces > 1 && v === faces && n < LIMITES.explosions; n++) {
    v = g.entier(faces);
    des.push({ valeur: v, garde: true, explosion: true });
  }
  return des;
}

/** Garde les `k` meilleurs (ou pires) dés ; à égalité, les premiers lancés. */
function garderDes(tires: De[], k: number, sens: 'haut' | 'bas'): void {
  const ordre = tires
    .map((d, i) => ({ v: d.valeur, i }))
    .sort((a, b) => (sens === 'haut' ? b.v - a.v : a.v - b.v) || a.i - b.i);
  const gardes = new Set(ordre.slice(0, k).map((o) => o.i));
  tires.forEach((d, i) => (d.garde = gardes.has(i)));
}
