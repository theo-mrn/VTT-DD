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
  type Action,
  type Effet,
  type Entree,
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
  type PhaseDes,
  type ResultatEvaluation,
  type Valeur,
} from '../formules/index.js';
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
import { DesRequis, ParametresRequis } from './planification.js';
import { etapesAction } from './etapes.js';

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

/**
 * Exécution d'un coup. Des paramètres à choisir après le jet manquent sur une réussite (l'arme,
 * une fois la cible touchée) : refus qui les nomme ; l'exécution par étapes (`executerMulticible`
 * avec des dés planifiés) les demande au lieu de refuser.
 */
export function executerAction(systeme: SystemeCharge, demande: DemandeAction): ResultatExecution {
  try {
    const r = executer(systeme, demande);
    return r.ok ? { ok: true, resultat: r.resultat } : r;
  } catch (e) {
    if (!(e instanceof ParametresRequis)) throw e;
    const action = systeme.actions.get(demande.action);
    return {
      ok: false,
      erreurs: e.parametres.map((id) => ({
        parametre: id,
        message: `${action?.parametres.find((p) => p.id === id)?.nom ?? id} : à choisir après le jet`,
      })),
    };
  }
}

/** Valeur neutre d'un type : 0, faux, ou texte vide. */
function defautDe(t: string | undefined): Valeur {
  if (t === 'nombre') return 0;
  if (t === 'booleen') return false;
  return '';
}

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

  const prepare = preparer(systeme, action, demande, options.apercu === true);
  if (!prepare.ok) return prepare;
  const { parametres, absents, choisies, combat } = prepare;
  const bonusLibre = demande.ajustements?.bonus;
  /** `@combat.<cle>` : lu dans le contexte fourni, neutre hors combat. */
  const lireCombat = (cle: string): Valeur => {
    const v = valeurCombat(combat, cle);
    if (v === undefined) throw new ErreurEvaluation(`Valeur de combat inconnue : ${cle}`, 0);
    return v;
  };

  // ─── Contexte d'évaluation ────────────────────────────────────────────────

  /**
   * Changement de phase. Un générateur planifié (dés physiques) y lève `DesRequis` si des dés
   * de la phase finie manquent : on y joint ce qui est déjà exact (`partiel`).
   */
  const passer = (nom: PhaseDes, partiel?: () => ResultatAction) => {
    try {
      aleatoire.phase?.(nom);
    } catch (e) {
      if (e instanceof DesRequis && partiel && !e.partiel) e.partiel = partiel();
      throw e;
    }
  };

  passer('jet');
  const ch = (x: string) => chemins.action(action.id, x);
  const etapes = etapesAction(
    action,
    (x) => systeme.formules.get(x),
    recoitSituation(action) ? (systeme.source.situation?.effets ?? []) : [],
  );
  /** Pendant le jet, les paramètres choisis après lui valent leur valeur neutre. */
  let courants = parametresPendantJet(action, parametres, etapes.apres);
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
    const v = brut !== undefined && !Array.isArray(brut) ? brut : defautDeclare(def);
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
    return v ?? defautDe(def?.type);
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
    attribut: (cle, e) => {
      if (e === undefined) return moi.attribut(cle);
      if (e === ENTITE_COMBAT) return lireCombat(cle);
      return entite(e).contexte().attribut(cle);
    },
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

  /** Variables d'un paramètre ; `neutre` : un paramètre d'après le jet, pendant le jet. */
  /** Rang et champs de la possession choisie ; un champ de jet est tiré à chaque lecture. */
  const poserPossession = (p: Parametre, possession: PossessionEffective) => {
    variables.set(`${p.id}.rang`, possession.rang);
    for (const c of possession.sorte.champs) {
      if (c.type === 'entrees') continue;
      const v = lireChamp(possession, c.id);
      if (typeof v === 'function') differees.set(`${p.id}.${c.id}`, v);
      else variables.set(`${p.id}.${c.id}`, v);
    }
    explications.push(`${p.nom} : ${possession.entree.nom} (rang ${possession.rang})`);
  };
  const poserParametre = (p: Parametre, neutre: boolean) => {
    const v = neutre ? defautParametre(p) : parametres[p.id]!;
    variables.set(p.id, v);
    const possession = neutre ? undefined : choisies.get(p.id);
    if (possession) {
      poserPossession(p, possession);
      return;
    }
    if (p.type === 'entree') {
      // Entrée facultative omise : rang 0 et champs à leur valeur neutre
      for (const [cle, x] of variablesEntreeVide(systeme, p)) variables.set(cle, x);
      if (!neutre) explications.push(`${p.nom} : aucun`);
      return;
    }
    const ligne = neutre ? null : ligneParametre(p, v);
    if (ligne) explications.push(ligne);
  };
  for (const p of action.parametres) poserParametre(p, etapes.apres.has(p.id));

  // ─── Effets de jet des possessions actives ────────────────────────────────

  /** Paramètres de toutes les actions, avec leur valeur neutre quand l'action courante ne les a pas. */
  const neutres = parametresNeutres(systeme);

  /** Variables d'un effet de jet : l'action et ses paramètres (neutres s'il ne les a pas). */
  const variableJet = (nom: string): Valeur => {
    if (nom === 'action') return action.id;
    // Paramètre de l’action : sa valeur, ou sa valeur neutre si l’action ne l’a pas
    if (neutres.has(nom)) return courants[nom] ?? neutres.get(nom)!;
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
  /** Renvois des champs d'une entrée choisie : compétence d'une arme, caractéristique liée. */
  const renvoisDe = (choisie: PossessionEffective | undefined): string[] =>
    (choisie?.sorte.champs ?? []).flatMap((c) => {
      if (c.type !== 'entree' && c.type !== 'attribut') return [];
      const renvoi = valeurChamp(choisie!, c.id);
      return typeof renvoi === 'string' && renvoi ? [`${c.type}:${renvoi}`] : [];
    });
  const impliquer = () => {
    impliques.clear();
    for (const p of action.parametres) {
      const v = courants[p.id];
      if (typeof v !== 'string' || !v) continue;
      if (p.type === 'attribut') impliques.add(`attribut:${v}`);
      if (p.type !== 'entree') continue;
      impliques.add(`entree:${v}`);
      for (const x of renvoisDe(choisies.get(p.id))) impliques.add(x);
    }
  };
  impliquer();

  let effets: EffetJet[] = [];
  /** Effets de jet de l'acteur, de la cible et de la situation, lus avec les paramètres courants. */
  /** Contexte des effets d'une fiche : variables de leur source, attributs et `@combat.*`. */
  const contexteEffets = (fiche: Fiche) => {
    const attribut = attributsAvecCombat(fiche);
    return (source: SourceEffets) => fiche.contexte({ variable: variablesEffet(source), attribut });
  };
  /** Effets de jet de l'acteur, de la cible et de la situation, lus avec les paramètres courants. */
  const calculerEffets = () => {
    // Effets de l'acteur, puis effets défensifs de la cible (`cote: cible`) :
    // entrées du catalogue, exemplaires et bonus libres, par le même chemin
    const lecture: LectureEffets = { action, impliques, evaluerFormule };
    effets = effetsDe(acteur, 'acteur', lecture, contexteEffets(acteur));
    if (cible) effets.push(...effetsDe(cible, 'cible', lecture, contexteEffets(cible)));
    // Situation du système (couvert, avantage de situation…) : effets de l'action elle-même,
    // lus avec ses paramètres, la cible et le combat ; sans effet, ils ne disent rien
    if (!recoitSituation(action)) return;
    const ecartes = ecartesSituation(systeme, action);
    const ctxSituation: ContexteEvaluation = {
      ...ctx,
      variable: (nom) => ecartes.get(nom) ?? variableJet(nom),
    };
    effets.push(
      ...effetsSituation(systeme, action, impliques, (chemin, defaut) =>
        calculerFormule(chemin, defaut, ctxSituation),
      ),
    );
  };
  calculerEffets();

  // ─── Variables de l'action (avec les effets qui s'y ajoutent), vérifications ─

  const calculerVariable = (v: (typeof action.variables)[number]) => {
    const valeur = ajouterEffets(v.cle, evType(ch(`variables/${v.cle}`)), effets, explications);
    variables.set(v.cle, valeur);
    explications.push(`${v.cle} = ${String(valeur)}`);
    return valeur;
  };
  /** Variables connues avant le jet ; une variable qui dépend de la cible ou des dés n'y est pas. */
  const variablesAvantJet = () => {
    const connues = new Map<string, Valeur>(options.apercu ? variables : []);
    for (const v of action.variables) {
      if (etapes.variablesApres.has(v.cle)) continue;
      const avant = erreurs.length;
      const valeur = calculerVariable(v);
      if (erreurs.length === avant) connues.set(v.cle, valeur);
    }
    return connues;
  };
  const connues = variablesAvantJet();
  if (options.apercu) throw new ArretApercu(connues);
  const echec = action.verifications.find((_, i) => ev(ch(`verifications/${i}`), false) !== true);
  if (echec) return { ok: false, erreurs: [{ message: echec.message }] };

  // ─── Jet ──────────────────────────────────────────────────────────────────

  const jet = action.jet;
  const deroule: Deroule = { systeme, action, demande, erreurs, explications, variables, ev, ch };
  const lance =
    jet.type === 'numerique'
      ? jetNumerique(deroule, jet, calculerFormule(ch('jet/formule'), 0, ctx), effets)
      : jetSymboles(deroule, jet, effets);
  let resultatJet: JetNumeriqueResultat | JetSymbolesResultat = lance.resultat;
  let reussi = lance.reussi;

  reussi = demande.forcer?.reussi ?? reussi;
  const force = estForcee(demande.forcer);
  if (force) explications.push('Issue corrigée par le MJ');
  variables.set('reussi', reussi);
  explications.push(reussi ? 'Réussite' : 'Échec');
  const ajuste = Boolean(bonusLibre) || (demande.ajustements?.des ?? []).some((a) => a.nombre);
  const modifications: Modification[] = [];

  /** Résultat tel qu'il est à ce point de l'exécution : tout ce qui suit reste à faire. */
  const etatA = (): (() => ResultatAction) => {
    const vars = Object.fromEntries(variables);
    const mods = [...modifications];
    const nbExplications = explications.length;
    const nbErreurs = erreurs.length;
    return () => ({
      action: action.id,
      parametres,
      variables: vars,
      jet: resultatJet,
      reussi,
      modifications: mods,
      tables: [],
      explications: explications.slice(0, nbExplications),
      erreurs: erreurs.slice(0, nbErreurs),
      ...(ajuste ? { ajuste } : {}),
      ...(force ? { force } : {}),
    });
  };

  // ─── Après le jet, conséquences, tables ───────────────────────────────────

  // Dés du jet manquants : rien n'est encore exact
  passer('apres');
  const apresJet = etatA();

  // Paramètres choisis après le jet : demandés sur une réussite (l'arme, une fois la cible
  // touchée) ; sur un raté, l'étape n'existe pas et ils gardent leur valeur neutre
  const reprendreApresJet = () => {
    if (absents.length && reussi) throw new ParametresRequis(absents, apresJet());
    courants = parametres;
    for (const p of action.parametres)
      if (etapes.apres.has(p.id) && !absents.includes(p.id)) poserParametre(p, false);
    impliquer();
    calculerEffets();
    for (const v of action.variables) if (etapes.variablesApres.has(v.cle)) calculerVariable(v);
    if (
      critiqueAConfirmer(jet, resultatJet, reussi, demande) &&
      ev(ch('jet/confirmerCritique'), false) === true
    ) {
      resultatJet = { ...resultatJet, critique: true } as JetNumeriqueResultat;
      variables.set('critique', true);
      explications.push('Critique (confirmé après le jet)');
    }
  };
  if (etapes.apres.size) reprendreApresJet();
  const calculerApres = (v: (typeof action.apres)[number]) => {
    const chemin = ch(`apres/${v.cle}`);
    const r = calculerFormule(chemin, defautDe(systeme.formule(chemin).type), ctx);
    const des = r.jets.length ? ` [${r.jets.map(decrireJet).join(' ; ')}]` : '';
    explications.push(`${v.cle} = ${String(r.valeur)}${des}`);
    // Effets de jet qui s'ajoutent à cette valeur (bonus aux dégâts…)
    variables.set(v.cle, ajouterEffets(v.cle, r.valeur, effets, explications, true));
  };
  for (const v of action.apres) calculerApres(v);

  action.consequences.forEach((c, i) =>
    appliquerConsequence(deroule, c, ch(`consequences/${i}`), { acteur, cible }, modifications),
  );

  // Dés d'après le jet manquants (dégâts) : le jet et son issue sont exacts
  passer('tables', apresJet);
  const avantTables = etatA();
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

  // Dés des tables manquants : tout est exact sauf les tirages
  passer('fin', avantTables);
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

type Entites = { acteur: Fiche; cible: Fiche | undefined };

/** Refus liés aux fiches : autre système, type d'entité non permis, cible absente ou en trop. */
function refusEntites(
  systeme: SystemeCharge,
  action: Action,
  acteur: Fiche,
  cible: Fiche | undefined,
  apercu: boolean,
): ErreurAction[] {
  const refus: ErreurAction[] = [];
  // Même système d'origine ; les réglages d'options de chaque fiche sont les siens
  if (systemeRacine(acteur.systeme) !== systemeRacine(systeme))
    refus.push({ message: 'La fiche de l’acteur a été calculée avec un autre système' });
  if (!action.pour.includes(acteur.etat.type))
    refus.push({ message: `${action.nom} n’est pas permise à ${acteur.entite.type.nom}` });
  if (!action.cible) {
    if (cible) refus.push({ message: `${action.nom} ne prend pas de cible` });
    return refus;
  }
  // Aperçu : l'acteur seul, ce qui dépend de la cible reste inconnu
  if (!cible) {
    if (!apercu) refus.push({ message: `${action.nom} demande une cible` });
  } else if (systemeRacine(cible.systeme) !== systemeRacine(systeme))
    refus.push({ message: 'La fiche de la cible a été calculée avec un autre système' });
  else if (!action.cible.includes(cible.etat.type)) {
    const attendu = action.cible.map((t) => systeme.entites.get(t)?.type.nom ?? t).join(' ou ');
    refus.push({ message: `Cible invalide : ${attendu} attendu, ${cible.entite.type.nom} reçu` });
  }
  return refus;
}

/** Refus des ajustements libres : dé inconnu, nombre de dés non entier, bonus non numérique. */
function refusAjustements(
  systeme: SystemeCharge,
  action: Action,
  ajustements: Ajustements | undefined,
): ErreurAction[] {
  const refus: ErreurAction[] = [];
  const sortesDes = systeme.source.des?.sortes ?? [];
  for (const a of ajustements?.des ?? []) {
    if (action.jet.type === 'symboles' && !sortesDes.some((x) => x.id === a.de))
      refus.push({ message: `Ajustement : dé inconnu (${a.de})` });
    if (!Number.isInteger(a.nombre))
      refus.push({ message: `Ajustement : nombre de dés entier attendu` });
  }
  const bonus = ajustements?.bonus;
  if (bonus !== undefined && !Number.isFinite(bonus))
    refus.push({ message: 'Ajustement : bonus numérique attendu' });
  return refus;
}

interface ParametresLus {
  parametres: Record<string, Valeur>;
  /**
   * Paramètres choisis après le jet et pas encore fournis (l'arme, avant de savoir si on touche).
   * Dès que l'un d'eux est fourni (l'étape des dégâts, ou d'avance), les autres prennent leur
   * défaut comme à la déclaration.
   */
  absents: string[];
  /** Possessions désignées par les paramètres entrée. */
  choisies: Map<string, PossessionEffective>;
  refus: ErreurAction[];
}

/** Paramètres retenus (défauts compris) et refus des valeurs fournies. */
function lireParametres(
  systeme: SystemeCharge,
  action: Action,
  entites: Entites,
  fournis: Record<string, Valeur>,
): ParametresLus {
  const lus: ParametresLus = { parametres: {}, absents: [], choisies: new Map(), refus: [] };
  for (const cle of Object.keys(fournis)) {
    if (!action.parametres.some((p) => p.id === cle))
      lus.refus.push({ parametre: cle, message: `Paramètre inconnu : ${cle}` });
  }
  const apresFournis = action.parametres.some(
    (p) => p.etape === 'apres' && fournis[p.id] !== undefined,
  );
  for (const p of action.parametres)
    lireParametre(systeme, action, p, fournis[p.id], entites, apresFournis, lus);
  return lus;
}

function lireParametre(
  systeme: SystemeCharge,
  action: Action,
  p: Parametre,
  fourni: Valeur | undefined,
  entites: Entites,
  apresFournis: boolean,
  lus: ParametresLus,
): void {
  const refuser = (message: string) => {
    lus.refus.push({ parametre: p.id, message });
  };
  let v = fourni;
  // Paramètre réservé (option d'un talent) : ignoré s'il n'est pas proposé à l'acteur
  const exige = systeme.formules.get(chemins.action(action.id, `parametres/${p.id}/exige`));
  const decideur = p.par === 'cible' ? entites.cible : entites.acteur;
  if (exige && decideur?.evaluer(exige, {}, false) !== true) {
    if (v !== undefined && v !== defautParametre(p))
      refuser(`${p.nom} : option non disponible (${exige.texte})`);
    v = undefined;
    if (p.type !== 'attribut') {
      lus.parametres[p.id] = defautParametre(p);
      return;
    }
  }
  if (p.etape === 'apres' && !apresFournis && v === undefined) {
    lus.absents.push(p.id);
    lus.parametres[p.id] = defautParametre(p);
    return;
  }
  if (p.type === 'entree') {
    lireEntree(systeme, p, v, entites.acteur, lus, refuser);
    return;
  }
  const erreur = p.type === 'attribut' ? refusAttribut(p, v, entites.acteur) : refusValeur(p, v);
  if (erreur) refuser(erreur);
  else lus.parametres[p.id] = v ?? defautParametre(p);
}

/** Refus d'une valeur de paramètre nombre, booléen ou choix (absente : son défaut). */
function refusValeur(p: Parametre, v: Valeur | undefined): string | null {
  if (v === undefined) return null;
  if (p.type === 'nombre' && (typeof v !== 'number' || !Number.isFinite(v)))
    return `${p.nom} : nombre attendu`;
  if (p.type === 'booleen' && typeof v !== 'boolean') return `${p.nom} : booléen attendu`;
  if (p.type === 'choix' && (typeof v !== 'string' || !p.options.some((o) => o.valeur === v)))
    return `${p.nom} : option attendue (${p.options.map((o) => o.valeur).join(', ')})`;
  return null;
}

/** Refus d'un attribut choisi : il doit être proposé par le paramètre (liste ou groupe). */
function refusAttribut(
  p: Extract<Parametre, { type: 'attribut' }>,
  v: Valeur | undefined,
  acteur: Fiche,
): string | null {
  const proposes = [...acteur.entite.attributs.values()].filter(
    (x) => p.attributs?.includes(x.cle) || (p.groupe !== undefined && x.groupe === p.groupe),
  );
  if (typeof v !== 'string') return `${p.nom} : attribut attendu`;
  if (!proposes.some((x) => x.cle === v))
    return `${p.nom} : « ${v} » n’est pas proposé (${proposes.map((x) => x.cle).join(', ')})`;
  return null;
}

/** Paramètre entrée : l'entrée (ou `entree#exemplaire`) et la possession qu'il désigne. */
function lireEntree(
  systeme: SystemeCharge,
  p: Extract<Parametre, { type: 'entree' }>,
  v: Valeur | undefined,
  acteur: Fiche,
  lus: ParametresLus,
  refuser: (message: string) => void,
): void {
  if (p.facultatif && (v === undefined || v === '')) {
    lus.parametres[p.id] = '';
    return;
  }
  const sorte = systeme.sortes.get(p.sorte)?.nom ?? p.sorte;
  if (v === undefined) return refuser(`${p.nom} : ${sorte} requise`);
  if (typeof v !== 'string') return refuser(`${p.nom} : identifiant d’entrée attendu`);
  // `entree#exemplaire` : un exemplaire précis (ses champs et sa formule propres)
  const [id, exemplaire] = v.split('#', 2) as [string, string | undefined];
  const entree = systeme.entrees.get(id);
  const effective = acteur.possessions.get(id);
  const ex =
    exemplaire === undefined
      ? undefined
      : effective?.exemplaires.find((x) => (x.exemplaire ?? '') === exemplaire);
  if (exemplaire !== undefined && !ex)
    return refuser(`${p.nom} : exemplaire « ${exemplaire} » de ${entree?.nom ?? id} introuvable`);
  const possession =
    effective && ex
      ? {
          ...effective,
          possession: ex,
          actif: effective.sorte.activable ? ex.actif : true,
          quantite: quantiteDe(ex),
        }
      : effective;
  if (!entree) return refuser(`${p.nom} : entrée inconnue « ${id} »`);
  const erreur = refusEntree(p, entree, possession, sorte);
  if (erreur) return refuser(erreur);
  lus.parametres[p.id] = id;
  // Entrée non possédée mais acceptée : rang 0 (compétence jamais apprise)
  lus.choisies.set(
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

function refusEntree(
  p: Extract<Parametre, { type: 'entree' }>,
  entree: Entree,
  possession: PossessionEffective | undefined,
  sorte: string,
): string | null {
  if (entree.sorte !== p.sorte) return `${p.nom} : ${entree.nom} n’est pas ${sorte}`;
  if (p.etiquette && !entree.etiquettes.includes(p.etiquette))
    return `${p.nom} : ${entree.nom} n’a pas l’étiquette « ${p.etiquette} »`;
  if (!possession && p.possedee) return `${p.nom} : ${entree.nom} n’est pas possédée par l’acteur`;
  if (possession && !possession.actif) return `${p.nom} : ${entree.nom} n’est pas active`;
  return null;
}

type AjoutJet = NonNullable<Extract<Effet, { sur: 'jet' }>['ajout']>;

/** Effet de jet retenu (acteur, cible ou situation), avec son montant calculé. */
interface EffetJet {
  source: string;
  ajout: AjoutJet;
  valeur: number;
  nom: string;
  cote: CoteJet;
}

/** Ce que les étapes de l'exécution lisent et complètent. */
interface Deroule {
  systeme: SystemeCharge;
  action: Action;
  demande: DemandeAction;
  erreurs: ErreurJet[];
  explications: string[];
  variables: Map<string, Valeur>;
  /** Évalue une formule de l'action avec les variables courantes. */
  ev(chemin: string, defaut: Valeur): Valeur;
  /** Chemin d'une formule de l'action. */
  ch(x: string): string;
}

type JetNumerique = Extract<Action['jet'], { type: 'numerique' }>;
type JetSymboles = Extract<Action['jet'], { type: 'symboles' }>;

/** Jet numérique : formule, bonus des effets et ajustement, critique, échec critique, réussite. */
function jetNumerique(
  d: Deroule,
  jet: JetNumerique,
  r: ResultatEvaluation,
  effets: readonly EffetJet[],
): { resultat: JetNumeriqueResultat; reussi: boolean } {
  const { demande, explications, variables } = d;
  const valeur = Number(r.valeur);
  const bonus: BonusJet[] = [];
  for (const e of effets) {
    if ('bonus' in e.ajout)
      bonus.push({ source: e.source, nom: e.nom, valeur: e.valeur, cote: e.cote });
    else if (!('variable' in e.ajout))
      explications.push(`${e.nom} : ignoré (dés à symboles sur un jet numérique)`);
  }
  const bonusLibre = demande.ajustements?.bonus;
  if (bonusLibre) bonus.push(bonusAjustement(bonusLibre));
  if (demande.ajustements?.des?.length)
    explications.push('Ajustement des dés : ignoré (jet numérique)');
  const total = valeur + bonus.reduce((s, b) => s + b.valeur, 0);
  const naturel = r.jets.reduce((s, j) => s + j.total, 0);
  variables.set('total', total);
  variables.set('naturel', naturel);

  const lire = (k: 'critique' | 'fumble' | 'reussite', defaut: boolean): boolean =>
    jet[k] === undefined ? defaut : d.ev(d.ch(`jet/${k}`), false) === true;
  const reussi = lire('reussite', true);
  let critique = lire('critique', false);
  const fumble = lire('fumble', false);
  if (demande.forcer?.critique !== undefined) critique = demande.forcer.critique;
  if (jet.critique !== undefined || demande.forcer?.critique !== undefined)
    variables.set('critique', critique);
  if (jet.fumble !== undefined) variables.set('fumble', fumble);

  explications.push(
    ...expliquerNumerique({
      formule: jet.formule,
      jets: r.jets,
      valeur,
      bonus,
      total,
      critique,
      fumble,
    }),
  );

  return {
    resultat: {
      type: 'numerique',
      formule: jet.formule,
      jets: r.jets,
      valeur,
      bonus,
      total,
      naturel,
      critique,
      fumble,
    },
    reussi,
  };
}

/** Pool d'un jet à symboles : celui de l'action, puis les effets, puis l'ajustement libre. */
function construirePool(
  d: Deroule,
  jet: JetSymboles,
  effets: readonly EffetJet[],
): { construction: EtapePool[]; pool: Pool } {
  const { action } = d;
  const construction: EtapePool[] = [
    ...jet.pool.map((p, i): EtapePool => ({
      source: 'action',
      nom: action.nom,
      operation: 'ajouter',
      de: p.de,
      nombre: nombreDes(d.ev(d.ch(`jet/pool/${i}`), 0)),
      cote: 'action',
    })),
    ...etapesEffets(effets, 'ajouter'),
    ...jet.ameliorations.map((a, i): EtapePool => ({
      source: 'action',
      nom: action.nom,
      operation: 'ameliorer',
      de: a.de,
      vers: a.vers,
      nombre: nombreDes(d.ev(d.ch(`jet/ameliorations/${i}`), 0)),
      cote: 'action',
    })),
    ...etapesEffets(effets, 'ameliorer'),
    ...etapesEffets(effets, 'retrograder'),
    ...etapesEffets(effets, 'retirer'),
    ...etapesAjustement(d.demande.ajustements),
  ];
  for (const e of effets)
    if ('bonus' in e.ajout) d.explications.push(`${e.nom} : ignoré (bonus sur un jet à symboles)`);
  return { construction, pool: construction.reduce(appliquerEtape, []) };
}

/** Étapes d'une opération venues des effets de jet (dés ajoutés, améliorés, rétrogradés, retirés). */
function etapesEffets(effets: readonly EffetJet[], operation: EtapePool['operation']): EtapePool[] {
  return effets.flatMap((e): EtapePool[] => {
    const base = {
      source: e.source,
      nom: e.nom,
      operation,
      nombre: nombreDes(e.valeur),
      cote: e.cote,
    };
    const a = e.ajout;
    if (operation === 'ajouter' && 'de' in a) return [{ ...base, de: a.de }];
    if (operation === 'ameliorer' && 'ameliorer' in a)
      return [{ ...base, de: a.ameliorer, vers: a.vers }];
    if (operation === 'retrograder' && 'retrograder' in a)
      return [{ ...base, de: a.retrograder, vers: a.vers }];
    if (operation === 'retirer' && 'retirer' in a) return [{ ...base, de: a.retirer }];
    return [];
  });
}

/** Ajustements libres, après les effets : dés ajoutés ou retirés à la main. */
function etapesAjustement(ajustements: Ajustements | undefined): EtapePool[] {
  return (ajustements?.des ?? [])
    .filter((a) => a.nombre)
    .map((a) => ({
      source: SOURCE_AJUSTEMENT,
      nom: NOM_AJUSTEMENT,
      operation: a.nombre > 0 ? 'ajouter' : 'retirer',
      de: a.de,
      nombre: Math.abs(a.nombre),
      cote: 'acteur',
    }));
}

/** Pool après une étape de construction. */
function appliquerEtape(pool: Pool, e: EtapePool): Pool {
  switch (e.operation) {
    case 'ajouter':
      return [...pool, { de: e.de, nombre: e.nombre }];
    case 'ameliorer':
      return ameliorer(pool, e.de, e.vers!, e.nombre);
    case 'retrograder':
      return retrograder(pool, e.de, e.vers!, e.nombre);
    case 'retirer':
      return retirer(pool, e.de, e.nombre);
  }
}

/** Pool final, dans l'ordre des sortes du système, borné au nombre maximal de dés. */
function poolFinal(d: Deroule, brut: Pool): Pool {
  const sortes = d.systeme.source.des?.sortes ?? [];
  const rang = (id: string) => sortes.findIndex((s) => s.id === id);
  const pool = regrouperPool(brut)
    .filter((p) => p.nombre > 0)
    .sort((a, b) => rang(a.de) - rang(b.de));
  let reste: number = LIMITES.desParJet;
  if (pool.reduce((s, p) => s + p.nombre, 0) <= reste) return pool;
  d.erreurs.push({
    ou: d.ch('jet/pool'),
    message: `Trop de dés (${reste} au plus) : pool tronqué`,
  });
  return pool
    .map((p) => {
      const nombre = Math.min(p.nombre, reste);
      reste -= nombre;
      return { de: p.de, nombre };
    })
    .filter((p) => p.nombre > 0);
}

/** Jet à symboles : construction du pool, lancer, résultats et réussite. */
function jetSymboles(
  d: Deroule,
  jet: JetSymboles,
  effets: readonly EffetJet[],
): { resultat: JetSymbolesResultat; reussi: boolean } {
  const { systeme, explications, variables } = d;
  const { construction, pool: brut } = construirePool(d, jet, effets);
  if (d.demande.ajustements?.bonus)
    explications.push(`${NOM_AJUSTEMENT} : bonus ignoré (jet à symboles)`);
  const pool = poolFinal(d, brut);

  const l = lancerSymboles(systeme, pool, d.demande.aleatoire);
  d.erreurs.push(...l.erreurs);
  for (const [cle, v] of Object.entries(l.resultats)) variables.set(cle, v);
  const reussi = jet.reussite === undefined ? true : d.ev(d.ch('jet/reussite'), false) === true;

  explications.push(...expliquerSymboles(systeme, { construction, pool, ...l }));

  return {
    resultat: {
      type: 'symboles',
      construction,
      pool,
      des: l.des,
      symboles: l.symboles,
      resultats: l.resultats,
    },
    reussi,
  };
}

type Consequence = Action['consequences'][number];

/** Conséquence d'une action : entrée donnée ou retirée, ou attribut modifié (dégâts compris). */
function appliquerConsequence(
  d: Deroule,
  c: Consequence,
  ou: string,
  entites: Entites,
  modifications: Modification[],
): void {
  if (c.condition !== undefined && d.ev(`${ou}/condition`, false) !== true) return;
  const fiche = c.entite === 'cible' ? entites.cible! : entites.acteur;
  const qui = c.entite === 'cible' ? 'Cible' : 'Acteur';
  if (!('attribut' in c)) {
    consequenceEntree(d, c, ou, fiche, qui, modifications);
    return;
  }
  const valeur = Number(d.ev(`${ou}/valeur`, 0));
  const nom = fiche.entite.attributs.get(c.attribut)?.nom ?? c.attribut;
  let recue = valeur;
  if (c.type !== undefined || c.typeCalcule !== undefined || c.degats)
    recue = degatsRecus(d, c, ou, fiche, valeur, modifications);
  else
    modifications.push({ entite: c.entite, attribut: c.attribut, operation: c.operation, valeur });
  const delta = c.operation === 'ajouter' ? recue : -recue;
  const op = c.operation === 'fixer' ? `fixé à ${recue}` : signe(delta);
  d.explications.push(`${qui} : ${nom} ${op}`);
}

function consequenceEntree(
  d: Deroule,
  c: Exclude<Consequence, { attribut: string }>,
  ou: string,
  fiche: Fiche,
  qui: string,
  modifications: Modification[],
): void {
  const { systeme } = d;
  const id = c.entree ?? String(d.ev(`${ou}/entree`, ''));
  if (!id) return;
  const donnee = systeme.entrees.get(id);
  const sorte = donnee && systeme.sortes.get(donnee.sorte);
  if (!donnee || !sorte?.pour.includes(fiche.etat.type)) {
    d.erreurs.push({ ou: `${ou}/entree`, message: `Entrée impossible à donner : ${id}` });
    return;
  }
  const rangs = Number(d.ev(`${ou}/rangs`, 1));
  const duree = c.duree === undefined ? undefined : Number(d.ev(`${ou}/duree`, 0));
  modifications.push({
    entite: c.entite,
    entree: id,
    operation: c.operation,
    rangs,
    ...(duree !== undefined ? { duree } : {}),
  });
  const pendant = duree !== undefined ? ` pendant ${duree} round(s)` : '';
  d.explications.push(
    `${qui} : ${c.operation === 'donner' ? 'reçoit' : 'perd'} ${donnee.nom}${pendant}`,
  );
}

/** Type de dégâts d'une conséquence : fixe, calculé, ou celui de l'action (`degats: true`). */
function typeDegatsDe(
  d: Deroule,
  c: Extract<Consequence, { attribut: string }>,
  ou: string,
): string | undefined {
  // Type de dégâts fixe ou calculé ; un type calculé vide : dégâts non typés
  let typeDegats: string | undefined = c.type;
  let cheminType: string | undefined;
  if (c.typeCalcule !== undefined) cheminType = `${ou}/type`;
  else if (c.degats && d.action.typeDegatsCalcule !== undefined) cheminType = d.ch('typeDegats');
  if (c.degats && c.type === undefined && c.typeCalcule === undefined)
    typeDegats = d.action.typeDegats;
  if (!cheminType) return typeDegats;
  const t = String(d.ev(cheminType, ''));
  if (t && !d.systeme.source.typesDegats.some((x) => x.id === t)) {
    d.erreurs.push({ ou: cheminType, message: `Type de dégâts inconnu : ${t}` });
    return typeDegats;
  }
  return t || typeDegats;
}

/** Dégâts : résistances, immunités et vulnérabilités de l'entité touchée ; renvoie le reçu. */
function degatsRecus(
  d: Deroule,
  c: Extract<Consequence, { attribut: string }>,
  ou: string,
  fiche: Fiche,
  valeur: number,
  modifications: Modification[],
): number {
  const typeDegats = typeDegatsDe(d, c, ou);
  const minimum = c.minimum === undefined ? 0 : Number(d.ev(`${ou}/minimum`, 0));
  const recus = reduireDegats(fiche, valeur, typeDegats, c.attribut, minimum);
  const typeNom = d.systeme.source.typesDegats.find((t) => t.id === typeDegats)?.nom ?? 'non typés';
  for (const l of recus.lignes) {
    const effet = effetLimite(l.operation, l.valeur);
    d.explications.push(`${l.nom} : ${effet}${l.ignore ? ' (ignoré)' : ''}`);
  }
  const auMoins = recus.minimum !== undefined ? ` (au moins ${recus.minimum})` : '';
  d.explications.push(`Dégâts (${typeNom}) : ${recus.brut} → ${recus.valeur}${auMoins}`);
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
  return recus.valeur;
}

/** Un effet de jet vise-t-il cette action et ce qu'elle implique (entrée, attribut) ? */
function effetConcerne(
  f: { actions?: string[]; implique?: { entree?: string; attribut?: string } },
  action: string,
  impliques: ReadonlySet<string>,
): boolean {
  if (f.actions && !f.actions.includes(action)) return false;
  if (f.implique?.entree !== undefined && !impliques.has(`entree:${f.implique.entree}`))
    return false;
  return f.implique?.attribut === undefined || impliques.has(`attribut:${f.implique.attribut}`);
}

interface LectureEffets {
  action: Action;
  impliques: ReadonlySet<string>;
  evaluerFormule(
    f: FormuleVerifiee,
    chemin: string,
    defaut: Valeur,
    ctx: ContexteEvaluation,
  ): ResultatEvaluation;
}

/** Effets de jet portés par une fiche, du côté donné (acteur, ou défense de la cible). */
function effetsDe(
  fiche: Fiche,
  cote: 'acteur' | 'cible',
  l: LectureEffets,
  contexteDe: (source: SourceEffets) => ContexteEvaluation,
): EffetJet[] {
  const retenus: EffetJet[] = [];
  for (const source of fiche.sources) {
    const ctxEffet = contexteDe(source);
    source.effets.forEach((f, i) => {
      if (f.sur !== 'jet' || !f.ajout || source.desactive(i) || f.cote !== cote) return;
      if (!effetConcerne(f, l.action.id, l.impliques)) return;
      const valeur = montantEffet(source, i, f, f.ajout, ctxEffet, l);
      if (valeur === null) return;
      retenus.push({
        source: source.id,
        ajout: f.ajout,
        valeur,
        nom: f.description ?? source.nom,
        cote,
      });
    });
  }
  return retenus;
}

/** Montant d'un effet de jet, ou null si sa condition n'est pas remplie. */
function montantEffet(
  source: SourceEffets,
  i: number,
  f: Extract<Effet, { sur: 'jet' }>,
  ajout: AjoutJet,
  ctxEffet: ContexteEvaluation,
  l: LectureEffets,
): number | null {
  const ou = (x: string) => `${source.id}/effets/${i}/${x}`;
  for (const [x, declaree] of [
    ['condition', f.condition],
    ['si', f.si],
  ] as const) {
    if (declaree === undefined) continue;
    const cond = source.formule(i, x);
    if (!cond || l.evaluerFormule(cond, ou(x), false, ctxEffet).valeur !== true) return null;
  }
  const cle = cleAjout(ajout);
  const formule = source.formule(i, cle);
  if (!formule) return null;
  return Number(l.evaluerFormule(formule, ou(cle), 0, ctxEffet).valeur);
}

/**
 * Paramètres de situation écartés par l'action (`situation.sauf`) : leur valeur neutre, même si
 * l'action déclare un paramètre du même nom.
 */
function ecartesSituation(systeme: SystemeCharge, action: Action): Map<string, Valeur> {
  const ecartes = new Map<string, Valeur>();
  if (typeof action.situation !== 'object') return ecartes;
  for (const p of systeme.source.situation?.parametres ?? [])
    if (action.situation.sauf.includes(p.id)) ecartes.set(p.id, defautParametre(p));
  return ecartes;
}

/** Effets de la situation du système qui s'appliquent à l'action (montant non nul). */
function effetsSituation(
  systeme: SystemeCharge,
  action: Action,
  impliques: ReadonlySet<string>,
  calculer: (chemin: string, defaut: Valeur) => ResultatEvaluation,
): EffetJet[] {
  const retenus: EffetJet[] = [];
  (systeme.source.situation?.effets ?? []).forEach((f, i) => {
    if (!f.ajout || !effetConcerne(f, action.id, impliques)) return;
    const ou = (x: string) => chemins.situation(action.id, i, x);
    for (const x of ['condition', 'si'] as const) {
      if (f[x] !== undefined && calculer(ou(x), false).valeur !== true) return;
    }
    const valeur = Number(calculer(ou(cleAjout(f.ajout)), 0).valeur);
    if (!valeur) return;
    retenus.push({
      source: SOURCE_SITUATION,
      ajout: f.ajout,
      valeur,
      nom: f.description ?? NOM_SITUATION,
      cote: 'action',
    });
  });
  return retenus;
}

/** Refus de la demande, ou ce qu'elle fournit une fois validée (paramètres, combat). */
function preparer(
  systeme: SystemeCharge,
  action: Action,
  demande: DemandeAction,
  apercu: boolean,
):
  | { ok: false; erreurs: ErreurAction[] }
  | (Omit<ParametresLus, 'refus'> & { ok: true; combat: ContexteCombat | undefined }) {
  const { acteur, cible } = demande;
  const { refus, ...lus } = lireParametres(
    systeme,
    action,
    { acteur, cible },
    demande.parametres ?? {},
  );
  refus.unshift(...refusEntites(systeme, action, acteur, cible, apercu));
  refus.push(...refusAjustements(systeme, action, demande.ajustements));
  const lu = demande.combat === undefined ? undefined : ContexteCombat.safeParse(demande.combat);
  if (lu && !lu.success)
    refus.push({
      message: `Contexte du combat invalide : ${lu.error.issues.map((i) => i.path.join('.') || i.message).join(', ')}`,
    });
  if (refus.length) return { ok: false, erreurs: refus };
  const exige = systeme.formules.get(chemins.action(action.id, 'exige'));
  if (exige && acteur.evaluer(exige, {}, false) !== true)
    return {
      ok: false,
      erreurs: [{ message: `${action.nom} : condition non remplie (${exige.texte})` }],
    };
  return { ok: true, ...lus, combat: lu?.success ? lu.data : undefined };
}

/** Pendant le jet, les paramètres choisis après lui valent leur valeur neutre. */
function parametresPendantJet(
  action: Action,
  parametres: Record<string, Valeur>,
  apres: ReadonlySet<string>,
): Record<string, Valeur> {
  const pendant = { ...parametres };
  for (const p of action.parametres) if (apres.has(p.id)) pendant[p.id] = defautParametre(p);
  return pendant;
}

/** Paramètres de toutes les actions, avec leur valeur neutre (la première déclaration). */
function parametresNeutres(systeme: SystemeCharge): Map<string, Valeur> {
  const neutres = new Map<string, Valeur>();
  for (const p of [...systeme.actions.values()].flatMap((a) => a.parametres))
    if (!neutres.has(p.id))
      neutres.set(p.id, p.type === 'choix' ? defautChoix(p) : defautDe(p.type));
  return neutres;
}

/**
 * Effets de jet qui s'ajoutent à une variable (bonus aux dégâts…), chacun expliqué ; avec
 * `total`, l'explication donne aussi la valeur obtenue.
 */
function ajouterEffets(
  cle: string,
  depart: Valeur,
  effets: readonly EffetJet[],
  explications: string[],
  total = false,
): Valeur {
  let valeur = depart;
  for (const e of effets) {
    if (!('variable' in e.ajout) || e.ajout.variable !== cle || typeof valeur !== 'number')
      continue;
    valeur += e.valeur;
    explications.push(`${e.nom} : ${signe(e.valeur)} → ${cle}${total ? ` = ${valeur}` : ''}`);
  }
  return valeur;
}

/** Une réussite non critique dont l'action confirme le critique après le jet (et sans issue imposée). */
function critiqueAConfirmer(
  jet: Action['jet'],
  resultat: JetNumeriqueResultat | JetSymbolesResultat,
  reussi: boolean,
  demande: DemandeAction,
): resultat is JetNumeriqueResultat {
  if (jet.type !== 'numerique' || jet.confirmerCritique === undefined) return false;
  if (resultat.type !== 'numerique' || !reussi || resultat.critique) return false;
  return demande.forcer?.critique === undefined;
}

/** Variables d'une entrée facultative omise : rang 0, champs à leur défaut ou valeur neutre. */
function variablesEntreeVide(
  systeme: SystemeCharge,
  p: Extract<Parametre, { type: 'entree' }>,
): [string, Valeur][] {
  const vars: [string, Valeur][] = [[`${p.id}.rang`, 0]];
  for (const c of systeme.sortes.get(p.sorte)?.champs ?? []) {
    if (c.type === 'entrees') continue;
    const def = c.type !== 'formule' && 'defaut' in c ? c.defaut : undefined;
    vars.push([`${p.id}.${c.id}`, def ?? defautDe(c.type === 'formule' ? 'nombre' : c.type)]);
  }
  return vars;
}

/** Ligne du déroulé d'un paramètre simple ; une situation sans rien de particulier n'en a pas. */
function ligneParametre(p: Parametre, v: Valeur): string | null {
  if (p.section === 'situation' && v === defautParametre(p)) return null;
  const option = p.type === 'choix' ? p.options.find((o) => o.valeur === v)?.nom : undefined;
  return `${p.nom} : ${option ?? String(v)}`;
}

/** Issue imposée par le MJ (réussite ou critique). */
function estForcee(forcer: IssueForcee | undefined): boolean {
  return forcer?.reussi !== undefined || forcer?.critique !== undefined;
}

/** Déroulé d'un jet numérique : dés lancés, bonus, total, critique et échec critique. */
export function expliquerNumerique(
  j: Pick<
    JetNumeriqueResultat,
    'formule' | 'jets' | 'valeur' | 'bonus' | 'total' | 'critique' | 'fumble'
  >,
): string[] {
  const des = j.jets.length ? ` [${j.jets.map(decrireJet).join(' ; ')}]` : '';
  const lignes = [`Jet ${j.formule} = ${j.valeur}${des}`];
  for (const b of j.bonus) lignes.push(`${b.nom} : ${signe(b.valeur)}`);
  if (j.bonus.length) lignes.push(`Total : ${j.total}`);
  if (j.critique) lignes.push('Critique');
  if (j.fumble) lignes.push('Échec critique');
  return lignes;
}

/** Déroulé d'un jet à symboles : construction du pool, pool, symboles et résultats visibles. */
export function expliquerSymboles(
  systeme: SystemeCharge,
  j: Pick<JetSymbolesResultat, 'construction' | 'pool' | 'symboles' | 'resultats'>,
): string[] {
  const des = systeme.source.des;
  const nomDe = (id: string) => des?.sortes.find((s) => s.id === id)?.nom ?? id;
  const lignes = j.construction
    .filter((e) => e.source !== 'action' || e.operation !== 'ajouter')
    .map((e) => decrireEtape(e, nomDe));
  lignes.push(
    `Pool : ${j.pool.map((p) => `${p.nombre} × ${nomDe(p.de)}`).join(', ') || 'aucun dé'}`,
  );
  const sortis = (des?.symboles ?? []).filter((s) => (j.symboles[s.id] ?? 0) > 0);
  lignes.push(
    `Symboles : ${sortis.map((s) => `${s.nom} ${j.symboles[s.id]}`).join(', ') || 'aucun'}`,
  );
  const lus = des?.resultats.filter((r) => r.visible) ?? [];
  if (lus.length) lignes.push(lus.map((r) => `${r.nom} : ${j.resultats[r.cle] ?? 0}`).join(', '));
  return lignes;
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

/** Valeur déclarée par défaut d'un champ (absente : undefined). */
function defautDeclare(def: object | undefined): Valeur | undefined {
  return def && 'defaut' in def ? (def as { defaut?: Valeur }).defaut : undefined;
}

/** Variable d'un effet de jet qui porte le montant de son ajout. */
function cleAjout(ajout: object): 'bonus' | 'ajouter' | 'nombre' {
  if ('bonus' in ajout) return 'bonus';
  if ('variable' in ajout) return 'ajouter';
  return 'nombre';
}

/** Effet d'une limite de dégâts, lisible : immunité, ×2, −3. */
function effetLimite(operation: string, valeur: number): string {
  if (operation === 'annuler') return 'immunité';
  if (operation === 'multiplier') return `×${valeur}`;
  return `−${valeur}`;
}
