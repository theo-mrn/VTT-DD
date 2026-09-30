/**
 * Exécution d'une action (attaque, test de compétence, initiative…) : pure et
 * déterministe, les dés passent par le générateur fourni. L'état des entités
 * n'est jamais modifié : les conséquences sont renvoyées sous forme de
 * modifications proposées (voir `appliquerModifications`).
 *
 * Déroulé, dans l'ordre où le chargeur rend les variables disponibles :
 * paramètres → `variables` → jet (`total`/`naturel`/`critique` ou résultats
 * des dés à symboles) → `reussi` → `apres` → conséquences → tables.
 *
 * Comme pour la fiche, une formule qui échoue (division par zéro…) ne fait
 * pas échouer l'action : elle prend une valeur par défaut et l'erreur est
 * listée dans `erreurs`. Seules les données fournies par l'appelant (action,
 * entités, paramètres) sont refusées.
 */
import { type Fiche, type PossessionEffective, type SourceEffets } from '../calcul/index.js';
import { reduireDegats } from './degats.js';
import {
  chemins,
  formuleChamp,
  systemeRacine,
  variablesObjet,
  type SystemeCharge,
} from '../chargement/index.js';
import {
  ContexteCombat,
  defautChoix,
  ENTITE_COMBAT,
  quantiteDe,
  recoitSituation,
  valeurCombat,
  type ContexteCombatSaisi,
  type Parametre,
} from '../schema/index.js';
import {
  ErreurEvaluation,
  evaluer,
  LIMITES,
  type ContexteEvaluation,
  type FormuleVerifiee,
  type Generateur,
  type JetDes,
  type ModeDes,
  type ResultatEvaluation,
  type TypeValeur,
  type Valeur,
} from '../formules/index.js';
import type { Effet } from '../schema/index.js';
import type { Modification } from './modifications.js';
import {
  ameliorer,
  retirer,
  retrograder,
  lancerSymboles,
  regrouperPool,
  type DeSymbole,
  type ErreurJet,
  type Pool,
} from './symboles.js';
import { tirerTable, type TirageTable } from './tables.js';

export interface DemandeAction {
  /** Identifiant de l'action du système. */
  action: string;
  acteur: Fiche;
  /** Obligatoire si l'action déclare une cible, interdite sinon. */
  cible?: Fiche;
  /** Valeurs des paramètres, par identifiant ; les absents prennent leur défaut. */
  parametres?: Record<string, Valeur>;
  aleatoire: Generateur;
  /** Ajustements libres du jet, hors règles, appliqués après les effets. */
  ajustements?: Ajustements;
  /** Issue corrigée par le MJ : remplace la réussite (et le critique d'un jet numérique). */
  forcer?: IssueForcee;
  /**
   * Contexte du combat (`@combat.*`), figé par qui mène le combat à la déclaration, sans
   * l'action en cours. Absent : hors combat, valeurs neutres.
   */
  combat?: ContexteCombatSaisi;
}

/**
 * Côté d'où vient une ligne d'un jet : l'action elle-même, l'acteur (ses effets, ses
 * ajustements), ou la cible (défense active). La vue de l'acteur anonymise le côté cible.
 */
export type CoteJet = 'action' | 'acteur' | 'cible';

/**
 * Ajustements libres d'un jet (l'ancien compteur de pool « forcé ») : dés à symboles ajoutés
 * (nombre positif) ou retirés (négatif) par sorte, bonus au total d'un jet numérique.
 */
export interface Ajustements {
  des?: { de: string; nombre: number }[];
  bonus?: number;
}

/** Issue imposée (« c'est un critique ») : les dés ne changent pas, seules ces valeurs. */
export interface IssueForcee {
  reussi?: boolean;
  critique?: boolean;
}

/** Source des lignes d'un ajustement libre (construction du pool, bonus). */
export const SOURCE_AJUSTEMENT = 'ajustement';

export interface ErreurAction {
  /** Paramètre concerné, le cas échéant. */
  parametre?: string;
  message: string;
}

/** Bonus ajouté au total d'un jet numérique par un effet `sur: 'jet'`. */
export interface BonusJet {
  source: string;
  nom: string;
  valeur: number;
  cote: CoteJet;
}

/** Étape de construction d'un pool de dés à symboles. */
export interface EtapePool {
  /** `action` pour le pool et les améliorations de l'action, sinon l'entrée source de l'effet. */
  source: string;
  nom: string;
  operation: 'ajouter' | 'ameliorer' | 'retrograder' | 'retirer';
  de: string;
  vers?: string;
  nombre: number;
  cote: CoteJet;
}

export interface JetNumeriqueResultat {
  type: 'numerique';
  formule: string;
  /** Dés lancés par la formule. */
  jets: JetDes[];
  /** Valeur de la formule, avant les bonus des effets. */
  valeur: number;
  bonus: BonusJet[];
  /** Valeur de la formule + bonus (variable `total`). */
  total: number;
  /** Somme des dés gardés seuls (variable `naturel`). */
  naturel: number;
  critique: boolean;
  fumble: boolean;
}

export interface JetSymbolesResultat {
  type: 'symboles';
  construction: EtapePool[];
  /** Pool finalement lancé, dans l'ordre des sortes de dé du système. */
  pool: Pool;
  des: DeSymbole[];
  symboles: Record<string, number>;
  resultats: Record<string, number>;
}

/** Résultat complet et sérialisable d'une action, pour l'historique. */
export interface ResultatAction {
  action: string;
  /** Paramètres retenus (défauts compris). */
  parametres: Record<string, Valeur>;
  /** Toutes les variables de l'action, dans leur ordre de calcul. */
  variables: Record<string, Valeur>;
  jet: JetNumeriqueResultat | JetSymbolesResultat;
  reussi: boolean;
  /** Modifications d'état proposées, à appliquer par l'appelant. */
  modifications: Modification[];
  tables: TirageTable[];
  /** Déroulé lisible de l'action. */
  explications: string[];
  /** Formules en échec (remplacées par une valeur par défaut). */
  erreurs: ErreurJet[];
  /** Le jet porte des ajustements libres (hors règles). */
  ajuste?: boolean;
  /** L'issue a été imposée (`forcer`). */
  force?: boolean;
}

export type ResultatExecution =
  { ok: true; resultat: ResultatAction } | { ok: false; erreurs: ErreurAction[] };

/** Exécution interne : donne aussi accès aux formules évaluées avec les variables finales. */
export type ExecutionInterne =
  | {
      ok: true;
      resultat: ResultatAction;
      /** Évalue une formule compilée de l'action avec ses variables finales. */
      evaluer(chemin: string, defaut: Valeur): Valeur;
    }
  | { ok: false; erreurs: ErreurAction[] };

export function executerAction(systeme: SystemeCharge, demande: DemandeAction): ResultatExecution {
  const r = executer(systeme, demande);
  return r.ok ? { ok: true, resultat: r.resultat } : r;
}

const defautDe = (t: TypeValeur): Valeur => (t === 'nombre' ? 0 : t === 'booleen' ? false : '');

/** Nombre de dés issu d'une formule : entier inférieur, jamais négatif. */
const nombreDes = (v: Valeur): number => Math.max(0, Math.floor(Number(v) || 0));

const signe = (n: number) => (n < 0 ? `− ${-n}` : `+ ${n}`);

export function executer(
  systeme: SystemeCharge,
  demande: DemandeAction,
  options: { apercu?: boolean } = {},
): ExecutionInterne {
  const { acteur, cible, aleatoire } = demande;
  const action = systeme.actions.get(demande.action);
  if (!action) return { ok: false, erreurs: [{ message: `Action inconnue : ${demande.action}` }] };

  // ─── Validation des entités et des paramètres ─────────────────────────────

  const refus: ErreurAction[] = [];
  // Même système d'origine ; les réglages d'options de chaque fiche sont les siens
  if (systemeRacine(acteur.systeme) !== systemeRacine(systeme))
    refus.push({ message: 'La fiche de l’acteur a été calculée avec un autre système' });
  if (!action.pour.includes(acteur.etat.type))
    refus.push({ message: `${action.nom} n’est pas permise à ${acteur.entite.type.nom}` });
  if (action.cible) {
    // Aperçu : l'acteur seul, ce qui dépend de la cible reste inconnu
    if (!cible) {
      if (!options.apercu) refus.push({ message: `${action.nom} demande une cible` });
    } else if (systemeRacine(cible.systeme) !== systemeRacine(systeme))
      refus.push({ message: 'La fiche de la cible a été calculée avec un autre système' });
    else if (!action.cible.includes(cible.etat.type)) {
      const attendu = action.cible.map((t) => systeme.entites.get(t)?.type.nom ?? t).join(' ou ');
      refus.push({ message: `Cible invalide : ${attendu} attendu, ${cible.entite.type.nom} reçu` });
    }
  } else if (cible) refus.push({ message: `${action.nom} ne prend pas de cible` });

  const fournis = demande.parametres ?? {};
  const parametres: Record<string, Valeur> = {};
  const choisies = new Map<string, PossessionEffective>();
  for (const cle of Object.keys(fournis)) {
    if (!action.parametres.some((p) => p.id === cle))
      refus.push({ parametre: cle, message: `Paramètre inconnu : ${cle}` });
  }
  for (const p of action.parametres) {
    let v = fournis[p.id];
    const refuser = (message: string) => refus.push({ parametre: p.id, message });
    // Paramètre réservé (option d'un talent) : ignoré s'il n'est pas proposé à l'acteur
    const exige = systeme.formules.get(chemins.action(action.id, `parametres/${p.id}/exige`));
    const decideur = p.par === 'cible' ? cible : acteur;
    if (exige && decideur?.evaluer(exige, {}, false) !== true) {
      if (v !== undefined && v !== defautParametre(p))
        refuser(`${p.nom} : option non disponible (${exige.texte})`);
      v = undefined;
      if (p.type === 'nombre' || p.type === 'booleen' || p.type === 'choix') {
        parametres[p.id] = defautParametre(p);
        continue;
      }
      if (p.type === 'entree') {
        parametres[p.id] = '';
        continue;
      }
    }
    if (p.type === 'entree' && p.facultatif && (v === undefined || v === '')) {
      parametres[p.id] = '';
      continue;
    }
    switch (p.type) {
      case 'nombre':
        if (v === undefined) parametres[p.id] = p.defaut;
        else if (typeof v !== 'number' || !Number.isFinite(v)) refuser(`${p.nom} : nombre attendu`);
        else parametres[p.id] = v;
        break;
      case 'booleen':
        if (v === undefined) parametres[p.id] = p.defaut;
        else if (typeof v !== 'boolean') refuser(`${p.nom} : booléen attendu`);
        else parametres[p.id] = v;
        break;
      case 'choix':
        if (v === undefined) parametres[p.id] = defautChoix(p);
        else if (typeof v !== 'string' || !p.options.some((o) => o.valeur === v))
          refuser(`${p.nom} : option attendue (${p.options.map((o) => o.valeur).join(', ')})`);
        else parametres[p.id] = v;
        break;
      case 'attribut': {
        const proposes = [...acteur.entite.attributs.values()].filter(
          (x) => p.attributs?.includes(x.cle) || (p.groupe !== undefined && x.groupe === p.groupe),
        );
        if (typeof v !== 'string') refuser(`${p.nom} : attribut attendu`);
        else if (!proposes.some((x) => x.cle === v))
          refuser(
            `${p.nom} : « ${v} » n’est pas proposé (${proposes.map((x) => x.cle).join(', ')})`,
          );
        else parametres[p.id] = v;
        break;
      }
      case 'entree': {
        const sorte = systeme.sortes.get(p.sorte)?.nom ?? p.sorte;
        if (v === undefined) {
          refuser(`${p.nom} : ${sorte} requise`);
          break;
        }
        if (typeof v !== 'string') {
          refuser(`${p.nom} : identifiant d’entrée attendu`);
          break;
        }
        // `entree#exemplaire` : un exemplaire précis (ses champs et sa formule propres)
        const [id, exemplaire] = v.split('#', 2) as [string, string | undefined];
        v = id;
        const entree = systeme.entrees.get(v);
        const effective = acteur.possessions.get(v);
        const ex =
          exemplaire === undefined
            ? undefined
            : effective?.exemplaires.find((x) => (x.exemplaire ?? '') === exemplaire);
        if (exemplaire !== undefined && !ex) {
          refuser(`${p.nom} : exemplaire « ${exemplaire} » de ${entree?.nom ?? id} introuvable`);
          break;
        }
        const possession =
          effective && ex
            ? {
                ...effective,
                possession: ex,
                actif: effective.sorte.activable ? ex.actif : true,
                quantite: quantiteDe(ex),
              }
            : effective;
        if (!entree) refuser(`${p.nom} : entrée inconnue « ${v} »`);
        else if (entree.sorte !== p.sorte) refuser(`${p.nom} : ${entree.nom} n’est pas ${sorte}`);
        else if (p.etiquette && !entree.etiquettes.includes(p.etiquette))
          refuser(`${p.nom} : ${entree.nom} n’a pas l’étiquette « ${p.etiquette} »`);
        else if (!possession && p.possedee)
          refuser(`${p.nom} : ${entree.nom} n’est pas possédée par l’acteur`);
        else if (possession && !possession.actif)
          refuser(`${p.nom} : ${entree.nom} n’est pas active`);
        else {
          parametres[p.id] = v;
          // Entrée non possédée mais acceptée : rang 0 (compétence jamais apprise)
          choisies.set(
            p.id,
            possession ?? {
              entree,
              sorte: systeme.sortes.get(entree.sorte)!,
              rang: 0,
              achete: 0,
              actif: true,
              exemplaires: [],
              quantite: 1,
              sources: [],
            },
          );
        }
        break;
      }
    }
  }
  const sortesDes = systeme.source.des?.sortes ?? [];
  for (const a of demande.ajustements?.des ?? []) {
    if (action.jet.type === 'symboles' && !sortesDes.some((x) => x.id === a.de))
      refus.push({ message: `Ajustement : dé inconnu (${a.de})` });
    if (!Number.isInteger(a.nombre))
      refus.push({ message: `Ajustement : nombre de dés entier attendu` });
  }
  const bonusLibre = demande.ajustements?.bonus;
  if (bonusLibre !== undefined && !Number.isFinite(bonusLibre))
    refus.push({ message: 'Ajustement : bonus numérique attendu' });
  const lu = demande.combat === undefined ? undefined : ContexteCombat.safeParse(demande.combat);
  if (lu && !lu.success)
    refus.push({
      message: `Contexte du combat invalide : ${lu.error.issues.map((i) => i.path.join('.') || i.message).join(', ')}`,
    });
  if (refus.length) return { ok: false, erreurs: refus };
  const combat = lu?.success ? lu.data : undefined;
  /** `@combat.<cle>` : lu dans le contexte fourni, neutre hors combat. */
  const lireCombat = (cle: string): Valeur => {
    const v = valeurCombat(combat, cle);
    if (v === undefined) throw new ErreurEvaluation(`Valeur de combat inconnue : ${cle}`, 0);
    return v;
  };

  const exige = systeme.formules.get(chemins.action(action.id, 'exige'));
  if (exige && acteur.evaluer(exige, {}, false) !== true) {
    return {
      ok: false,
      erreurs: [{ message: `${action.nom} : condition non remplie (${exige.texte})` }],
    };
  }

  // ─── Contexte d'évaluation ────────────────────────────────────────────────

  aleatoire.phase?.('jet');
  const ch = (x: string) => chemins.action(action.id, x);
  const erreurs: ErreurJet[] = [];
  const explications: string[] = [];
  const variables = new Map<string, Valeur>();

  /**
   * Dés lancés par les formules de jet des objets (`arme.degats`), lues pendant
   * l'évaluation d'une autre formule : ajoutés aux jets de celle-ci.
   */
  let imbriques: JetDes[] = [];
  const calculerFormule = (
    chemin: string,
    defaut: Valeur,
    ctx: ContexteEvaluation,
  ): ResultatEvaluation => evaluerFormule(systeme.formule(chemin), chemin, defaut, ctx);
  const evaluerFormule = (
    f: FormuleVerifiee,
    chemin: string,
    defaut: Valeur,
    ctx: ContexteEvaluation,
  ): ResultatEvaluation => {
    const avant = imbriques;
    imbriques = [];
    try {
      const r = evaluer(f.noeud, ctx);
      return imbriques.length ? { valeur: r.valeur, jets: [...r.jets, ...imbriques] } : r;
    } catch (e) {
      if (!(e instanceof ErreurEvaluation)) throw e;
      erreurs.push({ ou: chemin, message: `${e.message} (« ${f.texte} »)` });
      return { valeur: defaut, jets: [] };
    } finally {
      imbriques = avant;
    }
  };

  /** Formules de jet des objets choisis (`arme.degats`) : tirées à chaque lecture. */
  const differees = new Map<string, (mode?: ModeDes) => Valeur>();

  /**
   * Valeur d'un champ d'une possession (celle de l'exemplaire choisi, sinon de l'entrée) ;
   * un champ `formule` est évalué sur l'acteur, avec les champs de l'objet. Un champ de
   * jet (`des`) est renvoyé comme une fonction : ses dés sont lancés à chaque lecture.
   */
  const lireChamp = (p: PossessionEffective, c: string): Valeur | ((m?: ModeDes) => Valeur) => {
    const def = p.sorte.champs.find((x) => x.id === c);
    const brut = p.possession?.champs[c] ?? p.entree.champs[c];
    const v =
      brut !== undefined && !Array.isArray(brut)
        ? brut
        : def && 'defaut' in def
          ? def.defaut
          : undefined;
    if (def?.type === 'formule') {
      const f = formuleChamp(systeme, p.entree, def, p.possession, acteur.etat.type);
      if (!f) return Number(v) || 0;
      const lire = variablesObjet(p.entree, p.sorte, p, p.possession);
      const variable = (n: string): Valeur => {
        const x = lire(n);
        if (x === undefined) throw new ErreurEvaluation(`Variable inconnue : ${n}`, 0);
        return x;
      };
      const ou = `${p.entree.id}/champs/${c}`;
      const tirer = (mode?: ModeDes): Valeur => {
        const r = evaluerFormule(
          f,
          ou,
          0,
          acteur.contexte({ variable, aleatoire, ...(mode ? { modeDes: mode } : {}) }),
        );
        imbriques.push(...r.jets);
        return Number(r.valeur);
      };
      return def.des ? tirer : tirer();
    }
    return v ?? (def?.type === 'booleen' ? false : def?.type === 'nombre' ? 0 : '');
  };
  /** Valeur simple d'un champ (les formules de jet sont tirées une fois). */
  const valeurChamp = (p: PossessionEffective, c: string): Valeur => {
    const v = lireChamp(p, c);
    return typeof v === 'function' ? v() : v;
  };

  const entite = (e: string): Fiche => {
    if (e === 'cible' && cible) return cible;
    throw new ErreurEvaluation(`Entité « ${e} » absente du contexte`, 0);
  };
  /** Attributs d'une fiche, et `@combat.*` (le même pour l'acteur, la cible et leurs effets). */
  const attributsAvecCombat = (fiche: Fiche) => {
    const base = fiche.contexte();
    return (cle: string, e?: string): Valeur =>
      e === ENTITE_COMBAT ? lireCombat(cle) : base.attribut(cle, e);
  };
  const lireVariable = (nom: string, mode?: ModeDes): Valeur => {
    const differee = differees.get(nom);
    if (differee) return differee(mode);
    const v = variables.get(nom);
    if (v === undefined) throw new ErreurEvaluation(`Variable absente du contexte : ${nom}`, 0);
    return v;
  };
  const moi = acteur.contexte();
  const ctx = acteur.contexte({
    attribut: (cle, e) =>
      e === undefined
        ? moi.attribut(cle)
        : e === ENTITE_COMBAT
          ? lireCombat(cle)
          : entite(e).contexte().attribut(cle),
    modificateur: (cle, e) =>
      e === undefined ? moi.modificateur(cle) : entite(e).contexte().modificateur(cle),
    variable: lireVariable,
    aleatoire,
    fonctions: {
      cible_possede: (id) => (cible ? cible.contexte().possede!(String(id)) : false),
      cible_rang: (id) => (cible ? cible.contexte().rang!(String(id)) : 0),
    },
  });
  const ev = (chemin: string, defaut: Valeur): Valeur =>
    calculerFormule(chemin, defaut, ctx).valeur;
  const evType = (chemin: string): Valeur => ev(chemin, defautDe(systeme.formule(chemin).type));

  // ─── Paramètres et variables ──────────────────────────────────────────────

  for (const p of action.parametres) {
    const v = parametres[p.id]!;
    variables.set(p.id, v);
    const possession = choisies.get(p.id);
    if (!possession) {
      if (p.type === 'entree') {
        // Entrée facultative omise : rang 0 et champs à leur valeur neutre
        variables.set(`${p.id}.rang`, 0);
        for (const c of systeme.sortes.get(p.sorte)?.champs ?? []) {
          if (c.type === 'entrees') continue;
          const def =
            c.type !== 'formule' && 'defaut' in c && c.defaut !== undefined ? c.defaut : undefined;
          variables.set(
            `${p.id}.${c.id}`,
            def ??
              (c.type === 'nombre' || c.type === 'formule' ? 0 : c.type === 'booleen' ? false : ''),
          );
        }
        explications.push(`${p.nom} : aucun`);
        continue;
      }
      // Situation sans rien de particulier : rien à raconter
      if (p.section === 'situation' && v === defautParametre(p)) continue;
      const option = p.type === 'choix' ? p.options.find((o) => o.valeur === v)?.nom : undefined;
      explications.push(`${p.nom} : ${option ?? String(v)}`);
      continue;
    }
    variables.set(`${p.id}.rang`, possession.rang);
    for (const c of possession.sorte.champs) {
      if (c.type === 'entrees') continue;
      const v = lireChamp(possession, c.id);
      if (typeof v === 'function') differees.set(`${p.id}.${c.id}`, v);
      else variables.set(`${p.id}.${c.id}`, v);
    }
    explications.push(`${p.nom} : ${possession.entree.nom} (rang ${possession.rang})`);
  }

  // ─── Effets de jet des possessions actives ────────────────────────────────

  /** Paramètres de toutes les actions, avec leur valeur neutre quand l'action courante ne les a pas. */
  const neutres = new Map<string, Valeur>();
  for (const a of systeme.actions.values())
    for (const p of a.parametres)
      if (!neutres.has(p.id))
        neutres.set(
          p.id,
          p.type === 'nombre'
            ? 0
            : p.type === 'booleen'
              ? false
              : p.type === 'choix'
                ? defautChoix(p)
                : '',
        );

  /** Variables d'un effet de jet : l'action et ses paramètres (neutres s'il ne les a pas). */
  const variableJet = (nom: string): Valeur => {
    if (nom === 'action') return action.id;
    // Paramètre de l’action : sa valeur, ou sa valeur neutre si l’action ne l’a pas
    if (neutres.has(nom)) return parametres[nom] ?? neutres.get(nom)!;
    // Rang et champs d'un paramètre entrée (`arme.competence`) ; neutres si l'action ne l'a pas
    const differee = differees.get(nom);
    if (differee) return differee();
    const lu = variables.get(nom);
    if (lu !== undefined) return lu;
    if (nom.includes('.')) return nom.endsWith('.rang') ? 0 : '';
    throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
  };
  /** Variables d'un effet : celles de sa source (`rang`, `actif`, `source.x`), puis `variableJet`. */
  const variablesEffet =
    (source: SourceEffets) =>
    (nom: string): Valeur =>
      nom === 'rang' || nom === 'actif' || nom.startsWith('source.')
        ? source.variable(nom)
        : variableJet(nom);

  /**
   * Ce que le jet implique : entrées et attributs désignés par les paramètres,
   * et ceux auxquels renvoient les champs des entrées choisies (compétence d'une
   * arme, caractéristique liée d'une compétence).
   */
  const impliques = new Set<string>();
  for (const p of action.parametres) {
    const v = parametres[p.id];
    if (typeof v !== 'string' || !v) continue;
    if (p.type === 'attribut') impliques.add(`attribut:${v}`);
    if (p.type !== 'entree') continue;
    impliques.add(`entree:${v}`);
    const choisie = choisies.get(p.id);
    for (const c of choisie?.sorte.champs ?? []) {
      if (c.type !== 'entree' && c.type !== 'attribut') continue;
      const renvoi = valeurChamp(choisie!, c.id);
      if (typeof renvoi === 'string' && renvoi) impliques.add(`${c.type}:${renvoi}`);
    }
  }

  type AjoutJet = NonNullable<Extract<Effet, { sur: 'jet' }>['ajout']>;
  const effets: {
    source: string;
    ajout: AjoutJet;
    valeur: number;
    nom: string;
    cote: CoteJet;
  }[] = [];
  // Effets de l'acteur, puis effets défensifs de la cible (`cote: cible`) :
  // entrées du catalogue, exemplaires et bonus libres, par le même chemin
  const porteurs: [Fiche, 'acteur' | 'cible'][] = [[acteur, 'acteur']];
  if (cible) porteurs.push([cible, 'cible']);
  for (const [fiche, cote] of porteurs) {
    const attribut = attributsAvecCombat(fiche);
    for (const source of fiche.sources) {
      const ctxEffet = fiche.contexte({ variable: variablesEffet(source), attribut });
      source.effets.forEach((f, i) => {
        if (f.sur !== 'jet' || !f.ajout || source.desactive(i)) return;
        if (f.cote !== cote) return;
        if (f.actions && !f.actions.includes(action.id)) return;
        if (f.implique?.entree !== undefined && !impliques.has(`entree:${f.implique.entree}`))
          return;
        if (f.implique?.attribut !== undefined && !impliques.has(`attribut:${f.implique.attribut}`))
          return;
        const ou = (x: string) => `${source.id}/effets/${i}/${x}`;
        for (const [x, declaree] of [
          ['condition', f.condition],
          ['si', f.si],
        ] as const) {
          if (declaree === undefined) continue;
          const cond = source.formule(i, x);
          if (!cond || evaluerFormule(cond, ou(x), false, ctxEffet).valeur !== true) return;
        }
        const cle = 'bonus' in f.ajout ? 'bonus' : 'variable' in f.ajout ? 'ajouter' : 'nombre';
        const formule = source.formule(i, cle);
        if (!formule) return;
        const valeur = Number(evaluerFormule(formule, ou(cle), 0, ctxEffet).valeur);
        effets.push({
          source: source.id,
          ajout: f.ajout,
          valeur,
          nom: f.description ?? source.nom,
          cote,
        });
      });
    }
  }

  // Situation du système (couvert, avantage de situation…) : effets de l'action elle-même,
  // lus avec ses paramètres, la cible et le combat ; sans effet, ils ne disent rien
  if (recoitSituation(action)) {
    // Paramètres de situation écartés par l'action (`situation.sauf`) : leur valeur neutre,
    // même si l'action déclare un paramètre du même nom
    const ecartes = new Map<string, Valeur>();
    if (typeof action.situation === 'object')
      for (const p of systeme.source.situation?.parametres ?? [])
        if (action.situation.sauf.includes(p.id)) ecartes.set(p.id, defautParametre(p));
    const ctxSituation: ContexteEvaluation = {
      ...ctx,
      variable: (nom) => ecartes.get(nom) ?? variableJet(nom),
    };
    (systeme.source.situation?.effets ?? []).forEach((f, i) => {
      if (!f.ajout || (f.actions && !f.actions.includes(action.id))) return;
      if (f.implique?.entree !== undefined && !impliques.has(`entree:${f.implique.entree}`)) return;
      if (f.implique?.attribut !== undefined && !impliques.has(`attribut:${f.implique.attribut}`))
        return;
      const ou = (x: string) => chemins.situation(action.id, i, x);
      for (const x of ['condition', 'si'] as const) {
        if (f[x] === undefined) continue;
        if (calculerFormule(ou(x), false, ctxSituation).valeur !== true) return;
      }
      const cle = 'bonus' in f.ajout ? 'bonus' : 'variable' in f.ajout ? 'ajouter' : 'nombre';
      const valeur = Number(calculerFormule(ou(cle), 0, ctxSituation).valeur);
      if (!valeur) return;
      effets.push({
        source: SOURCE_SITUATION,
        ajout: f.ajout,
        valeur,
        nom: f.description ?? NOM_SITUATION,
        cote: 'action',
      });
    });
  }

  // ─── Variables de l'action (avec les effets qui s'y ajoutent), vérifications ─

  const connues = new Map<string, Valeur>(options.apercu ? variables : []);
  for (const v of action.variables) {
    const avant = erreurs.length;
    let valeur = evType(ch(`variables/${v.cle}`));
    for (const e of effets) {
      if (!('variable' in e.ajout) || e.ajout.variable !== v.cle || typeof valeur !== 'number')
        continue;
      valeur += e.valeur;
      explications.push(`${e.nom} : ${signe(e.valeur)} → ${v.cle}`);
    }
    variables.set(v.cle, valeur);
    explications.push(`${v.cle} = ${String(valeur)}`);
    // Aperçu : une variable qui dépend de la cible ou des dés n'est pas connue
    if (erreurs.length === avant) connues.set(v.cle, valeur);
  }
  if (options.apercu) throw new ArretApercu(connues);

  for (const [i, v] of action.verifications.entries()) {
    if (ev(ch(`verifications/${i}`), false) !== true) {
      return { ok: false, erreurs: [{ message: v.message }] };
    }
  }

  // ─── Jet ──────────────────────────────────────────────────────────────────

  const jet = action.jet;
  let resultatJet: JetNumeriqueResultat | JetSymbolesResultat;
  let reussi: boolean;

  if (jet.type === 'numerique') {
    const r = calculerFormule(ch('jet/formule'), 0, ctx);
    const valeur = Number(r.valeur);
    const bonus: BonusJet[] = [];
    for (const e of effets) {
      if ('bonus' in e.ajout)
        bonus.push({ source: e.source, nom: e.nom, valeur: e.valeur, cote: e.cote });
      else if (!('variable' in e.ajout))
        explications.push(`${e.nom} : ignoré (dés à symboles sur un jet numérique)`);
    }
    if (bonusLibre) bonus.push(bonusAjustement(bonusLibre));
    if (demande.ajustements?.des?.length)
      explications.push('Ajustement des dés : ignoré (jet numérique)');
    const total = valeur + bonus.reduce((s, b) => s + b.valeur, 0);
    const naturel = r.jets.reduce((s, j) => s + j.total, 0);
    variables.set('total', total);
    variables.set('naturel', naturel);

    const lire = (k: 'critique' | 'fumble' | 'reussite', defaut: boolean): boolean =>
      jet[k] === undefined ? defaut : ev(ch(`jet/${k}`), false) === true;
    reussi = lire('reussite', true);
    let critique = lire('critique', false);
    const fumble = lire('fumble', false);
    if (demande.forcer?.critique !== undefined) critique = demande.forcer.critique;
    if (jet.critique !== undefined || demande.forcer?.critique !== undefined)
      variables.set('critique', critique);
    if (jet.fumble !== undefined) variables.set('fumble', fumble);

    const des = r.jets.length ? ` [${r.jets.map(decrireJet).join(' ; ')}]` : '';
    explications.push(`Jet ${jet.formule} = ${valeur}${des}`);
    for (const b of bonus) explications.push(`${b.nom} : ${signe(b.valeur)}`);
    if (bonus.length) explications.push(`Total : ${total}`);
    if (critique) explications.push('Critique');
    if (fumble) explications.push('Échec critique');

    resultatJet = {
      type: 'numerique',
      formule: jet.formule,
      jets: r.jets,
      valeur,
      bonus,
      total,
      naturel,
      critique,
      fumble,
    };
  } else {
    const construction: EtapePool[] = [];
    let pool: Pool = [];
    const ajouter = (source: string, nom: string, de: string, nombre: number, cote: CoteJet) => {
      construction.push({ source, nom, operation: 'ajouter', de, nombre, cote });
      pool.push({ de, nombre });
    };
    const ameliorerPool = (
      source: string,
      nom: string,
      de: string,
      vers: string,
      n: number,
      cote: CoteJet,
    ) => {
      construction.push({ source, nom, operation: 'ameliorer', de, vers, nombre: n, cote });
      pool = ameliorer(pool, de, vers, n);
    };

    jet.pool.forEach((p, i) =>
      ajouter('action', action.nom, p.de, nombreDes(ev(ch(`jet/pool/${i}`), 0)), 'action'),
    );
    for (const e of effets)
      if ('de' in e.ajout) ajouter(e.source, e.nom, e.ajout.de, nombreDes(e.valeur), e.cote);
    jet.ameliorations.forEach((a, i) =>
      ameliorerPool(
        'action',
        action.nom,
        a.de,
        a.vers,
        nombreDes(ev(ch(`jet/ameliorations/${i}`), 0)),
        'action',
      ),
    );
    for (const e of effets) {
      if ('ameliorer' in e.ajout)
        ameliorerPool(
          e.source,
          e.nom,
          e.ajout.ameliorer,
          e.ajout.vers,
          nombreDes(e.valeur),
          e.cote,
        );
      else if ('bonus' in e.ajout)
        explications.push(`${e.nom} : ignoré (bonus sur un jet à symboles)`);
    }
    for (const e of effets) {
      if (!('retrograder' in e.ajout)) continue;
      const { retrograder: de, vers } = e.ajout;
      const n = nombreDes(e.valeur);
      construction.push({
        source: e.source,
        nom: e.nom,
        operation: 'retrograder',
        de,
        vers,
        nombre: n,
        cote: e.cote,
      });
      pool = retrograder(pool, de, vers, n);
    }
    for (const e of effets) {
      if (!('retirer' in e.ajout)) continue;
      const de = e.ajout.retirer;
      const n = nombreDes(e.valeur);
      construction.push({
        source: e.source,
        nom: e.nom,
        operation: 'retirer',
        de,
        nombre: n,
        cote: e.cote,
      });
      pool = retirer(pool, de, n);
    }
    // Ajustements libres, après les effets : dés ajoutés ou retirés à la main
    for (const a of demande.ajustements?.des ?? []) {
      if (!a.nombre) continue;
      const nombre = Math.abs(a.nombre);
      const operation = a.nombre > 0 ? 'ajouter' : 'retirer';
      construction.push({
        source: SOURCE_AJUSTEMENT,
        nom: NOM_AJUSTEMENT,
        operation,
        de: a.de,
        nombre,
        cote: 'acteur',
      });
      pool = a.nombre > 0 ? [...pool, { de: a.de, nombre }] : retirer(pool, a.de, nombre);
    }
    if (bonusLibre) explications.push(`${NOM_AJUSTEMENT} : bonus ignoré (jet à symboles)`);

    // Pool final, dans l'ordre des sortes du système, borné au nombre maximal de dés
    const sortes = systeme.source.des?.sortes ?? [];
    const nomDe = (id: string) => sortes.find((s) => s.id === id)?.nom ?? id;
    const rang = (id: string) => sortes.findIndex((s) => s.id === id);
    pool = regrouperPool(pool)
      .filter((p) => p.nombre > 0)
      .sort((a, b) => rang(a.de) - rang(b.de));
    let reste: number = LIMITES.desParJet;
    if (pool.reduce((s, p) => s + p.nombre, 0) > reste) {
      erreurs.push({
        ou: ch('jet/pool'),
        message: `Trop de dés (${reste} au plus) : pool tronqué`,
      });
      pool = pool.map((p) => {
        const nombre = Math.min(p.nombre, reste);
        reste -= nombre;
        return { de: p.de, nombre };
      });
      pool = pool.filter((p) => p.nombre > 0);
    }

    const l = lancerSymboles(systeme, pool, aleatoire);
    erreurs.push(...l.erreurs);
    for (const [cle, v] of Object.entries(l.resultats)) variables.set(cle, v);
    reussi = jet.reussite === undefined ? true : ev(ch('jet/reussite'), false) === true;

    for (const e of construction) {
      if (e.source === 'action' && e.operation === 'ajouter') continue;
      explications.push(decrireEtape(e, nomDe));
    }
    explications.push(
      `Pool : ${pool.map((p) => `${p.nombre} × ${nomDe(p.de)}`).join(', ') || 'aucun dé'}`,
    );
    const symboles = systeme.source.des?.symboles ?? [];
    const sortis = symboles.filter((s) => (l.symboles[s.id] ?? 0) > 0);
    explications.push(
      `Symboles : ${sortis.map((s) => `${s.nom} ${l.symboles[s.id]}`).join(', ') || 'aucun'}`,
    );
    const lus = systeme.source.des?.resultats.filter((r) => r.visible) ?? [];
    if (lus.length)
      explications.push(lus.map((r) => `${r.nom} : ${l.resultats[r.cle] ?? 0}`).join(', '));

    resultatJet = {
      type: 'symboles',
      construction,
      pool,
      des: l.des,
      symboles: l.symboles,
      resultats: l.resultats,
    };
  }

  if (demande.forcer?.reussi !== undefined) reussi = demande.forcer.reussi;
  const force = demande.forcer?.reussi !== undefined || demande.forcer?.critique !== undefined;
  if (force) explications.push('Issue corrigée par le MJ');
  variables.set('reussi', reussi);
  explications.push(reussi ? 'Réussite' : 'Échec');

  // ─── Après le jet, conséquences, tables ───────────────────────────────────

  aleatoire.phase?.('apres');
  for (const v of action.apres) {
    const chemin = ch(`apres/${v.cle}`);
    const r = calculerFormule(chemin, defautDe(systeme.formule(chemin).type), ctx);
    const des = r.jets.length ? ` [${r.jets.map(decrireJet).join(' ; ')}]` : '';
    explications.push(`${v.cle} = ${String(r.valeur)}${des}`);
    // Effets de jet qui s'ajoutent à cette valeur (bonus aux dégâts…)
    let valeur = r.valeur;
    for (const e of effets) {
      if (!('variable' in e.ajout) || e.ajout.variable !== v.cle || typeof valeur !== 'number')
        continue;
      valeur += e.valeur;
      explications.push(`${e.nom} : ${signe(e.valeur)} → ${v.cle} = ${valeur}`);
    }
    variables.set(v.cle, valeur);
  }

  const modifications: Modification[] = [];
  action.consequences.forEach((c, i) => {
    const ou = ch(`consequences/${i}`);
    if (c.condition !== undefined && ev(`${ou}/condition`, false) !== true) return;
    const fiche = c.entite === 'cible' ? cible! : acteur;
    const qui = c.entite === 'cible' ? 'Cible' : 'Acteur';

    if (!('attribut' in c)) {
      const id = c.entree ?? String(ev(`${ou}/entree`, ''));
      if (!id) return;
      const cible = systeme.entrees.get(id);
      const sorte = cible && systeme.sortes.get(cible.sorte);
      if (!cible || !sorte?.pour.includes(fiche.etat.type)) {
        erreurs.push({ ou: `${ou}/entree`, message: `Entrée impossible à donner : ${id}` });
        return;
      }
      const rangs = Number(ev(`${ou}/rangs`, 1));
      const duree = c.duree === undefined ? undefined : Number(ev(`${ou}/duree`, 0));
      modifications.push({
        entite: c.entite,
        entree: id,
        operation: c.operation,
        rangs,
        ...(duree !== undefined ? { duree } : {}),
      });
      const nomEntree = cible.nom;
      const pendant = duree !== undefined ? ` pendant ${duree} round(s)` : '';
      explications.push(
        `${qui} : ${c.operation === 'donner' ? 'reçoit' : 'perd'} ${nomEntree}${pendant}`,
      );
      return;
    }

    let valeur = Number(ev(`${ou}/valeur`, 0));
    const nom = fiche.entite.attributs.get(c.attribut)?.nom ?? c.attribut;
    // Type de dégâts fixe ou calculé ; un type calculé vide : dégâts non typés
    let typeDegats: string | undefined = c.type;
    // `degats: true` : le type déclaré par l'action, fixe ou calculé
    const cheminType =
      c.typeCalcule !== undefined
        ? `${ou}/type`
        : c.degats && action.typeDegatsCalcule !== undefined
          ? ch('typeDegats')
          : undefined;
    if (c.degats && c.type === undefined && c.typeCalcule === undefined)
      typeDegats = action.typeDegats;
    if (cheminType) {
      const t = String(ev(cheminType, ''));
      if (t && !systeme.source.typesDegats.some((x) => x.id === t)) {
        erreurs.push({ ou: cheminType, message: `Type de dégâts inconnu : ${t}` });
      } else if (t) typeDegats = t;
    }
    if (c.type !== undefined || c.typeCalcule !== undefined || c.degats) {
      // Dégâts : résistances, immunités et vulnérabilités de l'entité touchée
      const minimum = c.minimum === undefined ? 0 : Number(ev(`${ou}/minimum`, 0));
      const recus = reduireDegats(fiche, valeur, typeDegats, c.attribut, minimum);
      const typeNom =
        systeme.source.typesDegats.find((t) => t.id === typeDegats)?.nom ?? 'non typés';
      for (const l of recus.lignes) {
        const effet =
          l.operation === 'annuler'
            ? 'immunité'
            : l.operation === 'multiplier'
              ? `×${l.valeur}`
              : `−${l.valeur}`;
        explications.push(`${l.nom} : ${effet}${l.ignore ? ' (ignoré)' : ''}`);
      }
      const auMoins = recus.minimum !== undefined ? ` (au moins ${recus.minimum})` : '';
      explications.push(`Dégâts (${typeNom}) : ${recus.brut} → ${recus.valeur}${auMoins}`);
      modifications.push({
        entite: c.entite,
        attribut: c.attribut,
        operation: c.operation,
        valeur: recus.valeur,
        ...(typeDegats ? { type: typeDegats } : {}),
        brut: recus.brut,
        ...(recus.lignes.length ? { resistances: recus.lignes } : {}),
        ...(recus.minimum !== undefined ? { minimum: recus.minimum } : {}),
      });
      valeur = recus.valeur;
    } else {
      modifications.push({
        entite: c.entite,
        attribut: c.attribut,
        operation: c.operation,
        valeur,
      });
    }
    const op =
      c.operation === 'fixer'
        ? `fixé à ${valeur}`
        : c.operation === 'ajouter'
          ? signe(valeur)
          : signe(-valeur);
    explications.push(`${qui} : ${nom} ${op}`);
  });

  aleatoire.phase?.('tables');
  const tables: TirageTable[] = [];
  action.tables.forEach((t, i) => {
    const ou = ch(`tables/${i}`);
    if (ev(`${ou}/condition`, false) !== true) return;
    const modificateur = t.modificateur === undefined ? 0 : Number(ev(`${ou}/modificateur`, 0));
    const tirage = tirerTable(systeme, t.table, modificateur, aleatoire);
    erreurs.push(...tirage.erreurs);
    tables.push(tirage);
    const nom = systeme.tables.get(t.table)!.nom;
    explications.push(`${nom} : ${tirage.valeur} → ${tirage.ligne?.nom ?? 'aucune ligne'}`);
  });

  aleatoire.phase?.('fin');
  const ajuste = Boolean(bonusLibre) || (demande.ajustements?.des ?? []).some((a) => a.nombre);
  return {
    ok: true,
    resultat: {
      action: action.id,
      parametres,
      variables: Object.fromEntries(variables),
      jet: resultatJet,
      reussi,
      modifications,
      tables,
      explications,
      erreurs,
      ...(ajuste ? { ajuste } : {}),
      ...(force ? { force } : {}),
    },
    evaluer: ev,
  };
}

/** Libellé des lignes d'un ajustement libre. */
export const NOM_AJUSTEMENT = 'Ajusté à la main';

/** Source des lignes de la situation du système (`Systeme.situation.effets`). */
export const SOURCE_SITUATION = 'situation';
/** Libellé d'un effet de situation sans `description`. */
const NOM_SITUATION = 'Situation';

/** Valeur par défaut d'un paramètre (texte vide pour une entrée ou un attribut). */
/** Fin de l'aperçu : les variables connues avant le jet (voir `apercuVariables`). */
class ArretApercu {
  constructor(readonly variables: ReadonlyMap<string, Valeur>) {}
}

/** Générateur de l'aperçu : un dé n'a pas de valeur avant le jet. */
const SANS_DES: Generateur = {
  entier: () => {
    throw new ErreurEvaluation('Dé lancé pendant l’aperçu', 0);
  },
};

/**
 * Aperçu d'une action côté acteur, sans jet ni cible : paramètres (défauts compris) et
 * variables de l'action avec les effets de l'acteur et de la situation. Une variable qui
 * dépend de la cible ou d'un dé est absente. Null si la demande est refusée (paramètre
 * manquant…). Sert à écrire la formule du jet avec ses valeurs (« 2d20k1 + 5 »).
 */
export function apercuVariables(
  systeme: SystemeCharge,
  demande: Omit<DemandeAction, 'aleatoire' | 'cible' | 'forcer'>,
): ReadonlyMap<string, Valeur> | null {
  try {
    // Sans refus, l'exécution s'arrête toujours sur `ArretApercu` avant le jet
    executer(systeme, { ...demande, aleatoire: SANS_DES }, { apercu: true });
    return null;
  } catch (e) {
    if (e instanceof ArretApercu) return e.variables;
    throw e;
  }
}

export function defautParametre(p: Parametre): Valeur {
  switch (p.type) {
    case 'nombre':
    case 'booleen':
      return p.defaut;
    case 'choix':
      return defautChoix(p);
    default:
      return '';
  }
}

function bonusAjustement(valeur: number): BonusJet {
  return { source: SOURCE_AJUSTEMENT, nom: NOM_AJUSTEMENT, valeur, cote: 'acteur' };
}

/** Ligne du déroulé pour une étape de construction d'un pool. */
export function decrireEtape(e: EtapePool, nomDe: (id: string) => string): string {
  if (e.operation === 'ajouter') return `${e.nom} : ${signe(e.nombre)} ${nomDe(e.de)}`;
  if (e.operation === 'retirer') return `${e.nom} : ${signe(-e.nombre)} ${nomDe(e.de)}`;
  return `${e.nom} : ${e.nombre} ${nomDe(e.de)} → ${nomDe(e.vers!)}`;
}

/** `d20 : 17` ; dés écartés entre parenthèses, dés d'explosion suivis de « ! ». */
export function decrireJet(j: JetDes): string {
  const des = j.des.map((d) => {
    const v = `${d.valeur}${d.explosion ? '!' : ''}`;
    return d.garde ? v : `(${v})`;
  });
  return `d${j.faces} : ${des.join(', ')}`;
}
