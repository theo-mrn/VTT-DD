/**
 * Évaluation d'une formule vérifiée. Pure : tout ce qu'elle lit vient du
 * contexte, et les dés passent par le générateur fourni.
 */
import type { Generateur } from './aleatoire.js';
import { LIMITES, type Noeud, type Valeur } from './ast.js';

export interface ContexteEvaluation {
  attribut(cle: string, entite?: string): Valeur;
  modificateur(cle: string, entite?: string): number;
  variable(nom: string): Valeur;
  rang?(id: string): number;
  possede?(id: string): boolean;
  /** Implémentations des fonctions déclarées dans `EnvironnementTypes.fonctions`. */
  fonctions?: Record<string, (...args: Valeur[]) => Valeur>;
  aleatoire?: Generateur;
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
        return ctx.variable(n.nom);
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

  function appel(n: Extract<Noeud, { t: 'appel' }>): Valeur {
    const args = () => n.args.map(nombre);
    switch (n.fn) {
      case 'floor':
        return Math.floor(nombre(n.args[0]!));
      case 'ceil':
        return Math.ceil(nombre(n.args[0]!));
      case 'round':
        return Math.round(nombre(n.args[0]!));
      case 'abs':
        return Math.abs(nombre(n.args[0]!));
      case 'min':
        return Math.min(...args());
      case 'max':
        return Math.max(...args());
      case 'clamp': {
        const [x, bas, haut] = args() as [number, number, number];
        return Math.min(Math.max(x, bas), haut);
      }
      case 'mod': {
        const a = n.args[0] as Extract<Noeud, { t: 'attribut' }>;
        return ctx.modificateur(a.cle, a.entite);
      }
      case 'rang':
      case 'possede': {
        const id = ev(n.args[0]!);
        if (typeof id !== 'string') throw new ErreurEvaluation(`${n.fn}() attend un texte`, n.pos);
        const f = n.fn === 'rang' ? ctx.rang : ctx.possede;
        if (!f) throw new ErreurEvaluation(`${n.fn}() indisponible dans ce contexte`, n.pos);
        return f(id);
      }
      case 'valeur': {
        const cle = ev(n.args[0]!);
        if (typeof cle !== 'string') throw new ErreurEvaluation('valeur() attend un texte', n.pos);
        const v = ctx.attribut(cle);
        if (typeof v !== 'number') throw new ErreurEvaluation(`@${cle} n’est pas un nombre`, n.pos);
        return v;
      }
      case 'modificateur': {
        const cle = ev(n.args[0]!);
        if (typeof cle !== 'string')
          throw new ErreurEvaluation('modificateur() attend un texte', n.pos);
        return ctx.modificateur(cle);
      }
    }
    const f = ctx.fonctions?.[n.fn];
    if (!f) throw new ErreurEvaluation(`Fonction inconnue : ${n.fn}()`, n.pos);
    return f(...n.args.map(ev));
  }

  function des(n: Extract<Noeud, { t: 'des' }>): number {
    const g = ctx.aleatoire;
    if (!g) throw new ErreurEvaluation('Aucun générateur de dés fourni', n.pos);
    const nb = nombre(n.nombre);
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
    for (let i = 0; i < nb; i++) {
      let v = g.entier(faces);
      tires.push({ valeur: v, garde: true, explosion: false });
      // Un d1 explosif exploserait indéfiniment : l'explosion n'a de sens qu'à partir de 2 faces
      let explosions = 0;
      while (n.explose && faces > 1 && v === faces && explosions < LIMITES.explosions) {
        v = g.entier(faces);
        tires.push({ valeur: v, garde: true, explosion: true });
        explosions++;
      }
    }

    if (n.garder) {
      const k = nombre(n.garder.n);
      if (!Number.isInteger(k) || k < 0)
        throw new ErreurEvaluation(`Nombre de dés gardés invalide : ${k}`, n.pos);
      const ordre = tires
        .map((d, i) => ({ v: d.valeur, i }))
        .sort((a, b) => (n.garder!.sens === 'haut' ? b.v - a.v : a.v - b.v) || a.i - b.i);
      const gardes = new Set(ordre.slice(0, k).map((o) => o.i));
      tires.forEach((d, i) => (d.garde = gardes.has(i)));
    }

    const total = tires.reduce((s, d) => s + (d.garde ? d.valeur : 0), 0);
    jets.push({ position: n.pos, faces, des: tires, total });
    return total;
  }

  const valeur = ev(noeud);
  return { valeur, jets };
}
