/**
 * Formules du lanceur de dés écrites comme dans l'ancienne app : `1d20+CON`,
 * `1d6-CON+8`, `2d6+INIT`. Un identifiant nu qui est une clé d'attribut devient
 * le terme que le système déclare pour les jets (`jet.apport`) :
 *
 *   - apport `modificateur` : `CON` → `mod(@CON)` ;
 *   - apport `valeur`       : `INIT` → `@INIT` ;
 *   - apport en formule     : `Defense` → `(mod(@DEX) + @niveau)` ;
 *   - attribut sans `jet`   : sa valeur, `@CLE`.
 *
 * Les formes explicites (`@CON`, `mod(@CON)`), les dés (`1d20`, `4d6k3`), les
 * appels de fonction et les mots du langage (`vrai`, `et`…) ne sont pas
 * touchés. La réécriture suit le découpage du langage : `CONTACT` n'est pas
 * `CON`, `d20` est un dé. Fonctions pures : aucune clé de jeu n'est connue ici.
 */
import type { SystemeCharge } from '../chargement/index.js';
import {
  decouperFormule,
  ecrireDes,
  notationDes,
  type ErreurFormule,
  type JetonFormule,
  type Noeud,
  type Valeur,
} from '../formules/index.js';
import { declarationsJetables } from './jetables.js';

export type ResultatFormuleJet =
  { ok: true; formule: string } | { ok: false; erreur: ErreurFormule };

export interface OptionsFormuleJet {
  /**
   * Variables de la formule, laissées telles quelles : champs d'un objet (`source.nbDes`),
   * `rang`, `actif`, `quantite`. Elles l'emportent sur une clé d'attribut de même nom.
   */
  variables?: Iterable<string>;
}

const MOTS = new Set(['vrai', 'faux', 'et', 'ou', 'non']);

/**
 * Réécrit les clés nues d'une formule de jet en termes du moteur, pour un type
 * d'entité du système. La casse est tolérée quand elle ne prête pas à
 * confusion (`con` → `CON`). Un identifiant qui n'est pas une clé d'attribut
 * est une erreur, avec sa position dans le texte.
 */
export function normaliserFormuleJet(
  systeme: SystemeCharge,
  entite: string,
  formule: string,
  options: OptionsFormuleJet = {},
): ResultatFormuleJet {
  const d = decouperFormule(formule);
  if (!d.ok) return d;
  const attributs = systeme.entites.get(entite)?.attributs;
  const liste = attributs ? [...attributs.values()] : [];
  const variables = new Set(options.variables ?? []);
  const termes = new Map(
    declarationsJetables(systeme, entite, { mj: true }).map((x) => [x.cle, x.terme]),
  );

  // Clé exacte, puis abréviation exacte (VIG), puis l'une ou l'autre sans casse, si unique
  const resoudre = (nom: string): string | undefined => {
    if (attributs?.has(nom)) return nom;
    const abreges = liste.filter((a) => a.abrege === nom);
    if (abreges.length === 1) return abreges[0]!.cle;
    const bas = nom.toLowerCase();
    const proches = new Set(
      liste
        .filter((a) => a.cle.toLowerCase() === bas || a.abrege?.toLowerCase() === bas)
        .map((a) => a.cle),
    );
    return proches.size === 1 ? [...proches][0] : undefined;
  };

  const remplacements: { debut: number; fin: number; texte: string }[] = [];
  const { jetons } = d;
  for (let i = 0; i < jetons.length; i++) {
    const j = cleNue(jetons, i, variables);
    if (!j) continue;
    const cle = j.v.includes('.') ? undefined : resoudre(j.v);
    if (!cle) {
      const message = attributs
        ? `« ${j.v} » n’est pas un attribut du personnage`
        : `Type d’entité inconnu : ${entite}`;
      return { ok: false, erreur: { message, position: j.pos } };
    }
    // Argument de mod(…) : la valeur de l'attribut (mod(CON) → mod(@CON))
    const dansMod = argumentDeMod(jetons, i);
    remplacements.push({
      debut: j.pos,
      fin: j.pos + j.v.length,
      texte: dansMod ? `@${cle}` : (termes.get(cle) ?? `@${cle}`),
    });
  }

  let sortie = formule;
  for (const r of remplacements.toReversed())
    sortie = sortie.slice(0, r.debut) + r.texte + sortie.slice(r.fin);
  return { ok: true, formule: sortie };
}

/** Identifiant à réécrire : ni mot réservé, ni variable, ni nom de fonction appelée. */
function cleNue(
  jetons: readonly JetonFormule[],
  i: number,
  variables: ReadonlySet<string>,
): Extract<JetonFormule, { k: 'ident' }> | null {
  const j = jetons[i]!;
  if (j.k !== 'ident' || MOTS.has(j.v) || variables.has(j.v)) return null;
  const suivant = jetons[i + 1];
  // Appel : mod(…), max(…)
  return suivant?.k === 'op' && suivant.v === '(' ? null : j;
}

/** Le jeton `i` est l'unique argument d'un `mod(…)`. */
function argumentDeMod(jetons: readonly JetonFormule[], i: number): boolean {
  const [avant, ouvrante, fermante] = [jetons[i - 2], jetons[i - 1], jetons[i + 1]];
  if (avant?.k !== 'ident' || avant.v !== 'mod') return false;
  return ouvrante?.k === 'op' && ouvrante.v === '(' && fermante?.k === 'op' && fermante.v === ')';
}

/** Référence à un attribut dans une formule : `@CLE` ou `mod(@CLE)`, avec son étendue. */
export interface TermeAttribut {
  debut: number;
  /** Position juste après le terme. */
  fin: number;
  cle: string;
  /** `mod(@CLE)` : le modificateur de l'attribut ; sinon sa valeur. */
  modificateur: boolean;
}

/**
 * Termes d'attribut de l'entité courante (`@CLE`, `mod(@CLE)`) d'une formule,
 * dans l'ordre : de quoi afficher le détail d'un jet avec les valeurs de la
 * fiche (`[12] + 2`). Formule illisible : aucun terme.
 */
export function termesAttributs(formule: string): TermeAttribut[] {
  const d = decouperFormule(formule);
  if (!d.ok) return [];
  const { jetons } = d;
  const sortie: TermeAttribut[] = [];
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i]!;
    const [ouvrante, ref, fermante] = [jetons[i + 1], jetons[i + 2], jetons[i + 3]];
    if (
      j.k === 'ident' &&
      j.v === 'mod' &&
      ouvrante?.k === 'op' &&
      ouvrante.v === '(' &&
      ref?.k === 'ref' &&
      !ref.entite &&
      fermante?.k === 'op' &&
      fermante.v === ')'
    ) {
      sortie.push({ debut: j.pos, fin: fermante.pos + 1, cle: ref.cle, modificateur: true });
      i += 3;
    } else if (j.k === 'ref' && !j.entite) {
      sortie.push({ debut: j.pos, fin: j.pos + 1 + j.cle.length, cle: j.cle, modificateur: false });
    }
  }
  return sortie;
}

// ─── Formule lisible ──────────────────────────────────────────────────────────

const PRIORITES: Record<string, number> = {
  ou: 1,
  et: 2,
  '==': 3,
  '!=': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
};
const PRIORITE_UNAIRE = 6;
const PRIORITE_ATOME = 7;

function feuille(v: Valeur, pos: number): Noeud {
  if (typeof v === 'number') return { t: 'nombre', v, pos };
  if (typeof v === 'boolean') return { t: 'booleen', v, pos };
  return { t: 'texte', v, pos };
}

/** Remplace les variables connues par leur valeur et calcule ce qui est constant. */
function plier(n: Noeud, variable: (nom: string) => Valeur | undefined): Noeud {
  const p = (x: Noeud) => plier(x, variable);
  switch (n.t) {
    case 'variable': {
      const v = variable(n.nom);
      return v === undefined ? n : feuille(v, n.pos);
    }
    case 'des':
      return {
        ...n,
        nombre: p(n.nombre),
        faces: p(n.faces),
        ...(n.garder ? { garder: { ...n.garder, n: p(n.garder.n) } } : {}),
      };
    case 'appel':
      return { ...n, args: n.args.map(p) };
    case 'unaire':
      return plierUnaire(n, p(n.arg));
    case 'si': {
      const condition = p(n.condition);
      if (condition.t === 'booleen') return p(condition.v ? n.alors : n.sinon);
      return { ...n, condition, alors: p(n.alors), sinon: p(n.sinon) };
    }
    case 'binaire':
      return plierBinaire(n, p(n.g), p(n.d));
    default:
      return n;
  }
}

/** Négation d'une constante calculée ; sinon le nœud avec son argument plié. */
function plierUnaire(n: Extract<Noeud, { t: 'unaire' }>, arg: Noeud): Noeud {
  if (n.op === '-' && arg.t === 'nombre') return { t: 'nombre', v: -arg.v, pos: n.pos };
  if (n.op === 'non' && arg.t === 'booleen') return { t: 'booleen', v: !arg.v, pos: n.pos };
  return { ...n, arg };
}

/** Opération entre constantes calculée ; opérations neutres retirées. */
function plierBinaire(n: Extract<Noeud, { t: 'binaire' }>, g: Noeud, d: Noeud): Noeud {
  if (g.t === 'nombre' && d.t === 'nombre') {
    const r = calculer(n.op, g.v, d.v);
    if (r !== undefined) return feuille(r, n.pos);
  }
  // « x + 0 », « x − 0 », « 0 + x », « x × 1 » : sans effet
  const dNombre = d.t === 'nombre' ? d.v : undefined;
  if ((n.op === '+' || n.op === '-') && dNombre === 0) return g;
  if (n.op === '+' && g.t === 'nombre' && g.v === 0) return d;
  if ((n.op === '*' || n.op === '/') && dNombre === 1) return g;
  return { ...n, g, d };
}

function calculer(op: string, a: number, b: number): Valeur | undefined {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? undefined : a / b;
    case '%':
      return b === 0 ? undefined : a % b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    default:
      return undefined;
  }
}

/**
 * Formule telle qu'on l'écrit au lanceur : variables de l'objet remplacées par leur valeur
 * (`des(source.nbDes, source.faces)` → `1d8`), attributs en clés nues quand la clé nue les
 * redonne (`mod(@CON)` → `CON` si CON s'ajoute par son modificateur, `@INIT` → `INIT` s'il
 * s'ajoute par sa valeur), sinon sous leur forme explicite. Relue par `normaliserFormuleJet`,
 * elle redonne la même formule (aux constantes calculées près).
 */
export function formuleLisible(
  systeme: SystemeCharge,
  entite: string,
  noeud: Noeud,
  variable: (nom: string) => Valeur | undefined = () => undefined,
): string {
  const attributs = systeme.entites.get(entite)?.attributs;
  const termes = new Map(
    declarationsJetables(systeme, entite, { mj: true }).map((x) => [x.cle, x.terme]),
  );
  const nue = (cle: string, terme: string) =>
    attributs?.has(cle) === true && (termes.get(cle) ?? `@${cle}`) === terme;
  const priorite = (n: Noeud) => {
    if (n.t === 'binaire') return PRIORITES[n.op] ?? 0;
    return n.t === 'unaire' || (n.t === 'nombre' && n.v < 0) ? PRIORITE_UNAIRE : PRIORITE_ATOME;
  };
  const nombre = (v: number) => String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);

  const ecrire = (n: Noeud): string => {
    switch (n.t) {
      case 'nombre':
        return nombre(n.v);
      case 'booleen':
        return n.v ? 'vrai' : 'faux';
      case 'texte':
        return JSON.stringify(n.v);
      case 'attribut':
        if (n.entite) return `@${n.entite}.${n.cle}`;
        return nue(n.cle, `@${n.cle}`) ? n.cle : `@${n.cle}`;
      case 'variable':
        return n.nom;
      case 'appel':
        return ecrireAppel(n);
      case 'unaire': {
        const arg = entourer(n.arg, PRIORITE_UNAIRE, false);
        return n.op === '-' ? `-${arg}` : `non ${arg}`;
      }
      case 'si':
        return `si(${ecrire(n.condition)}, ${ecrire(n.alors)}, ${ecrire(n.sinon)})`;
      case 'des':
        return notationDes(n, nombre) ?? ecrireDes(n, ecrire);
      case 'binaire':
        return ecrireBinaire(n);
    }
  };
  /** `mod(@CON)` s'écrit `CON` quand la clé nue redonne le modificateur. */
  const ecrireAppel = (n: Extract<Noeud, { t: 'appel' }>): string => {
    const [a] = n.args;
    const modNu = n.fn === 'mod' && n.args.length === 1 && a?.t === 'attribut' && !a.entite;
    if (modNu && nue(a.cle, `mod(@${a.cle})`)) return a.cle;
    return `${n.fn}(${n.args.map(ecrire).join(', ')})`;
  };
  const ecrireBinaire = (n: Extract<Noeud, { t: 'binaire' }>): string => {
    const p = PRIORITES[n.op] ?? 0;
    const g = entourer(n.g, p, false);
    // « x + −2 » s'écrit « x-2 », « x − −2 » s'écrit « x+2 »
    if ((n.op === '+' || n.op === '-') && n.d.t === 'nombre' && n.d.v < 0)
      return `${g}${n.op === '+' ? '-' : '+'}${nombre(-n.d.v)}`;
    const d = entourer(n.d, p, n.op !== '+' && n.op !== '*');
    const compact = p >= PRIORITES['+']!;
    return compact ? `${g}${n.op}${d}` : `${g} ${n.op} ${d}`;
  };
  const entourer = (n: Noeud, p: number, strict: boolean) => {
    const q = priorite(n);
    return q < p || (strict && q === p) ? `(${ecrire(n)})` : ecrire(n);
  };
  return ecrire(plier(noeud, variable));
}
