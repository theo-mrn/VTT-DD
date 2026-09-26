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
import { estEffective, type Fiche, type PossessionEffective } from '../calcul/index.js';
import { reduireDegats } from './degats.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import {
  ErreurEvaluation,
  evaluer,
  LIMITES,
  type ContexteEvaluation,
  type Generateur,
  type JetDes,
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
}

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

export function executer(systeme: SystemeCharge, demande: DemandeAction): ExecutionInterne {
  const { acteur, cible, aleatoire } = demande;
  const action = systeme.actions.get(demande.action);
  if (!action) return { ok: false, erreurs: [{ message: `Action inconnue : ${demande.action}` }] };

  // ─── Validation des entités et des paramètres ─────────────────────────────

  const refus: ErreurAction[] = [];
  if (acteur.systeme !== systeme)
    refus.push({ message: 'La fiche de l’acteur a été calculée avec un autre système' });
  if (!action.pour.includes(acteur.etat.type))
    refus.push({ message: `${action.nom} n’est pas permise à ${acteur.entite.type.nom}` });
  if (action.cible) {
    if (!cible) refus.push({ message: `${action.nom} demande une cible` });
    else if (cible.systeme !== systeme)
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
      if (v !== undefined && !(p.type !== 'entree' && p.type !== 'attribut' && v === p.defaut))
        refuser(`${p.nom} : option non disponible (${exige.texte})`);
      v = undefined;
      if (p.type === 'nombre' || p.type === 'booleen') {
        parametres[p.id] = p.defaut;
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
        const entree = systeme.entrees.get(v);
        const possession = acteur.possessions.get(v);
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
              sources: [],
            },
          );
        }
        break;
      }
    }
  }
  if (refus.length) return { ok: false, erreurs: refus };

  const exige = systeme.formules.get(chemins.action(action.id, 'exige'));
  if (exige && acteur.evaluer(exige, {}, false) !== true) {
    return {
      ok: false,
      erreurs: [{ message: `${action.nom} : condition non remplie (${exige.texte})` }],
    };
  }

  // ─── Contexte d'évaluation ────────────────────────────────────────────────

  const ch = (x: string) => chemins.action(action.id, x);
  const erreurs: ErreurJet[] = [];
  const explications: string[] = [];
  const variables = new Map<string, Valeur>();

  const calculerFormule = (
    chemin: string,
    defaut: Valeur,
    ctx: ContexteEvaluation,
  ): ResultatEvaluation => {
    const f = systeme.formule(chemin);
    try {
      return evaluer(f.noeud, ctx);
    } catch (e) {
      if (!(e instanceof ErreurEvaluation)) throw e;
      erreurs.push({ ou: chemin, message: `${e.message} (« ${f.texte} »)` });
      return { valeur: defaut, jets: [] };
    }
  };

  /** Valeur d'un champ d'une possession ; un champ `formule` est évalué sur l'acteur. */
  const lireChamp = (p: PossessionEffective, c: string): Valeur => {
    const def = p.sorte.champs.find((x) => x.id === c);
    const brut = p.possession?.champs[c] ?? p.entree.champs[c];
    const v =
      brut !== undefined && !Array.isArray(brut)
        ? brut
        : def && 'defaut' in def
          ? def.defaut
          : undefined;
    if (def?.type === 'formule') {
      const chemin = chemins.champ(p.entree.id, c);
      return systeme.formules.has(chemin)
        ? Number(calculerFormule(chemin, 0, acteur.contexte()).valeur)
        : Number(v) || 0;
    }
    return v ?? (def?.type === 'booleen' ? false : def?.type === 'nombre' ? 0 : '');
  };

  const entite = (e: string): Fiche => {
    if (e === 'cible' && cible) return cible;
    throw new ErreurEvaluation(`Entité « ${e} » absente du contexte`, 0);
  };
  const lireVariable = (nom: string): Valeur => {
    const v = variables.get(nom);
    if (v === undefined) throw new ErreurEvaluation(`Variable absente du contexte : ${nom}`, 0);
    return v;
  };
  const moi = acteur.contexte();
  const ctx = acteur.contexte({
    attribut: (cle, e) =>
      e === undefined ? moi.attribut(cle) : entite(e).contexte().attribut(cle),
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
          const def = 'defaut' in c && c.defaut !== undefined ? c.defaut : undefined;
          variables.set(
            `${p.id}.${c.id}`,
            def ??
              (c.type === 'nombre' || c.type === 'formule' ? 0 : c.type === 'booleen' ? false : ''),
          );
        }
        explications.push(`${p.nom} : aucun`);
        continue;
      }
      explications.push(`${p.nom} : ${String(v)}`);
      continue;
    }
    variables.set(`${p.id}.rang`, possession.rang);
    for (const c of possession.sorte.champs) {
      if (c.type === 'entrees') continue;
      variables.set(`${p.id}.${c.id}`, lireChamp(possession, c.id));
    }
    explications.push(`${p.nom} : ${possession.entree.nom} (rang ${possession.rang})`);
  }

  // ─── Effets de jet des possessions actives ────────────────────────────────

  /** Paramètres de toutes les actions, avec leur valeur neutre quand l'action courante ne les a pas. */
  const neutres = new Map<string, Valeur>();
  for (const a of systeme.actions.values())
    for (const p of a.parametres)
      if (!neutres.has(p.id))
        neutres.set(p.id, p.type === 'nombre' ? 0 : p.type === 'booleen' ? false : '');

  /** Variables d'un effet : sa source (`rang`, `actif`, `source.x`), l'action et ses entrées. */
  const variablesEffet =
    (p: PossessionEffective) =>
    (nom: string): Valeur => {
      if (nom === 'rang') return p.rang;
      if (nom === 'actif') return p.actif;
      if (nom.startsWith('source.')) return lireChamp(p, nom.slice('source.'.length));
      if (nom === 'action') return action.id;
      // Paramètre de l’action : sa valeur, ou sa valeur neutre si l’action ne l’a pas
      if (neutres.has(nom)) return parametres[nom] ?? neutres.get(nom)!;
      // Rang et champs d'un paramètre entrée (`arme.competence`) ; neutres si l'action ne l'a pas
      const lu = variables.get(nom);
      if (lu !== undefined) return lu;
      if (nom.includes('.')) return nom.endsWith('.rang') ? 0 : '';
      throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
    };

  type AjoutJet = NonNullable<Extract<Effet, { sur: 'jet' }>['ajout']>;
  const effets: { p: PossessionEffective; ajout: AjoutJet; valeur: number; nom: string }[] = [];
  // Effets de l'acteur, puis effets défensifs de la cible (`cote: cible`)
  const porteurs: [Fiche, 'acteur' | 'cible'][] = [[acteur, 'acteur']];
  if (cible) porteurs.push([cible, 'cible']);
  for (const [fiche, cote] of porteurs)
    for (const p of fiche.possessions.values()) {
      if (!p.actif || !estEffective(p)) continue;
      const ctxEffet = fiche.contexte({ variable: variablesEffet(p) });
      p.entree.effets.forEach((f, i) => {
        if (f.sur !== 'jet' || !f.ajout) return;
        if (f.cote !== cote) return;
        if (f.actions && !f.actions.includes(action.id)) return;
        const chemin = (x: string) => chemins.effet(p.entree.id, i, x);
        for (const x of ['condition', 'si']) {
          if (!systeme.formules.has(chemin(x))) continue;
          if (calculerFormule(chemin(x), false, ctxEffet).valeur !== true) return;
        }
        const cle = 'bonus' in f.ajout ? 'bonus' : 'variable' in f.ajout ? 'ajouter' : 'nombre';
        const valeur = Number(calculerFormule(chemin(cle), 0, ctxEffet).valeur);
        effets.push({ p, ajout: f.ajout, valeur, nom: f.description ?? p.entree.nom });
      });
    }

  // ─── Variables de l'action (avec les effets qui s'y ajoutent), vérifications ─

  for (const v of action.variables) {
    let valeur = evType(ch(`variables/${v.cle}`));
    for (const e of effets) {
      if (!('variable' in e.ajout) || e.ajout.variable !== v.cle || typeof valeur !== 'number')
        continue;
      valeur += e.valeur;
      explications.push(`${e.nom} : ${signe(e.valeur)} → ${v.cle}`);
    }
    variables.set(v.cle, valeur);
    explications.push(`${v.cle} = ${String(valeur)}`);
  }

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
      if ('bonus' in e.ajout) bonus.push({ source: e.p.entree.id, nom: e.nom, valeur: e.valeur });
      else if (!('variable' in e.ajout))
        explications.push(`${e.nom} : ignoré (dés à symboles sur un jet numérique)`);
    }
    const total = valeur + bonus.reduce((s, b) => s + b.valeur, 0);
    const naturel = r.jets.reduce((s, j) => s + j.total, 0);
    variables.set('total', total);
    variables.set('naturel', naturel);

    const lire = (k: 'critique' | 'fumble' | 'reussite', defaut: boolean): boolean =>
      jet[k] === undefined ? defaut : ev(ch(`jet/${k}`), false) === true;
    reussi = lire('reussite', true);
    const critique = lire('critique', false);
    const fumble = lire('fumble', false);
    if (jet.critique !== undefined) variables.set('critique', critique);
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
    const ajouter = (source: string, nom: string, de: string, nombre: number) => {
      construction.push({ source, nom, operation: 'ajouter', de, nombre });
      pool.push({ de, nombre });
    };
    const ameliorerPool = (source: string, nom: string, de: string, vers: string, n: number) => {
      construction.push({ source, nom, operation: 'ameliorer', de, vers, nombre: n });
      pool = ameliorer(pool, de, vers, n);
    };

    jet.pool.forEach((p, i) =>
      ajouter('action', action.nom, p.de, nombreDes(ev(ch(`jet/pool/${i}`), 0))),
    );
    for (const e of effets)
      if ('de' in e.ajout) ajouter(e.p.entree.id, e.nom, e.ajout.de, nombreDes(e.valeur));
    jet.ameliorations.forEach((a, i) =>
      ameliorerPool(
        'action',
        action.nom,
        a.de,
        a.vers,
        nombreDes(ev(ch(`jet/ameliorations/${i}`), 0)),
      ),
    );
    for (const e of effets) {
      if ('ameliorer' in e.ajout)
        ameliorerPool(e.p.entree.id, e.nom, e.ajout.ameliorer, e.ajout.vers, nombreDes(e.valeur));
      else if ('bonus' in e.ajout)
        explications.push(`${e.nom} : ignoré (bonus sur un jet à symboles)`);
    }
    for (const e of effets) {
      if (!('retrograder' in e.ajout)) continue;
      const { retrograder: de, vers } = e.ajout;
      const n = nombreDes(e.valeur);
      construction.push({
        source: e.p.entree.id,
        nom: e.nom,
        operation: 'retrograder',
        de,
        vers,
        nombre: n,
      });
      pool = retrograder(pool, de, vers, n);
    }
    for (const e of effets) {
      if (!('retirer' in e.ajout)) continue;
      const de = e.ajout.retirer;
      const n = nombreDes(e.valeur);
      construction.push({ source: e.p.entree.id, nom: e.nom, operation: 'retirer', de, nombre: n });
      pool = retirer(pool, de, n);
    }

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
      explications.push(
        e.operation === 'ajouter'
          ? `${e.nom} : ${signe(e.nombre)} ${nomDe(e.de)}`
          : `${e.nom} : ${e.nombre} ${nomDe(e.de)} → ${nomDe(e.vers!)}`,
      );
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

  variables.set('reussi', reussi);
  explications.push(reussi ? 'Réussite' : 'Échec');

  // ─── Après le jet, conséquences, tables ───────────────────────────────────

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

    if ('entree' in c) {
      const rangs = Number(ev(`${ou}/rangs`, 1));
      const duree = c.duree === undefined ? undefined : Number(ev(`${ou}/duree`, 0));
      modifications.push({
        entite: c.entite,
        entree: c.entree,
        operation: c.operation,
        rangs,
        ...(duree !== undefined ? { duree } : {}),
      });
      const nomEntree = systeme.entrees.get(c.entree)?.nom ?? c.entree;
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
    if (c.typeCalcule !== undefined) {
      const t = String(ev(`${ou}/type`, ''));
      if (t && !systeme.source.typesDegats.some((x) => x.id === t)) {
        erreurs.push({ ou: `${ou}/type`, message: `Type de dégâts inconnu : ${t}` });
      } else if (t) typeDegats = t;
    }
    if (c.type !== undefined || c.typeCalcule !== undefined) {
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
      explications.push(`Dégâts (${typeNom}) : ${recus.brut} → ${recus.valeur}`);
      modifications.push({
        entite: c.entite,
        attribut: c.attribut,
        operation: c.operation,
        valeur: recus.valeur,
        ...(typeDegats ? { type: typeDegats } : {}),
        brut: recus.brut,
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
    },
    evaluer: ev,
  };
}

/** `d20 : 17` ; dés écartés entre parenthèses, dés d'explosion suivis de « ! ». */
function decrireJet(j: JetDes): string {
  const des = j.des.map((d) => {
    const v = `${d.valeur}${d.explosion ? '!' : ''}`;
    return d.garde ? v : `(${v})`;
  });
  return `d${j.faces} : ${des.join(', ')}`;
}
