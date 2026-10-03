/**
 * Analyseur des formules (descente récursive, sans dépendance).
 *
 *   expr        := ou
 *   ou          := et (('ou' | '||') et)*
 *   et          := comparaison (('et' | '&&') comparaison)*
 *   comparaison := somme (('<'|'<='|'>'|'>='|'=='|'!=') somme)?
 *   somme       := produit (('+'|'-') produit)*
 *   produit     := unaire (('*'|'/'|'%') unaire)*
 *   unaire      := ('-' | 'non' | '!') unaire | primaire
 *   primaire    := NOMBRE | DES | TEXTE | 'vrai' | 'faux' | @REF | IDENT | appel | '(' expr ')'
 *
 * Dés : `2d6`, `d20`, `4d6k3` (garder les 3 meilleurs), `2d20kl1` (le pire),
 * `1d6!` (explosif). Nombre de dés variable : `des(@niveau, 6)`.
 */
import { LIMITES, type Noeud, type OperateurBinaire } from './ast.js';

export interface ErreurFormule {
  message: string;
  /** Position (index de caractère) dans le texte de la formule. */
  position: number;
}

export type ResultatAnalyse = { ok: true; noeud: Noeud } | { ok: false; erreur: ErreurFormule };

/** Jeton du découpage d'une formule (positions : index de caractère dans le texte). */
export type JetonFormule =
  | { k: 'nombre'; v: number; pos: number }
  | {
      k: 'des';
      nombre: number;
      faces: number;
      garder?: { sens: 'haut' | 'bas'; n: number };
      explose: boolean;
      pos: number;
    }
  | { k: 'texte'; v: string; pos: number }
  | { k: 'ref'; cle: string; entite?: string; pos: number }
  | { k: 'ident'; v: string; pos: number }
  | { k: 'op'; v: string; pos: number }
  | { k: 'fin'; pos: number };

class Echec extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(message);
  }
}

const LETTRE = /[\p{L}_]/u;
const LETTRE_OU_CHIFFRE = /[\p{L}\p{N}_]/u;
const CHIFFRE = /[0-9]/;
const OPERATEURS = [
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '(',
  ')',
  ',',
  '!',
];

function lireIdent(s: string, i: number): number {
  while (i < s.length && LETTRE_OU_CHIFFRE.test(s[i]!)) i++;
  return i;
}

function lireEntier(s: string, i: number): number {
  while (i < s.length && CHIFFRE.test(s[i]!)) i++;
  return i;
}

/** Suffixes d'une notation de dés : `k3`, `kh3`, `kl1`, `!`. */
function lireSuffixesDes(s: string, i: number, jeton: Extract<JetonFormule, { k: 'des' }>): number {
  if (s[i] === 'k') {
    let j = i + 1;
    let sens: 'haut' | 'bas' = 'haut';
    if (s[j] === 'h' || s[j] === 'l') {
      sens = s[j] === 'l' ? 'bas' : 'haut';
      j++;
    }
    const fin = lireEntier(s, j);
    if (fin === j) throw new Echec('Nombre de dés à garder attendu après « k »', i);
    jeton.garder = { sens, n: Number(s.slice(j, fin)) };
    i = fin;
  }
  if (s[i] === '!' && s[i + 1] !== '=') {
    jeton.explose = true;
    i++;
  }
  if (i < s.length && LETTRE_OU_CHIFFRE.test(s[i]!))
    throw new Echec('Notation de dés invalide', jeton.pos);
  return i;
}

function decouper(s: string): JetonFormule[] {
  const jetons: JetonFormule[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) i++;
    else if (CHIFFRE.test(c) || (c === '.' && CHIFFRE.test(s[i + 1] ?? '')))
      i = lireNombre(s, i, jetons);
    else if (c === '"' || c === "'") i = lireTexte(s, i, jetons);
    else if (c === '@') i = lireRef(s, i, jetons);
    else if (LETTRE.test(c)) i = lireMot(s, i, jetons);
    else i = lireOperateur(s, i, jetons);
  }
  jetons.push({ k: 'fin', pos: s.length });
  return jetons;
}

/** Nombre (`12`, `1.5`) ou notation de dés (`2d6`, `4d6k3`) ; renvoie la position suivante. */
function lireNombre(s: string, i: number, jetons: JetonFormule[]): number {
  let fin = lireEntier(s, i);
  if (s[fin] === 'd' && CHIFFRE.test(s[fin + 1] ?? '')) {
    const finFaces = lireEntier(s, fin + 1);
    const jeton: Extract<JetonFormule, { k: 'des' }> = {
      k: 'des',
      nombre: Number(s.slice(i, fin)),
      faces: Number(s.slice(fin + 1, finFaces)),
      explose: false,
      pos: i,
    };
    jetons.push(jeton);
    return lireSuffixesDes(s, finFaces, jeton);
  }
  if (s[fin] === '.') fin = lireEntier(s, fin + 1);
  if (fin < s.length && LETTRE.test(s[fin]!)) throw new Echec('Nombre mal formé', i);
  jetons.push({ k: 'nombre', v: Number(s.slice(i, fin)), pos: i });
  return fin;
}

/** Texte entre guillemets (simples ou doubles), avec échappement `\` ; position suivante. */
function lireTexte(s: string, i: number, jetons: JetonFormule[]): number {
  const c = s[i];
  let fin = i + 1;
  let v = '';
  while (fin < s.length && s[fin] !== c) {
    if (s[fin] === '\\' && fin + 1 < s.length) fin++;
    v += s[fin];
    fin++;
  }
  if (fin >= s.length) throw new Echec('Texte non terminé', i);
  jetons.push({ k: 'texte', v, pos: i });
  return fin + 1;
}

/** Référence `@cle` ou `@entite.cle` (clé à plusieurs niveaux : `@combat.cible.aAgi`). */
function lireRef(s: string, i: number, jetons: JetonFormule[]): number {
  if (!LETTRE.test(s[i + 1] ?? '')) throw new Echec('Nom d’attribut attendu après « @ »', i);
  const fin = lireIdent(s, i + 1);
  const premier = s.slice(i + 1, fin);
  if (s[fin] !== '.' || !LETTRE.test(s[fin + 1] ?? '')) {
    jetons.push({ k: 'ref', cle: premier, pos: i });
    return fin;
  }
  let fin2 = lireIdent(s, fin + 1);
  // Clé à plusieurs niveaux (`@combat.cible.aAgi`) : elle garde ses points
  while (s[fin2] === '.' && LETTRE.test(s[fin2 + 1] ?? '')) fin2 = lireIdent(s, fin2 + 1);
  jetons.push({ k: 'ref', entite: premier, cle: s.slice(fin + 1, fin2), pos: i });
  return fin2;
}

/** Identifiant (chemins pointés : `arme.degats`) ou dé unique (`d20`). */
function lireMot(s: string, i: number, jetons: JetonFormule[]): number {
  if (s[i] === 'd' && CHIFFRE.test(s[i + 1] ?? '')) {
    const finFaces = lireEntier(s, i + 1);
    if (finFaces >= s.length || !LETTRE_OU_CHIFFRE.test(s[finFaces]!) || s[finFaces] === 'k') {
      const jeton: Extract<JetonFormule, { k: 'des' }> = {
        k: 'des',
        nombre: 1,
        faces: Number(s.slice(i + 1, finFaces)),
        explose: false,
        pos: i,
      };
      jetons.push(jeton);
      return lireSuffixesDes(s, finFaces, jeton);
    }
  }
  let fin = lireIdent(s, i);
  while (s[fin] === '.' && LETTRE.test(s[fin + 1] ?? '')) fin = lireIdent(s, fin + 1);
  jetons.push({ k: 'ident', v: s.slice(i, fin), pos: i });
  return fin;
}

function lireOperateur(s: string, i: number, jetons: JetonFormule[]): number {
  const op = OPERATEURS.find((o) => s.startsWith(o, i));
  if (!op) throw new Echec(`Caractère inattendu « ${s[i]} »`, i);
  jetons.push({ k: 'op', v: op, pos: i });
  return i + op.length;
}

const COMPARAISONS = new Set(['<', '<=', '>', '>=', '==', '!=']);

class Analyseur {
  private i = 0;
  private profondeur = 0;
  constructor(private readonly jetons: JetonFormule[]) {}

  private get courant(): JetonFormule {
    return this.jetons[this.i]!;
  }

  private estOp(v: string): boolean {
    const j = this.courant;
    return j.k === 'op' && j.v === v;
  }

  private estMot(v: string): boolean {
    const j = this.courant;
    return j.k === 'ident' && j.v === v;
  }

  private attendre(v: string): void {
    if (!this.estOp(v)) throw new Echec(`« ${v} » attendu`, this.courant.pos);
    this.i++;
  }

  private descendre<T>(f: () => T): T {
    if (++this.profondeur > LIMITES.profondeur)
      throw new Echec('Formule trop imbriquée', this.courant.pos);
    try {
      return f();
    } finally {
      this.profondeur--;
    }
  }

  analyser(): Noeud {
    const n = this.expr();
    if (this.courant.k !== 'fin') throw new Echec('Fin de formule attendue', this.courant.pos);
    return n;
  }

  private expr(): Noeud {
    return this.descendre(() => this.ou());
  }

  private ou(): Noeud {
    let g = this.et();
    while (this.estMot('ou') || this.estOp('||')) {
      const pos = this.courant.pos;
      this.i++;
      g = { t: 'binaire', op: 'ou', g, d: this.et(), pos };
    }
    return g;
  }

  private et(): Noeud {
    let g = this.comparaison();
    while (this.estMot('et') || this.estOp('&&')) {
      const pos = this.courant.pos;
      this.i++;
      g = { t: 'binaire', op: 'et', g, d: this.comparaison(), pos };
    }
    return g;
  }

  private comparaison(): Noeud {
    const g = this.somme();
    const j = this.courant;
    if (j.k === 'op' && COMPARAISONS.has(j.v)) {
      this.i++;
      const n: Noeud = {
        t: 'binaire',
        op: j.v as OperateurBinaire,
        g,
        d: this.somme(),
        pos: j.pos,
      };
      const suivant = this.courant;
      if (suivant.k === 'op' && COMPARAISONS.has(suivant.v)) {
        throw new Echec('Comparaisons enchaînées : utilisez « et »', suivant.pos);
      }
      return n;
    }
    return g;
  }

  private somme(): Noeud {
    let g = this.produit();
    while (this.estOp('+') || this.estOp('-')) {
      const j = this.courant as Extract<JetonFormule, { k: 'op' }>;
      this.i++;
      g = { t: 'binaire', op: j.v as '+' | '-', g, d: this.produit(), pos: j.pos };
    }
    return g;
  }

  private produit(): Noeud {
    let g = this.unaire();
    while (this.estOp('*') || this.estOp('/') || this.estOp('%')) {
      const j = this.courant as Extract<JetonFormule, { k: 'op' }>;
      this.i++;
      g = { t: 'binaire', op: j.v as '*' | '/' | '%', g, d: this.unaire(), pos: j.pos };
    }
    return g;
  }

  private unaire(): Noeud {
    const pos = this.courant.pos;
    if (this.estOp('-')) {
      this.i++;
      return this.descendre(() => ({ t: 'unaire', op: '-', arg: this.unaire(), pos }));
    }
    if (this.estOp('+')) {
      this.i++;
      return this.descendre(() => this.unaire());
    }
    if (this.estMot('non') || this.estOp('!')) {
      this.i++;
      return this.descendre(() => ({ t: 'unaire', op: 'non', arg: this.unaire(), pos }));
    }
    return this.primaire();
  }

  private primaire(): Noeud {
    const j = this.courant;
    switch (j.k) {
      case 'nombre':
        this.i++;
        return { t: 'nombre', v: j.v, pos: j.pos };
      case 'texte':
        this.i++;
        return { t: 'texte', v: j.v, pos: j.pos };
      case 'des': {
        this.i++;
        const n: Noeud = {
          t: 'des',
          nombre: { t: 'nombre', v: j.nombre, pos: j.pos },
          faces: { t: 'nombre', v: j.faces, pos: j.pos },
          explose: j.explose,
          pos: j.pos,
        };
        if (j.garder)
          n.garder = { sens: j.garder.sens, n: { t: 'nombre', v: j.garder.n, pos: j.pos } };
        return n;
      }
      case 'ref':
        this.i++;
        return j.entite
          ? { t: 'attribut', cle: j.cle, entite: j.entite, pos: j.pos }
          : { t: 'attribut', cle: j.cle, pos: j.pos };
      case 'ident': {
        this.i++;
        if (j.v === 'vrai' || j.v === 'faux')
          return { t: 'booleen', v: j.v === 'vrai', pos: j.pos };
        if (['et', 'ou', 'non'].includes(j.v)) throw new Echec(`« ${j.v} » inattendu`, j.pos);
        if (this.estOp('(')) return this.appel(j.v, j.pos);
        return { t: 'variable', nom: j.v, pos: j.pos };
      }
      case 'op':
        if (j.v === '(') {
          this.i++;
          const n = this.expr();
          this.attendre(')');
          return n;
        }
        throw new Echec(`« ${j.v} » inattendu`, j.pos);
      case 'fin':
        throw new Echec('Formule incomplète', j.pos);
    }
  }

  private appel(fn: string, pos: number): Noeud {
    this.attendre('(');
    const args: Noeud[] = [];
    if (!this.estOp(')')) {
      args.push(this.expr());
      while (this.estOp(',')) {
        this.i++;
        args.push(this.expr());
      }
    }
    this.attendre(')');

    // Formes spéciales, transformées en nœuds dédiés
    if (fn === 'si') {
      if (args.length !== 3) throw new Echec('si(condition, alors, sinon) attend 3 arguments', pos);
      return { t: 'si', condition: args[0]!, alors: args[1]!, sinon: args[2]!, pos };
    }
    if (fn === 'des' || fn === 'des_explosifs') return noeudDes(fn, args, pos);
    return { t: 'appel', fn, args, pos };
  }
}

/** `des(nombre, faces)` ou `des(nombre, faces, garder, "haut"|"bas")`, explosifs ou non. */
function noeudDes(fn: string, args: Noeud[], pos: number): Noeud {
  if (args.length < 2 || args.length > 4) {
    throw new Echec(`${fn}(nombre, faces[, garder[, "haut"|"bas"]]) attend 2 à 4 arguments`, pos);
  }
  const n: Noeud = {
    t: 'des',
    nombre: args[0]!,
    faces: args[1]!,
    explose: fn === 'des_explosifs',
    pos,
  };
  if (!args[2]) return n;
  const sens = args[3];
  if (sens && (sens.t !== 'texte' || (sens.v !== 'haut' && sens.v !== 'bas'))) {
    throw new Echec('Le sens de garde est "haut" ou "bas"', sens.pos);
  }
  n.garder = { sens: sens?.t === 'texte' && sens.v === 'bas' ? 'bas' : 'haut', n: args[2] };
  return n;
}

export function analyser(texte: string): ResultatAnalyse {
  if (texte.length > LIMITES.longueur) {
    return {
      ok: false,
      erreur: { message: `Formule trop longue (${LIMITES.longueur} caractères max.)`, position: 0 },
    };
  }
  try {
    return { ok: true, noeud: new Analyseur(decouper(texte)).analyser() };
  } catch (e) {
    if (e instanceof Echec)
      return { ok: false, erreur: { message: e.message, position: e.position } };
    throw e;
  }
}

/**
 * Jetons d'une formule, sans l'analyser (le dernier est `fin`). Sert aux
 * réécritures qui doivent respecter le découpage du langage : `CONTACT` n'est
 * pas `CON`, `d20` est un dé et pas un identifiant.
 */
export function decouperFormule(
  texte: string,
): { ok: true; jetons: JetonFormule[] } | { ok: false; erreur: ErreurFormule } {
  try {
    return { ok: true, jetons: decouper(texte) };
  } catch (e) {
    if (e instanceof Echec)
      return { ok: false, erreur: { message: e.message, position: e.position } };
    throw e;
  }
}
