/**
 * Vérification statique d'une formule : types, références et fonctions.
 * Toutes les erreurs sont collectées (pas seulement la première) pour que
 * l'éditeur du MJ puisse les afficher d'un coup.
 */
import { analyser, type ErreurFormule } from './analyseur.js';
import type { Noeud, TypeValeur } from './ast.js';

export interface InfoAttribut {
  type: TypeValeur;
  /** L'attribut a une formule de modificateur (utilisable avec `mod(@X)`). */
  modificateur: boolean;
}

export interface SignatureFonction {
  args: TypeValeur[];
  /** Le dernier type d'argument peut se répéter. */
  variadique?: boolean;
  retour: TypeValeur;
}

export interface EnvironnementTypes {
  /** Attribut de l'entité courante (`entite` absent) ou d'une entité nommée (`@cible.X`). */
  attribut(cle: string, entite?: string): InfoAttribut | undefined;
  variable(nom: string): TypeValeur | undefined;
  /** Entrée de catalogue connue (pour `rang("id")` et `possede("id")`). */
  entree?(id: string): boolean;
  /** Fonctions propres au contexte, implémentées par le contexte d'évaluation. */
  fonctions?: Record<string, SignatureFonction>;
  /** Les dés sont-ils permis ? (non pour un attribut dérivé, oui pour un jet) */
  des: boolean;
  /** `valeur(texte)` (attribut désigné dynamiquement) est-il permis ? */
  dynamique?: boolean;
}

export interface FormuleVerifiee {
  texte: string;
  noeud: Noeud;
  type: TypeValeur;
  /** Attributs de l'entité courante lus par la formule (pour le graphe de dépendances). */
  dependances: Set<string>;
  /** Attributs lus sur d'autres entités, par entité (`cible` → {ENC}). */
  dependancesExternes: Map<string, Set<string>>;
  /** Entrées de catalogue lues par `rang`/`possede`. */
  entrees: Set<string>;
  /** La formule lance des dés. */
  aleatoire: boolean;
  /** La formule lit un attribut désigné à l'exécution (`valeur(...)`). */
  dynamique: boolean;
}

export type ResultatVerification =
  { ok: true; formule: FormuleVerifiee } | { ok: false; erreurs: ErreurFormule[] };

const NOMBRE_VERS_NOMBRE: SignatureFonction = { args: ['nombre'], retour: 'nombre' };

export const FONCTIONS: Record<string, SignatureFonction> = {
  floor: NOMBRE_VERS_NOMBRE,
  ceil: NOMBRE_VERS_NOMBRE,
  round: NOMBRE_VERS_NOMBRE,
  abs: NOMBRE_VERS_NOMBRE,
  min: { args: ['nombre'], variadique: true, retour: 'nombre' },
  max: { args: ['nombre'], variadique: true, retour: 'nombre' },
  clamp: { args: ['nombre', 'nombre', 'nombre'], retour: 'nombre' },
};

const NOMS_RESERVES = new Set([
  'si',
  'des',
  'des_explosifs',
  'mod',
  'rang',
  'possede',
  'valeur',
  'modificateur',
  ...Object.keys(FONCTIONS),
]);

export function nomReserve(nom: string): boolean {
  return (
    NOMS_RESERVES.has(nom) ||
    nom === 'vrai' ||
    nom === 'faux' ||
    nom === 'et' ||
    nom === 'ou' ||
    nom === 'non'
  );
}

export function verifier(
  texte: string,
  noeud: Noeud,
  env: EnvironnementTypes,
): ResultatVerification {
  const erreurs: ErreurFormule[] = [];
  const dependances = new Set<string>();
  const dependancesExternes = new Map<string, Set<string>>();
  const entrees = new Set<string>();
  let aleatoire = false;
  let dynamique = false;

  const erreur = (message: string, position: number) => erreurs.push({ message, position });

  const noterAttribut = (cle: string, entite: string | undefined) => {
    if (!entite) return dependances.add(cle);
    const s = dependancesExternes.get(entite) ?? new Set<string>();
    s.add(cle);
    dependancesExternes.set(entite, s);
  };

  const attendre = (n: Noeud, type: TypeValeur, quoi: string): void => {
    const t = typer(n);
    if (t && t !== type) erreur(`${quoi} : ${type} attendu, ${t} obtenu`, n.pos);
  };

  /** Renvoie le type du nœud, ou `null` si une erreur empêche de le connaître. */
  function typer(n: Noeud): TypeValeur | null {
    switch (n.t) {
      case 'nombre':
        return 'nombre';
      case 'booleen':
        return 'booleen';
      case 'texte':
        return 'texte';
      case 'attribut': {
        const info = env.attribut(n.cle, n.entite);
        if (!info) {
          erreur(`Attribut inconnu : @${n.entite ? `${n.entite}.` : ''}${n.cle}`, n.pos);
          return null;
        }
        noterAttribut(n.cle, n.entite);
        return info.type;
      }
      case 'variable': {
        const t = env.variable(n.nom);
        if (!t) erreur(`Variable inconnue : ${n.nom}`, n.pos);
        return t ?? null;
      }
      case 'unaire':
        if (n.op === '-') {
          attendre(n.arg, 'nombre', 'Négation');
          return 'nombre';
        }
        attendre(n.arg, 'booleen', '« non »');
        return 'booleen';
      case 'binaire': {
        if (n.op === 'et' || n.op === 'ou') {
          attendre(n.g, 'booleen', `« ${n.op} »`);
          attendre(n.d, 'booleen', `« ${n.op} »`);
          return 'booleen';
        }
        if (n.op === '==' || n.op === '!=') {
          const g = typer(n.g);
          const d = typer(n.d);
          if (g && d && g !== d) erreur(`Comparaison entre ${g} et ${d}`, n.pos);
          return 'booleen';
        }
        attendre(n.g, 'nombre', `« ${n.op} »`);
        attendre(n.d, 'nombre', `« ${n.op} »`);
        return ['<', '<=', '>', '>='].includes(n.op) ? 'booleen' : 'nombre';
      }
      case 'si': {
        attendre(n.condition, 'booleen', 'Condition de si()');
        const a = typer(n.alors);
        const s = typer(n.sinon);
        if (a && s && a !== s)
          erreur(`si() : les deux branches doivent être du même type (${a} / ${s})`, n.pos);
        return a ?? s;
      }
      case 'des':
        if (!env.des) erreur('Les dés ne sont pas permis ici', n.pos);
        aleatoire = true;
        attendre(n.nombre, 'nombre', 'Nombre de dés');
        attendre(n.faces, 'nombre', 'Faces');
        if (n.garder) attendre(n.garder.n, 'nombre', 'Dés gardés');
        if (n.nombre.t === 'nombre' && n.faces.t === 'nombre' && n.faces.v < 1) {
          erreur('Un dé a au moins une face', n.pos);
        }
        return 'nombre';
      case 'appel':
        return typerAppel(n);
    }
  }

  function typerAppel(n: Extract<Noeud, { t: 'appel' }>): TypeValeur | null {
    const litteral = (quoi: string): string | null => {
      const a = n.args[0];
      if (n.args.length !== 1 || !a || a.t !== 'texte') {
        erreur(`${n.fn}() attend ${quoi} entre guillemets`, n.pos);
        return null;
      }
      return a.v;
    };

    switch (n.fn) {
      case 'mod': {
        const a = n.args[0];
        if (n.args.length !== 1 || !a || a.t !== 'attribut') {
          erreur('mod() attend un attribut : mod(@DEX)', n.pos);
          return 'nombre';
        }
        const info = env.attribut(a.cle, a.entite);
        if (!info) erreur(`Attribut inconnu : @${a.entite ? `${a.entite}.` : ''}${a.cle}`, a.pos);
        else if (!info.modificateur) erreur(`@${a.cle} n’a pas de modificateur`, a.pos);
        else noterAttribut(a.cle, a.entite);
        return 'nombre';
      }
      case 'rang':
      case 'possede': {
        const retour = n.fn === 'rang' ? 'nombre' : 'booleen';
        const a = n.args[0];
        // Entrée désignée à l'exécution (`rang(arme.competence)`) : permis là où `valeur()` l'est
        if (n.args.length === 1 && a && a.t !== 'texte' && env.dynamique) {
          dynamique = true;
          attendre(a, 'texte', `${n.fn}()`);
          return retour;
        }
        const id = litteral('un identifiant d’entrée');
        if (id !== null) {
          if (env.entree && !env.entree(id)) erreur(`Entrée inconnue : ${id}`, n.pos);
          entrees.add(id);
        }
        return retour;
      }
      case 'valeur':
      case 'modificateur': {
        if (!env.dynamique) erreur(`${n.fn}() n’est pas permis ici`, n.pos);
        dynamique = true;
        if (n.args.length !== 1) erreur(`${n.fn}() attend un argument`, n.pos);
        else attendre(n.args[0]!, 'texte', `${n.fn}()`);
        return 'nombre';
      }
    }

    const sig = FONCTIONS[n.fn] ?? env.fonctions?.[n.fn];
    if (!sig) {
      erreur(`Fonction inconnue : ${n.fn}()`, n.pos);
      n.args.forEach(typer);
      return null;
    }
    const min = sig.args.length;
    if (sig.variadique ? n.args.length < min : n.args.length !== min) {
      erreur(`${n.fn}() attend ${sig.variadique ? 'au moins ' : ''}${min} argument(s)`, n.pos);
    }
    n.args.forEach((a, i) => {
      const type = sig.args[Math.min(i, sig.args.length - 1)];
      if (type) attendre(a, type, `Argument ${i + 1} de ${n.fn}()`);
    });
    return sig.retour;
  }

  const type = typer(noeud);
  if (erreurs.length || !type) {
    return {
      ok: false,
      erreurs: erreurs.length ? erreurs : [{ message: 'Type indéterminé', position: 0 }],
    };
  }
  return {
    ok: true,
    formule: {
      texte,
      noeud,
      type,
      dependances,
      dependancesExternes,
      entrees,
      aleatoire,
      dynamique,
    },
  };
}

/** Analyse puis vérifie, en contrôlant éventuellement le type du résultat. */
export function compiler(
  texte: string,
  env: EnvironnementTypes,
  attendu?: TypeValeur,
): ResultatVerification {
  const a = analyser(texte);
  if (!a.ok) return { ok: false, erreurs: [a.erreur] };
  const r = verifier(texte, a.noeud, env);
  if (r.ok && attendu && r.formule.type !== attendu) {
    return {
      ok: false,
      erreurs: [
        { message: `Résultat de type ${attendu} attendu, ${r.formule.type} obtenu`, position: 0 },
      ],
    };
  }
  return r;
}
