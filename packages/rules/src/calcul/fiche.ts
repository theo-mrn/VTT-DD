/**
 * Calcul complet d'une entité : possessions effectives (rangs, marques), puis
 * attributs dans l'ordre des dépendances avec leurs effets. Chaque valeur
 * garde le détail de son calcul pour être expliquée sur la fiche.
 *
 * Le calcul ne lève jamais d'erreur pour une donnée de jeu : une formule qui
 * échoue (division par zéro…) donne 0 et une erreur listée dans `erreurs`.
 */
import type { EffetsCompiles, EntiteChargee, SystemeCharge } from '../chargement/index.js';
import {
  chemins,
  compilerEffets,
  formuleChamp,
  variablesObjet,
  variablesSource as variablesDeSorte,
} from '../chargement/index.js';
import {
  ErreurEvaluation,
  evaluer,
  type ContexteEvaluation,
  type FormuleVerifiee,
  type Valeur,
} from '../formules/index.js';
import {
  cleEffet,
  nomPossession,
  quantiteDe,
  sourceExemplaire,
  type Attribut,
  type BonusLibre,
  type Effet,
  type Entree,
  type EtatEntite,
  type Possession,
  type Sorte,
} from '../schema/index.js';

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
  /** Effet coupé à la main (`etat.effetsDesactives`) : listé, jamais appliqué. */
  desactive?: boolean;
}

export interface ValeurCalculee {
  cle: string;
  valeur: Valeur;
  modificateur?: number;
  /** Apport aux jets libres (attribut qui déclare `jet`) : modificateur, valeur ou formule. */
  jet?: number;
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
  /** Au moins un exemplaire actif (ou l'état par défaut d'une entrée sans possession explicite). */
  actif: boolean;
  /** Première possession explicite de l'état, si elle existe (ses choix font foi). */
  possession?: Possession;
  /**
   * Possessions explicites de l'état pour cette entrée, une par exemplaire
   * (vide si l'entrée n'est obtenue que par effet, choix ou nœud d'arbre).
   */
  exemplaires: Possession[];
  /** Somme des quantités des exemplaires (1 pour une entrée sans possession explicite). */
  quantite: number;
  /** D'où vient la possession ou ses rangs gratuits. */
  sources: string[];
}

/** Un exemplaire tel que le lisent les agrégats : ses champs, son état, sa quantité. */
export interface ExemplaireEffectif {
  possession?: Possession;
  actif: boolean;
  quantite: number;
}

/**
 * Exemplaires d'une possession effective : un par possession explicite, ou un
 * seul (quantité 1) pour une entrée obtenue par effet, choix ou nœud d'arbre.
 */
export function exemplairesDe(p: PossessionEffective): ExemplaireEffectif[] {
  if (!p.exemplaires.length) return [{ actif: p.actif, quantite: 1 }];
  return p.exemplaires.map((x) => ({
    possession: x,
    actif: p.sorte.activable ? x.actif : true,
    quantite: quantiteDe(x),
  }));
}

/**
 * Source d'effets active sur l'entité. Trois genres, un seul traitement :
 *   - `entree`     : effets du catalogue d'une entrée possédée (race, talent…) ;
 *   - `exemplaire` : effets propres à un exemplaire possédé (épée +1, bonus saisi) ;
 *   - `bonus`      : bonus libre posé sur l'entité (potion, bénédiction, MJ).
 */
export interface SourceEffets {
  /** Identifiant affiché dans les explications : `entree`, `entree#exemplaire`, `bonus:id`. */
  id: string;
  nom: string;
  genre: 'entree' | 'exemplaire' | 'bonus';
  effets: readonly Effet[];
  /** Formule compilée d'un effet (`undefined` si l'effet est invalide et ignoré). */
  formule(i: number, champ: string): FormuleVerifiee | undefined;
  /** Vrai si l'effet `i` est coupé à la main (`etat.effetsDesactives`) : il ne s'applique pas. */
  desactive(i: number): boolean;
  /** Variables de la source : `rang`, `actif`, `quantite`, `source.<champ>`. */
  variable(nom: string): Valeur;
  possession?: PossessionEffective;
  /** Exemplaire qui porte les effets (genre `exemplaire`). */
  exemplaire?: Possession;
  bonus?: BonusLibre;
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
  /** Sources d'effets actives (entrées, exemplaires, bonus libres). */
  sources: SourceEffets[];
}

/**
 * Effets propres à une entité, compilés une fois par système et par contenu :
 * le calcul est rejoué à chaque écriture, la compilation ne l'est pas.
 */
const cacheEffets = new WeakMap<SystemeCharge, Map<string, EffetsCompiles>>();
function effetsCompiles(
  systeme: SystemeCharge,
  type: string,
  prefixe: string,
  effets: readonly Effet[],
  variables: Parameters<typeof compilerEffets>[4],
): EffetsCompiles {
  let cache = cacheEffets.get(systeme);
  if (!cache) cacheEffets.set(systeme, (cache = new Map()));
  const cle = `${type}\n${prefixe}\n${JSON.stringify(effets)}`;
  let c = cache.get(cle);
  if (!c) {
    c = compilerEffets(systeme, type, effets, (i, x) => `${prefixe}/effets/${i}/${x}`, variables);
    if (cache.size > 500) cache.clear();
    cache.set(cle, c);
  }
  return c;
}

const PHASES: Operation[] = ['fixer', 'ajouter', 'multiplier', 'minimum', 'maximum'];

export function calculer(systeme: SystemeCharge, etat: EtatEntite): Fiche {
  const entite = systeme.entites.get(etat.type);
  if (!entite)
    throw new Error(`Type d’entité inconnu du système ${systeme.source.id} : ${etat.type}`);

  const erreurs: ErreurCalcul[] = [];
  const coupes = new Set(etat.effetsDesactives);
  /** Effets coupés d'une source, par position (voir `cleEffet`). */
  const desactivePour = (source: string) => (i: number) => coupes.has(cleEffet(source, i));
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
  /** Champ d'un exemplaire (par défaut, la première possession) : exemplaire, entrée, défaut. */
  const champ = (
    p: PossessionEffective,
    c: string,
    ex: Possession | undefined = p.possession,
  ): Valeur | undefined => {
    const v = ex?.champs[c] ?? p.entree.champs[c];
    if (v !== undefined && !Array.isArray(v)) return v;
    const def = p.sorte.champs.find((x) => x.id === c);
    return def && 'defaut' in def && def.defaut !== undefined ? def.defaut : undefined;
  };

  /** Exemplaires des possessions effectives d'une sorte (tous, ou les seuls actifs). */
  const exemplairesSorte = (sorte: Valeur, actifs: boolean) =>
    effectives()
      .filter((p) => p.sorte.id === sorte)
      .flatMap((p) => exemplairesDe(p).map((x) => ({ p, x })))
      .filter(({ x }) => !actifs || x.actif);
  const sommeChamp = (sorte: Valeur, c: Valeur, actifs: boolean) =>
    exemplairesSorte(sorte, actifs).reduce(
      (s, { p, x }) => s + (Number(champ(p, String(c), x.possession)) || 0) * x.quantite,
      0,
    );

  const fonctions: Record<string, (...args: Valeur[]) => Valeur> = {
    compte: (sorte) => exemplairesSorte(sorte, false).length,
    somme: (sorte, c) => sommeChamp(sorte, c, false),
    compte_actifs: (sorte) => exemplairesSorte(sorte, true).length,
    somme_actifs: (sorte, c) => sommeChamp(sorte, c, true),
    quantite: (sorte) => exemplairesSorte(sorte, false).reduce((s, { x }) => s + x.quantite, 0),
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

  /**
   * Variables d'un effet : rang, état et quantité de sa source, champs de la
   * source (ceux de l'exemplaire pour des effets propres à un exemplaire).
   */
  const variablesSource =
    (p: PossessionEffective, ex?: Possession) =>
    (nom: string): Valeur => {
      if (nom === 'rang') return p.rang;
      if (nom === 'actif') return ex ? !p.sorte.activable || ex.actif : p.actif;
      if (nom === 'quantite') return ex ? quantiteDe(ex) : p.quantite;
      if (nom.startsWith('source.')) {
        const c = nom.slice('source.'.length);
        const v = champ(p, c, ex ?? p.possession);
        const def = p.sorte.champs.find((x) => x.id === c);
        if (def?.type === 'formule') {
          // Formule propre de l'exemplaire, sinon celle de l'entrée ; elle lit les champs de l'objet
          const objet = ex ?? p.possession;
          const f = formuleChamp(systeme, p.entree, def, objet, etat.type);
          const lire = variablesObjet(
            p.entree,
            p.sorte,
            {
              rang: p.rang,
              actif: ex ? !p.sorte.activable || ex.actif : p.actif,
              quantite: ex ? quantiteDe(ex) : p.quantite,
            },
            objet,
          );
          const variable = (n: string): Valeur => {
            const x = lire(n);
            if (x === undefined) throw new ErreurEvaluation(`Variable inconnue : ${n}`, 0);
            return x;
          };
          return f ? evaluerSur(f, { variable }, 0, `${p.entree.id}/${c}`) : Number(v) || 0;
        }
        return v ?? (def?.type === 'booleen' ? false : def?.type === 'nombre' ? 0 : '');
      }
      throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
    };

  // ─── Sources d'effets ─────────────────────────────────────────────────────

  const signaler = (c: EffetsCompiles) => {
    for (const e of c.erreurs)
      erreurs.push({ ou: e.chemin, message: `Effet invalide, ignoré : ${e.message}` });
  };

  /** Effets du catalogue de l'entrée, puis effets propres à l'exemplaire. */
  const sourcesDe = (p: PossessionEffective): SourceEffets[] => {
    const variable = variablesSource(p);
    const r: SourceEffets[] = [];
    if (p.entree.effets.length) {
      r.push({
        id: p.entree.id,
        nom: p.entree.nom,
        genre: 'entree',
        effets: p.entree.effets,
        formule: (i, x) => systeme.formules.get(chemins.effet(p.entree.id, i, x)),
        desactive: desactivePour(p.entree.id),
        variable,
        possession: p,
      });
    }
    // Effets propres : une source par exemplaire actif qui en porte
    for (const ex of p.exemplaires) {
      if (!ex.effets.length || (p.sorte.activable && !ex.actif)) continue;
      const prefixe = prefixeExemplaire(ex);
      const c = effetsCompiles(systeme, etat.type, prefixe, ex.effets, variablesDeSorte(p.sorte));
      signaler(c);
      r.push({
        id: sourceExemplaire(ex),
        nom: nomSourceExemplaire(p, ex),
        genre: 'exemplaire',
        effets: ex.effets,
        formule: (i, x) => c.formules.get(`${prefixe}/effets/${i}/${x}`),
        desactive: desactivePour(sourceExemplaire(ex)),
        variable: variablesSource(p, ex),
        possession: p,
        exemplaire: ex,
      });
    }
    return r;
  };

  /** Bonus libres actifs : variables `rang` = 1 et `actif` = vrai, pas de champs. */
  const sourcesBonus = (): SourceEffets[] =>
    etat.bonus
      .filter((b) => b.actif)
      .map((b) => {
        const prefixe = `bonus/${b.id}`;
        const c = effetsCompiles(systeme, etat.type, prefixe, b.effets, {
          rang: 'nombre',
          actif: 'booleen',
        });
        signaler(c);
        return {
          id: `bonus:${b.id}`,
          nom: b.nom,
          genre: 'bonus' as const,
          effets: b.effets,
          formule: (i: number, x: string) => c.formules.get(`${prefixe}/effets/${i}/${x}`),
          desactive: desactivePour(`bonus:${b.id}`),
          variable: (nom: string): Valeur => {
            if (nom === 'rang') return 1;
            if (nom === 'actif') return true;
            throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
          },
          bonus: b,
        };
      });

  /** Toutes les sources actives : possessions actives et effectives, bonus libres actifs. */
  const sourcesActives = (): SourceEffets[] => [
    ...[...possessions.values()].filter((p) => p.actif && estEffective(p)).flatMap(sourcesDe),
    ...sourcesBonus(),
  ];

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
        // Le premier exemplaire explicite remplace l'état par défaut ; les suivants s'y ajoutent
        const actif = sorte.activable ? possession.actif : true;
        existante.actif = existante.exemplaires.length ? existante.actif || actif : actif;
        existante.quantite = existante.exemplaires.length
          ? existante.quantite + quantiteDe(possession)
          : quantiteDe(possession);
        existante.possession ??= possession;
        existante.exemplaires.push(possession);
        existante.achete += possession.rang;
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
      exemplaires: possession ? [possession] : [],
      quantite: possession ? quantiteDe(possession) : 1,
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
  erreurs.push(...erreursPossessions(systeme, etat));
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

    for (const s of sourcesActives()) {
      const vars = { variable: s.variable };
      s.effets.forEach((f, i) => {
        if ((f.sur !== 'rang' && f.sur !== 'marque') || s.desactive(i)) return;
        const cond = s.formule(i, 'condition');
        if (f.condition !== undefined && !cond) return;
        if (cond && evaluerSur(cond, vars, false) !== true) return;
        if (f.sur === 'marque') return f.entrees.forEach((id) => marquer(id, f.marque));
        const valeurF = s.formule(i, 'valeur');
        if (!valeurF) return;
        donner(f.entree, Number(evaluerSur(valeurF, vars)), s.id);
      });
    }
    for (const p of possessions.values()) {
      if (!p.actif || !estEffective(p)) continue;
      const vars = { variable: variablesSource(p) };
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
    sourceId: string;
    variable: (nom: string) => Valeur;
    operation: Extract<Effet, { sur: 'attribut' }>['operation'];
    valeur: FormuleVerifiee;
    condition?: FormuleVerifiee | undefined;
    famille?: string | undefined;
    nom: string;
    /** Coupé à la main : expliqué, pas appliqué. */
    desactive?: boolean;
  }
  const effetsPar = new Map<string, EffetActif[]>();
  const pousser = (cle: string, e: EffetActif) => {
    const l = effetsPar.get(cle) ?? [];
    l.push(e);
    effetsPar.set(cle, l);
  };
  const sources = sourcesActives();
  const rangDans = (cle: string) => entite.ordre.indexOf(cle);
  for (const s of sources) {
    s.effets.forEach((f, i) => {
      if (f.sur !== 'attribut') return;
      const valeurF = s.formule(i, 'valeur');
      const condition = s.formule(i, 'condition');
      if (!valeurF || (f.condition !== undefined && !condition)) return;
      // Un effet du catalogue est ordonné au chargement ; un effet posé sur
      // l'entité ne peut lire que des attributs calculés avant sa cible
      if (s.genre !== 'entree') {
        const lus = [...valeurF.dependances, ...(condition?.dependances ?? [])];
        const tardif = lus.find((d) => rangDans(d) >= rangDans(f.attribut));
        if (tardif) {
          erreurs.push({
            ou: s.id,
            message: `Effet ignoré : il lit @${tardif}, calculé après @${f.attribut}`,
          });
          return;
        }
      }
      pousser(f.attribut, {
        sourceId: s.id,
        variable: s.variable,
        operation: f.operation,
        valeur: valeurF,
        condition,
        famille: f.famille,
        nom: f.description ?? s.nom,
        ...(s.desactive(i) ? { desactive: true } : {}),
      });
    });
  }
  for (const p of possessions.values()) {
    if (!p.actif || !estEffective(p)) continue;
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
      const nombre = Math.max(
        0,
        Math.floor(
          Number(
            evaluerSur(systeme.formule(chemins.choixAttributNombre(p.entree.id, c.id)), {
              variable: variablesSource(p),
            }),
          ),
        ),
      );
      if (retenus.length > nombre)
        erreurs.push({
          ou: `possessions/${p.entree.id}/${c.id}`,
          message: `${c.nom} : ${nombre} choix au plus`,
        });
      for (const cle of retenus.slice(0, nombre)) {
        if (!proposes(cle)) {
          erreurs.push({
            ou: `possessions/${p.entree.id}/${c.id}`,
            message: `${c.nom} : « ${cle} » n’est pas proposé`,
          });
          continue;
        }
        pousser(cle, {
          sourceId: p.entree.id,
          variable: variablesSource(p),
          operation: c.operation,
          valeur: systeme.formule(chemins.choixAttribut(p.entree.id, c.id)),
          nom: `${p.entree.nom} (${c.nom})`,
        });
      }
    }
  }

  const appliquerEffets = (cle: string, depart: Valeur, detail: LigneExplication[]): Valeur => {
    const actifs: { op: Operation; v: Valeur; famille?: string; ligne: LigneExplication }[] = [];
    const coupees: LigneExplication[] = [];
    for (const e of effetsPar.get(cle) ?? []) {
      const vars = { variable: e.variable };
      if (e.condition && evaluerSur(e.condition, vars, false, cle) !== true) continue;
      const v = evaluerSur(e.valeur, vars, 0, cle);
      const ligne: LigneExplication = {
        source: e.sourceId,
        nom: e.nom,
        operation: e.operation,
        valeur: v,
      };
      // Coupé à la main : listé après les autres, sans compter (ni dans sa famille)
      if (e.desactive) {
        coupees.push({ ...ligne, desactive: true });
        continue;
      }
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
    detail.push(...coupees);
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
        calcule.valeur = borner(
          courante,
          min,
          a.plafonnee ? Math.max(min, max) : undefined,
          detail,
        );
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

  // ─── 4. Apport aux jets libres, une fois tous les attributs connus ────────

  for (const a of entite.attributs.values()) {
    if (!('jet' in a) || !a.jet) continue;
    const v = valeurs.get(a.cle);
    if (!v) continue;
    const apport = a.jet.apport;
    if (apport === 'modificateur') v.jet = v.modificateur ?? 0;
    else if (apport === 'valeur') v.jet = typeof v.valeur === 'number' ? v.valeur : 0;
    else {
      const f = formuleDe(a, 'jet');
      v.jet = f ? Number(evaluerSur(f, {}, 0, a.cle)) : 0;
    }
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
    sources,
  };
}

/** Nom affiché d'une source d'effets propres : nom propre de l'exemplaire, sinon son identifiant. */
export function nomSourceExemplaire(p: PossessionEffective, ex: Possession): string {
  const propre = nomPossession(p.entree, p.sorte, ex);
  if (propre !== p.entree.nom) return propre;
  return ex.exemplaire ? `${p.entree.nom} (${ex.exemplaire})` : p.entree.nom;
}

/** Préfixe des chemins d'erreur des effets propres d'un exemplaire. */
export function prefixeExemplaire(p: Pick<Possession, 'entree' | 'exemplaire'>): string {
  return p.exemplaire ? `possessions/${p.entree}#${p.exemplaire}` : `possessions/${p.entree}`;
}

/**
 * Erreurs de forme des possessions de l'état, au regard des sortes :
 * - un exemplaire (entrée, identifiant) n'apparaît qu'une fois ;
 * - plusieurs possessions d'une même entrée demandent une sorte `exemplaires`
 *   (jamais une sorte à rangs) ;
 * - une quantité demande une sorte `quantites` ;
 * - le `maximum` d'une sorte compte les exemplaires.
 *
 * Le calcul les liste dans `fiche.erreurs` sans s'arrêter ; le service
 * character refuse d'enregistrer un état qui en ajoute.
 */
export function erreursPossessions(systeme: SystemeCharge, etat: EtatEntite): ErreurCalcul[] {
  const erreurs: ErreurCalcul[] = [];
  const vus = new Set<string>();
  const parEntree = new Map<string, number>();
  const parSorte = new Map<string, number>();
  for (const p of etat.possessions) {
    const entree = systeme.entrees.get(p.entree);
    const sorte = entree && systeme.sortes.get(entree.sorte);
    if (!entree || !sorte) continue;
    const ou = `possessions/${p.entree}${p.exemplaire ? `#${p.exemplaire}` : ''}`;
    const cle = `${p.entree}#${p.exemplaire ?? ''}`;
    if (sorte.exemplaires && vus.has(cle))
      erreurs.push({
        ou,
        message: p.exemplaire
          ? `${entree.nom} : exemplaire « ${p.exemplaire} » en double`
          : `${entree.nom} : deux exemplaires sans identifiant`,
      });
    vus.add(cle);
    const n = (parEntree.get(p.entree) ?? 0) + 1;
    parEntree.set(p.entree, n);
    if (n === 2 && !sorte.exemplaires)
      erreurs.push({
        ou,
        message: sorte.rangs
          ? `${entree.nom} se possède une seule fois : ses rangs s’additionnent`
          : `${entree.nom} se possède une seule fois (${sorte.nom} sans exemplaires multiples)`,
      });
    if (p.quantite !== undefined && !sorte.quantites)
      erreurs.push({ ou, message: `${entree.nom} : pas de quantité pour la sorte ${sorte.nom}` });
    const m = (parSorte.get(sorte.id) ?? 0) + 1;
    parSorte.set(sorte.id, m);
    if (sorte.maximum !== undefined && m === sorte.maximum + 1)
      erreurs.push({
        ou,
        message: `Maximum de ${sorte.maximum} ${sorte.nomPluriel ?? sorte.nom} dépassé`,
      });
  }
  return erreurs;
}

/** Possession qui compte : entrée sans rangs, ou entrée à rangs au rang 1 au moins. */
export function estEffective(p: PossessionEffective): boolean {
  return !p.sorte.rangs || p.rang > 0;
}
