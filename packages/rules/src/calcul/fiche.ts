/**
 * Calcul complet d'une entité : possessions effectives (rangs, marques), puis
 * attributs dans l'ordre des dépendances avec leurs effets. Chaque valeur
 * garde le détail de son calcul pour être expliquée sur la fiche.
 *
 * Le calcul ne lève jamais d'erreur pour une donnée de jeu : une formule qui
 * échoue (division par zéro…) donne 0 et une erreur listée dans `erreurs`.
 */
import type { EntiteChargee, SystemeCharge } from '../chargement/index.js';
import { chemins } from '../chargement/index.js';
import {
  ErreurEvaluation,
  evaluer,
  type ContexteEvaluation,
  type FormuleVerifiee,
  type Valeur,
} from '../formules/index.js';
import type { Attribut, Effet, Entree, EtatEntite, Possession, Sorte } from '../schema/index.js';

export type Operation =
  'base' | 'formule' | 'ajouter' | 'multiplier' | 'fixer' | 'minimum' | 'maximum' | 'borne';

export interface LigneExplication {
  /** Identifiant de l'entrée source, ou `base` / `formule`. */
  source: string;
  nom: string;
  operation: Operation;
  valeur: Valeur;
  /** Effet écarté (famille non cumulable, ou borne sans effet). */
  ignore?: boolean;
}

export interface ValeurCalculee {
  cle: string;
  valeur: Valeur;
  modificateur?: number;
  /** Bornes d'une ressource ou d'un attribut de base. */
  min?: number;
  max?: number;
  detail: LigneExplication[];
}

export interface PossessionEffective {
  entree: Entree;
  sorte: Sorte;
  /** Rang total : achetés + gratuits (effets, choix, nœuds d'arbre). */
  rang: number;
  /** Rangs achetés (enregistrés dans l'état). */
  achete: number;
  actif: boolean;
  /** Possession explicite de l'état, si elle existe. */
  possession?: Possession;
  /** D'où vient la possession ou ses rangs gratuits. */
  sources: string[];
}

export interface ErreurCalcul {
  /** Attribut ou chemin concerné. */
  ou: string;
  message: string;
}

export interface Fiche {
  systeme: SystemeCharge;
  entite: EntiteChargee;
  etat: EtatEntite;
  valeurs: Map<string, ValeurCalculee>;
  possessions: Map<string, PossessionEffective>;
  /** Marques posées, par entrée. */
  marques: Map<string, Set<string>>;
  erreurs: ErreurCalcul[];
  /** Valeur finale d'un attribut (0 / texte vide si inconnu). */
  valeur(cle: string): Valeur;
  /** Contexte d'évaluation sur cette fiche, à compléter (variables, dés, autres entités). */
  contexte(extra?: Partial<ContexteEvaluation>): ContexteEvaluation;
  /** Évalue une formule compilée sur cette fiche ; les erreurs deviennent `defaut`. */
  evaluer(f: FormuleVerifiee, extra?: Partial<ContexteEvaluation>, defaut?: Valeur): Valeur;
}

const PHASES: Operation[] = ['fixer', 'ajouter', 'multiplier', 'minimum', 'maximum'];

export function calculer(systeme: SystemeCharge, etat: EtatEntite): Fiche {
  const entite = systeme.entites.get(etat.type);
  if (!entite)
    throw new Error(`Type d’entité inconnu du système ${systeme.source.id} : ${etat.type}`);

  const erreurs: ErreurCalcul[] = [];
  const valeurs = new Map<string, ValeurCalculee>();
  const possessions = new Map<string, PossessionEffective>();
  const marques = new Map<string, Set<string>>();

  // ─── Contexte d'évaluation ────────────────────────────────────────────────

  const valeur = (cle: string): Valeur => {
    const v = valeurs.get(cle);
    if (v) return v.valeur;
    const a = entite.attributs.get(cle);
    return a && (a.nature === 'texte' || a.nature === 'choix')
      ? ''
      : a?.nature === 'booleen'
        ? false
        : 0;
  };

  // Une entrée à rangs n'est réellement possédée qu'à partir du rang 1
  const possede = (id: string) => {
    const p = possessions.get(id);
    return !!p && estEffective(p);
  };
  const rang = (id: string) => possessions.get(id)?.rang ?? 0;
  const champ = (p: PossessionEffective, c: string): Valeur | undefined => {
    const v = p.possession?.champs[c] ?? p.entree.champs[c];
    if (v !== undefined && !Array.isArray(v)) return v;
    const def = p.sorte.champs.find((x) => x.id === c);
    return def && 'defaut' in def && def.defaut !== undefined ? def.defaut : undefined;
  };

  const fonctions: Record<string, (...args: Valeur[]) => Valeur> = {
    compte: (sorte) => effectives().filter((p) => p.sorte.id === sorte).length,
    somme: (sorte, c) =>
      effectives()
        .filter((p) => p.sorte.id === sorte)
        .reduce((s, p) => s + (Number(champ(p, String(c))) || 0), 0),
    compte_actifs: (sorte) => effectives().filter((p) => p.sorte.id === sorte && p.actif).length,
    somme_actifs: (sorte, c) =>
      effectives()
        .filter((p) => p.sorte.id === sorte && p.actif)
        .reduce((s, p) => s + (Number(champ(p, String(c))) || 0), 0),
    somme_rangs: (sorte) =>
      [...possessions.values()].filter((p) => p.sorte.id === sorte).reduce((s, p) => s + p.rang, 0),
    marquee: (id, m) => marques.get(String(id))?.has(String(m)) ?? false,
    /** Étiquette d'une entrée du catalogue : `a_etiquette(arme, "hache")`. */
    a_etiquette: (id, e) =>
      systeme.entrees.get(String(id))?.etiquettes.includes(String(e)) ?? false,
  };
  function effectives(): PossessionEffective[] {
    return [...possessions.values()].filter(estEffective);
  }

  const contexte = (extra: Partial<ContexteEvaluation> = {}): ContexteEvaluation => ({
    attribut: (cle, e) => {
      if (e !== undefined) throw new ErreurEvaluation(`Entité « ${e} » absente du contexte`, 0);
      if (!entite.attributs.has(cle)) throw new ErreurEvaluation(`Attribut inconnu : ${cle}`, 0);
      return valeur(cle);
    },
    modificateur: (cle, e) => {
      if (e !== undefined) throw new ErreurEvaluation(`Entité « ${e} » absente du contexte`, 0);
      return valeurs.get(cle)?.modificateur ?? 0;
    },
    variable: (nom) => {
      throw new ErreurEvaluation(`Variable absente du contexte : ${nom}`, 0);
    },
    rang,
    possede,
    ...extra,
    fonctions: { ...fonctions, ...extra.fonctions },
  });

  const evaluerSur = (
    f: FormuleVerifiee,
    extra: Partial<ContexteEvaluation> = {},
    defaut: Valeur = 0,
    ou = f.texte,
  ): Valeur => {
    try {
      return evaluer(f.noeud, contexte(extra)).valeur;
    } catch (e) {
      if (!(e instanceof ErreurEvaluation)) throw e;
      erreurs.push({ ou, message: `${e.message} (« ${f.texte} »)` });
      return defaut;
    }
  };

  /** Variables d'un effet : rang et état de sa source, champs de la source. */
  const variablesSource =
    (p: PossessionEffective) =>
    (nom: string): Valeur => {
      if (nom === 'rang') return p.rang;
      if (nom === 'actif') return p.actif;
      if (nom.startsWith('source.')) {
        const c = nom.slice('source.'.length);
        const v = champ(p, c);
        const def = p.sorte.champs.find((x) => x.id === c);
        if (def?.type === 'formule') {
          const f = systeme.formules.get(chemins.champ(p.entree.id, c));
          return f ? evaluerSur(f, {}, 0, `${p.entree.id}/${c}`) : Number(v) || 0;
        }
        return v ?? (def?.type === 'booleen' ? false : def?.type === 'nombre' ? 0 : '');
      }
      throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
    };

  // ─── 1. Possessions effectives ────────────────────────────────────────────

  const ajouterPossession = (
    id: string,
    source: string,
    rangs: number,
    possession?: Possession,
  ): void => {
    const entree = systeme.entrees.get(id);
    const sorte = entree && systeme.sortes.get(entree.sorte);
    if (!entree || !sorte) {
      erreurs.push({ ou: `possessions/${id}`, message: `Entrée inconnue : ${id}` });
      return;
    }
    if (!sorte.pour.includes(etat.type)) {
      erreurs.push({
        ou: `possessions/${id}`,
        message: `${sorte.nom} non possédable par ${entite.type.nom}`,
      });
      return;
    }
    const existante = possessions.get(id);
    if (existante) {
      existante.rang += rangs + (possession?.rang ?? 0);
      if (possession) {
        existante.possession = possession;
        existante.achete += possession.rang;
        existante.actif = sorte.activable ? possession.actif : true;
      }
      if (!existante.sources.includes(source)) existante.sources.push(source);
      return;
    }
    possessions.set(id, {
      entree,
      sorte,
      rang: rangs + (possession?.rang ?? 0),
      achete: possession?.rang ?? 0,
      actif: sorte.activable ? (possession?.actif ?? sorte.actifParDefaut) : true,
      ...(possession ? { possession } : {}),
      sources: [source],
    });
  };

  const construirePossessions = (): void => {
    possessions.clear();
    marques.clear();
    for (const p of etat.possessions) ajouterPossession(p.entree, 'etat', 0, p);

    // Nœuds d'arbre acquis : un rang par nœud
    for (const [arbreId, ids] of Object.entries(etat.noeuds)) {
      const arbre = systeme.arbres.get(arbreId);
      if (!arbre) {
        erreurs.push({ ou: `noeuds/${arbreId}`, message: `Arbre inconnu : ${arbreId}` });
        continue;
      }
      for (const nid of ids) {
        const n = arbre.noeuds.find((x) => x.id === nid);
        if (!n) erreurs.push({ ou: `noeuds/${arbreId}`, message: `Nœud inconnu : ${nid}` });
        else ajouterPossession(n.entree, `${arbreId}/${nid}`, 1);
      }
    }

    // Choix « possession » des entrées possédées
    for (const p of [...possessions.values()]) {
      for (const c of p.entree.choix) {
        if (c.donne.type !== 'possession') continue;
        for (const id of p.possession?.choix[c.id] ?? []) ajouterPossession(id, p.entree.id, 0);
      }
    }
  };

  // Rangs gratuits et marques : peuvent donner de nouvelles possessions, qui ont
  // elles-mêmes des effets. On itère jusqu'à stabilité (borné).
  let bonus = new Map<string, { rangs: number; sources: string[] }>();
  for (let tour = 0; tour < 10; tour++) {
    construirePossessions();
    for (const [id, b] of bonus) ajouterPossession(id, b.sources.join(', '), b.rangs);

    const suivant = new Map<string, { rangs: number; sources: string[] }>();
    const donner = (id: string, rangs: number, source: string) => {
      const b = suivant.get(id) ?? { rangs: 0, sources: [] };
      b.rangs += rangs;
      if (!b.sources.includes(source)) b.sources.push(source);
      suivant.set(id, b);
    };
    const marquer = (id: string, m: string) => {
      const s = marques.get(id) ?? new Set<string>();
      s.add(m);
      marques.set(id, s);
    };

    for (const p of possessions.values()) {
      if (!p.actif || !estEffective(p)) continue;
      const vars = { variable: variablesSource(p) };
      p.entree.effets.forEach((f, i) => {
        if (f.sur !== 'rang' && f.sur !== 'marque') return;
        const cond = systeme.formules.get(chemins.effet(p.entree.id, i, 'condition'));
        if (cond && evaluerSur(cond, vars, false) !== true) return;
        if (f.sur === 'marque') return f.entrees.forEach((id) => marquer(id, f.marque));
        const v = evaluerSur(systeme.formule(chemins.effet(p.entree.id, i, 'valeur')), vars);
        donner(f.entree, Number(v), p.entree.id);
      });
      for (const c of p.entree.choix) {
        const choisis = p.possession?.choix[c.id] ?? [];
        if (c.donne.type === 'marque') {
          const m = c.donne.marque;
          choisis.forEach((id) => marquer(id, m));
        }
        if (c.donne.type === 'rang') {
          const v = Number(evaluerSur(systeme.formule(chemins.choix(p.entree.id, c.id)), vars));
          choisis.forEach((id) => donner(id, v, `${p.entree.id}/${c.id}`));
        }
      }
    }

    const stable =
      suivant.size === bonus.size &&
      [...suivant].every(([id, b]) => bonus.get(id)?.rangs === b.rangs);
    bonus = suivant;
    if (stable) break;
  }

  // ─── 2. Effets sur les attributs ──────────────────────────────────────────

  interface EffetActif {
    p: PossessionEffective;
    operation: Extract<Effet, { sur: 'attribut' }>['operation'];
    valeur: FormuleVerifiee;
    condition?: FormuleVerifiee | undefined;
    famille?: string | undefined;
    nom: string;
  }
  const effetsPar = new Map<string, EffetActif[]>();
  const pousser = (cle: string, e: EffetActif) => {
    const l = effetsPar.get(cle) ?? [];
    l.push(e);
    effetsPar.set(cle, l);
  };
  for (const p of possessions.values()) {
    if (!p.actif || !estEffective(p)) continue;
    p.entree.effets.forEach((f, i) => {
      if (f.sur !== 'attribut') return;
      pousser(f.attribut, {
        p,
        operation: f.operation,
        valeur: systeme.formule(chemins.effet(p.entree.id, i, 'valeur')),
        condition: systeme.formules.get(chemins.effet(p.entree.id, i, 'condition')),
        famille: f.famille,
        nom: f.description ?? p.entree.nom,
      });
    });
    // Choix d'attributs : un effet par attribut retenu
    for (const c of p.entree.choixAttributs) {
      const retenus = p.possession?.choix[c.id] ?? [];
      const proposes = (cle: string) => {
        const a = entite.attributs.get(cle);
        return (
          !!a &&
          (c.parmi.attributs?.includes(cle) ||
            (c.parmi.groupe !== undefined && a.groupe === c.parmi.groupe))
        );
      };
      if (retenus.length > c.nombre)
        erreurs.push({
          ou: `possessions/${p.entree.id}/${c.id}`,
          message: `${c.nom} : ${c.nombre} choix au plus`,
        });
      for (const cle of retenus.slice(0, c.nombre)) {
        if (!proposes(cle)) {
          erreurs.push({
            ou: `possessions/${p.entree.id}/${c.id}`,
            message: `${c.nom} : « ${cle} » n’est pas proposé`,
          });
          continue;
        }
        pousser(cle, {
          p,
          operation: c.operation,
          valeur: systeme.formule(chemins.choixAttribut(p.entree.id, c.id)),
          nom: `${p.entree.nom} (${c.nom})`,
        });
      }
    }
  }

  const appliquerEffets = (cle: string, depart: Valeur, detail: LigneExplication[]): Valeur => {
    const actifs: { op: Operation; v: Valeur; famille?: string; ligne: LigneExplication }[] = [];
    for (const e of effetsPar.get(cle) ?? []) {
      const vars = { variable: variablesSource(e.p) };
      if (e.condition && evaluerSur(e.condition, vars, false, cle) !== true) continue;
      const v = evaluerSur(e.valeur, vars, 0, cle);
      const ligne: LigneExplication = {
        source: e.p.entree.id,
        nom: e.nom,
        operation: e.operation,
        valeur: v,
      };
      actifs.push({ op: e.operation, v, ...(e.famille ? { famille: e.famille } : {}), ligne });
    }

    // Familles : dans une même famille et une même opération, seul le plus fort compte
    const meilleurs = new Map<string, (typeof actifs)[number]>();
    for (const a of actifs) {
      if (!a.famille) continue;
      const k = `${a.op}/${a.famille}`;
      const m = meilleurs.get(k);
      const plusFort = a.op === 'maximum' ? Number(a.v) < Number(m?.v) : Number(a.v) > Number(m?.v);
      if (!m || plusFort) meilleurs.set(k, a);
    }
    for (const a of actifs) {
      if (a.famille && meilleurs.get(`${a.op}/${a.famille}`) !== a) a.ligne.ignore = true;
    }

    let v = depart;
    for (const phase of PHASES) {
      for (const a of actifs) {
        if (a.op !== phase || a.ligne.ignore) continue;
        detail.push(a.ligne);
        if (phase === 'fixer') v = a.v;
        else if (phase === 'ajouter') v = Number(v) + Number(a.v);
        else if (phase === 'multiplier') v = Number(v) * Number(a.v);
        else if (phase === 'minimum') v = Math.max(Number(v), Number(a.v));
        else v = Math.min(Number(v), Number(a.v));
      }
    }
    detail.push(...actifs.filter((a) => a.ligne.ignore).map((a) => a.ligne));
    return v;
  };

  // ─── 3. Attributs, dans l'ordre des dépendances ───────────────────────────

  const formuleDe = (a: Attribut, c: Parameters<typeof chemins.attribut>[2]) =>
    systeme.formules.get(chemins.attribut(etat.type, a.cle, c));

  const borner = (
    v: number,
    min: number | undefined,
    max: number | undefined,
    detail: LigneExplication[],
  ): number => {
    let r = v;
    if (min !== undefined && r < min) r = min;
    if (max !== undefined && r > max) r = max;
    if (r !== v)
      detail.push({
        source: 'borne',
        nom: r === min ? 'Minimum' : 'Maximum',
        operation: 'borne',
        valeur: r,
      });
    return r;
  };

  for (const cle of entite.ordre) {
    const a = entite.attributs.get(cle)!;
    const detail: LigneExplication[] = [];
    const stocke = etat.valeurs[cle];
    const calcule: ValeurCalculee = { cle, valeur: 0, detail };

    switch (a.nature) {
      case 'base': {
        const min = formuleDe(a, 'min');
        const max = formuleDe(a, 'max');
        if (min) calcule.min = Number(evaluerSur(min, {}, 0, cle));
        if (max) calcule.max = Number(evaluerSur(max, {}, 0, cle));
        const brut = typeof stocke === 'number' ? stocke : a.defaut;
        const base = borner(brut, calcule.min, calcule.max, []);
        detail.push({ source: 'base', nom: a.nom, operation: 'base', valeur: base });
        calcule.valeur = appliquerEffets(cle, base, detail);
        break;
      }
      case 'derivee': {
        const v = evaluerSur(
          formuleDe(a, 'formule')!,
          {},
          a.type === 'nombre' ? 0 : a.type === 'booleen' ? false : '',
          cle,
        );
        detail.push({ source: 'formule', nom: a.formule, operation: 'formule', valeur: v });
        calcule.valeur = appliquerEffets(cle, v, detail);
        break;
      }
      case 'ressource': {
        // Les effets sur une ressource modifient son maximum
        const lignesMax: LigneExplication[] = [];
        const max0 = Number(evaluerSur(formuleDe(a, 'max')!, {}, 0, cle));
        lignesMax.push({
          source: 'formule',
          nom: `Maximum : ${a.max}`,
          operation: 'formule',
          valeur: max0,
        });
        const max = Number(appliquerEffets(cle, max0, lignesMax));
        const min = Number(evaluerSur(formuleDe(a, 'min')!, {}, 0, cle));
        calcule.max = max;
        calcule.min = min;
        const initiale =
          a.initiale === 'max'
            ? max
            : a.initiale === 'min'
              ? min
              : Number(evaluerSur(formuleDe(a, 'initiale')!, {}, 0, cle));
        const courante = typeof stocke === 'number' ? stocke : initiale;
        detail.push(...lignesMax);
        calcule.valeur = borner(courante, min, Math.max(min, max), detail);
        break;
      }
      case 'texte':
        calcule.valeur = appliquerEffets(
          cle,
          typeof stocke === 'string' ? stocke : a.defaut,
          detail,
        );
        break;
      case 'choix': {
        const v =
          typeof stocke === 'string' && a.options.some((o) => o.valeur === stocke)
            ? stocke
            : (a.defaut ?? '');
        calcule.valeur = appliquerEffets(cle, v, detail);
        break;
      }
      case 'booleen':
        calcule.valeur = appliquerEffets(
          cle,
          typeof stocke === 'boolean' ? stocke : a.defaut,
          detail,
        );
        break;
    }

    if (
      (a.nature === 'base' || a.nature === 'derivee') &&
      a.modificateur !== undefined &&
      a.modificateur !== false
    ) {
      const f =
        a.modificateur === true
          ? systeme.formules.get(chemins.modificateurSysteme())
          : formuleDe(a, 'modificateur');
      const v = calcule.valeur;
      if (f)
        calcule.modificateur = Number(
          evaluerSur(f, { variable: (nom) => (nom === 'valeur' ? v : 0) }, 0, cle),
        );
    }

    valeurs.set(cle, calcule);
  }

  // La construction des possessions est itérée : on ne garde chaque erreur qu'une fois
  const vues = new Set<string>();
  const uniques = erreurs.filter((e) => {
    const k = `${e.ou}\n${e.message}`;
    return !vues.has(k) && vues.add(k);
  });
  erreurs.splice(0, erreurs.length, ...uniques);

  return {
    systeme,
    entite,
    etat,
    valeurs,
    possessions,
    marques,
    erreurs,
    valeur,
    contexte,
    evaluer: (f, extra, defaut) => evaluerSur(f, extra, defaut),
  };
}

/** Possession qui compte : entrée sans rangs, ou entrée à rangs au rang 1 au moins. */
export function estEffective(p: PossessionEffective): boolean {
  return !p.sorte.rangs || p.rang > 0;
}
