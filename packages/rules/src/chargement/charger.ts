/**
 * Chargement d'un système : validation de forme (Zod), puis de cohérence
 * (références, formules, types, cycles). Un système n'est utilisable que s'il
 * passe entièrement : toutes les erreurs sont renvoyées d'un coup, chacune
 * avec son chemin.
 */
import {
  compiler,
  nomReserve,
  type FormuleVerifiee,
  type Noeud,
  type TypeValeur,
} from '../formules/index.js';
import {
  recoitSituation,
  Systeme,
  type Achat,
  type Action,
  type Attribut,
  type JetAttribut,
  type Arbre,
  type Entree,
  type Monnaie,
  type OptionRegle,
  type Parametre,
  type Sorte,
  type Table,
  type TypeEntite,
} from '../schema/index.js';
import { etapesAction } from '../jets/etapes.js';

/** Sous-expressions d'un nœud de formule. */
function enfants(x: Noeud): Noeud[] {
  switch (x.t) {
    case 'appel':
      return x.args;
    case 'unaire':
      return [x.arg];
    case 'binaire':
      return [x.g, x.d];
    case 'si':
      return [x.condition, x.alors, x.sinon];
    case 'des':
      return x.garder ? [x.nombre, x.faces, x.garder.n] : [x.nombre, x.faces];
    default:
      return [];
  }
}

/** Type JavaScript attendu d'un champ simple. */
const TYPES_JS = { nombre: 'number', texte: 'string', booleen: 'boolean' } as const;

/** Variables d'une contrainte de tirage (« au moins un 15 », « total au plus 80 »). */
const VARIABLES_CONTRAINTE: Record<string, TypeValeur> = {
  total: 'nombre',
  min: 'nombre',
  max: 'nombre',
  nombre: 'nombre',
  pairs: 'nombre',
  impairs: 'nombre',
  somme_modificateurs: 'nombre',
};

/** Déclare une variable d'action ; un nom réservé ou déjà pris est une erreur. */
type Declarer = (nom: string, type: TypeValeur, ou: string) => void;
import { variablesFormuleChamp } from './champs.js';
import { verifierEffets, variablesSource, type ContexteEffets } from './effets.js';
import {
  AGREGATS,
  env,
  comparaisonsChoixInvalides,
  infoAttribut,
  typeAttribut,
  typeChamp,
  type Attributs,
  type OptionsEnv,
} from './environnements.js';

export interface ErreurChargement {
  chemin: string;
  message: string;
  /** Position dans la formule, pour une erreur de formule. */
  position?: number;
}

export interface EntiteChargee {
  type: TypeEntite;
  attributs: Attributs;
  /** Ordre de calcul des attributs (dépendances d'abord). */
  ordre: string[];
  /** Entrées dont les effets peuvent toucher cette entité (via leur sorte). */
  sortes: Set<string>;
}

export interface SystemeCharge {
  source: Systeme;
  entites: Map<string, EntiteChargee>;
  sortes: Map<string, Sorte>;
  entrees: Map<string, Entree>;
  achats: Map<string, Achat>;
  arbres: Map<string, Arbre>;
  actions: Map<string, Action>;
  tables: Map<string, Table>;
  monnaies: Map<string, Monnaie>;
  /** Règles optionnelles déclarées par le système. */
  options: Map<string, OptionRegle>;
  /**
   * Réglages d'une campagne pour ces options (écarts au `defaut` seulement) : vide pour
   * le système tel que chargé, rempli par `avecOptions()` pour le système d'une campagne.
   */
  optionsCampagne: Readonly<Record<string, boolean>>;
  /** Marques utilisées par au moins un effet ou un choix. */
  marques: Set<string>;
  /** Formules compilées, par chemin (voir `chemins`). */
  formules: Map<string, FormuleVerifiee>;
  /** Formule compilée à un chemin ; lève une erreur si absente (bug du moteur). */
  formule(chemin: string): FormuleVerifiee;
}

export type ResultatChargement =
  { ok: true; systeme: SystemeCharge } | { ok: false; erreurs: ErreurChargement[] };

/** Chemins des formules compilées, partagés entre le chargeur et le moteur. */
export const chemins = {
  attribut: (
    entite: string,
    cle: string,
    champ: 'formule' | 'min' | 'max' | 'initiale' | 'modificateur' | 'jet',
  ) => `entites/${entite}/${cle}/${champ}`,
  modificateurSysteme: () => 'modificateur',
  effet: (entree: string, i: number, champ: string) => `catalogue/${entree}/effets/${i}/${champ}`,
  /** Effet de règle d'un type d'entité (`entites[].effets`). */
  effetEntite: (entite: string, i: number, champ: string) =>
    `entites/${entite}/effets/${i}/${champ}`,
  exige: (entree: string) => `catalogue/${entree}/exige`,
  champ: (entree: string, champ: string) => `catalogue/${entree}/champs/${champ}`,
  choix: (entree: string, choix: string) => `catalogue/${entree}/choix/${choix}/valeur`,
  choixNombre: (entree: string, choix: string) => `catalogue/${entree}/choix/${choix}/nombre`,
  choixAttribut: (entree: string, choix: string) =>
    `catalogue/${entree}/choixAttributs/${choix}/valeur`,
  choixAttributNombre: (entree: string, choix: string) =>
    `catalogue/${entree}/choixAttributs/${choix}/nombre`,
  achat: (id: string, champ: 'cout' | 'plafond' | 'condition') => `achats/${id}/${champ}`,
  monnaie: (id: string) => `monnaies/${id}/total`,
  etape: (entite: string, etape: string, champ: string) => `creation/${entite}/${etape}/${champ}`,
  rangsMax: (sorte: string) => `sortes/${sorte}/rangs/max`,
  noeud: (arbre: string, noeud: string) => `arbres/${arbre}/${noeud}/cout`,
  resultat: (cle: string) => `des/resultats/${cle}`,
  action: (id: string, champ: string) => `actions/${id}/${champ}`,
  tri: (i: number) => `initiative/tri/${i}`,
  /** Effet de la situation (`Systeme.situation.effets`), compilé pour une action qui la reçoit. */
  situation: (action: string, i: number, champ: string) =>
    `actions/${action}/situation/effets/${i}/${champ}`,
  /** Formule « hors de combat » d'un type d'entité. */
  horsCombat: (entite: string) => `entites/${entite}/horsCombat`,
  table: (id: string) => `tables/${id}/jet`,
};

export function charger(saisi: unknown): ResultatChargement {
  const forme = Systeme.safeParse(saisi);
  if (!forme.success) {
    return {
      ok: false,
      erreurs: forme.error.issues.map((i) => ({
        chemin: i.path.map(String).join('/'),
        message: i.message,
      })),
    };
  }
  return new Chargeur(forme.data).charger();
}

class Chargeur {
  private readonly erreurs: ErreurChargement[] = [];
  private readonly formules = new Map<string, FormuleVerifiee>();
  private readonly entites = new Map<string, EntiteChargee>();
  private sortes = new Map<string, Sorte>();
  private entrees = new Map<string, Entree>();
  private achats = new Map<string, Achat>();
  private arbres = new Map<string, Arbre>();
  private actions = new Map<string, Action>();
  private tables = new Map<string, Table>();
  private monnaies = new Map<string, Monnaie>();
  private options = new Map<string, OptionRegle>();
  private readonly marques = new Set<string>();
  private symboles = new Set<string>();
  private sortesDes = new Set<string>();
  private typesDegats = new Set<string>();

  constructor(private readonly s: Systeme) {}

  charger(): ResultatChargement {
    this.indexer();
    this.verifierEntites();
    // Les dés d'abord : les effets de jet du catalogue y font référence
    this.verifierDes();
    this.verifierSortesEtCatalogue();
    this.verifierProgression();
    this.verifierArbres();
    this.verifierActions();
    this.verifierTables();
    this.verifierRencontres();
    this.calculerOrdres();

    if (this.erreurs.length) return { ok: false, erreurs: this.erreurs };
    const formules = this.formules;
    return {
      ok: true,
      systeme: {
        source: this.s,
        entites: this.entites,
        sortes: this.sortes,
        entrees: this.entrees,
        achats: this.achats,
        arbres: this.arbres,
        actions: this.actions,
        tables: this.tables,
        monnaies: this.monnaies,
        options: this.options,
        optionsCampagne: {},
        marques: this.marques,
        formules,
        formule(chemin) {
          const f = formules.get(chemin);
          if (!f) throw new Error(`Formule absente : ${chemin}`);
          return f;
        },
      },
    };
  }

  // ─── Outils ────────────────────────────────────────────────────────────────

  private erreur(chemin: string, message: string, position?: number): void {
    this.erreurs.push(position === undefined ? { chemin, message } : { chemin, message, position });
  }

  /** Compile une formule, l'enregistre sous son chemin et signale ses erreurs. */
  private compiler(
    chemin: string,
    texte: string,
    o: OptionsEnv,
    attendu?: TypeValeur,
  ): FormuleVerifiee | null {
    const r = compiler(
      texte,
      env({ entree: (id) => this.entrees.has(id), option: (id) => this.options.has(id), ...o }),
      attendu,
    );
    if (!r.ok) {
      for (const e of r.erreurs) this.erreur(chemin, e.message, e.position);
      return null;
    }
    this.verifierLitteraux(chemin, r.formule.noeud);
    if (o.choix?.size)
      for (const e of comparaisonsChoixInvalides(r.formule.noeud, o.choix))
        this.erreur(chemin, e.message, e.position);
    this.formules.set(chemin, r.formule);
    return r.formule;
  }

  /** Vérifie les arguments littéraux des fonctions d'agrégat (sorte, champ, marque existants). */
  private verifierLitteraux(chemin: string, n: Noeud): void {
    if (n.t === 'appel') this.verifierAppel(chemin, n);
    for (const x of enfants(n)) this.verifierLitteraux(chemin, x);
  }

  private verifierAppel(chemin: string, x: Extract<Noeud, { t: 'appel' }>): void {
    const lit = x.args.map((a) => (a.t === 'texte' ? a.v : null));
    if (AGREGATS.includes(x.fn)) this.verifierAgregat(chemin, x, lit);
    if (x.fn === 'marquee') {
      if (lit[0] != null && !this.entrees.has(lit[0]))
        this.erreur(chemin, `Entrée inconnue : ${lit[0]}`, x.pos);
      if (lit[1] != null && !this.marques.has(lit[1]))
        this.erreur(chemin, `Marque jamais posée : ${lit[1]}`, x.pos);
    }
    if (x.fn === 'marque' && lit[0] != null && !this.marques.has(lit[0])) {
      this.erreur(chemin, `Marque jamais posée : ${lit[0]}`, x.pos);
    }
  }

  /** Agrégat sur une sorte : sorte connue ; une somme porte sur un champ numérique. */
  private verifierAgregat(
    chemin: string,
    x: Extract<Noeud, { t: 'appel' }>,
    lit: (string | null)[],
  ): void {
    const [nomSorte, nomChamp] = lit;
    if (nomSorte == null) return;
    const sorte = this.sortes.get(nomSorte);
    if (!sorte) return this.erreur(chemin, `Sorte inconnue : ${nomSorte}`, x.pos);
    if ((x.fn !== 'somme' && x.fn !== 'somme_actifs') || nomChamp == null) return;
    const champ = sorte.champs.find((c) => c.id === nomChamp);
    if (!champ || (champ.type !== 'nombre' && champ.type !== 'booleen')) {
      this.erreur(chemin, `Champ numérique inconnu sur ${sorte.id} : ${nomChamp}`, x.pos);
    }
  }

  private unique<T>(
    liste: T[],
    id: (t: T) => string,
    chemin: string,
    quoi: string,
  ): Map<string, T> {
    const m = new Map<string, T>();
    for (const x of liste) {
      const k = id(x);
      if (m.has(k)) this.erreur(chemin, `${quoi} en double : ${k}`);
      m.set(k, x);
    }
    return m;
  }

  private attributsDe(types: string[]): Attributs[] {
    return types.map((t) => this.entites.get(t)?.attributs).filter((a): a is Attributs => !!a);
  }

  /** Règle optionnelle citée par un attribut, un champ ou un bloc : elle doit être déclarée. */
  private verifierOption(chemin: string, option: string | undefined): void {
    if (option !== undefined && !this.options.has(option))
      this.erreur(`${chemin}/option`, `Option inconnue : ${option}`);
  }

  private verifierTypes(chemin: string, types: string[]): void {
    for (const t of types)
      if (!this.entites.has(t)) this.erreur(chemin, `Type d’entité inconnu : ${t}`);
  }

  // ─── Index ─────────────────────────────────────────────────────────────────

  private indexer(): void {
    const s = this.s;
    for (const e of this.unique(s.entites, (e) => e.id, 'entites', 'Type d’entité').values()) {
      const attributs = this.unique(e.attributs, (a) => a.cle, `entites/${e.id}`, 'Attribut');
      this.entites.set(e.id, { type: e, attributs, ordre: [], sortes: new Set() });
    }
    this.sortes = this.unique(s.sortes, (x) => x.id, 'sortes', 'Sorte');
    this.entrees = this.unique(s.catalogue, (x) => x.id, 'catalogue', 'Entrée');
    this.achats = this.unique(s.achats, (x) => x.id, 'achats', 'Achat');
    this.arbres = this.unique(s.arbres, (x) => x.id, 'arbres', 'Arbre');
    this.actions = this.unique(s.actions, (x) => x.id, 'actions', 'Action');
    this.tables = this.unique(s.tables, (x) => x.id, 'tables', 'Table');
    this.monnaies = this.unique(s.monnaies, (x) => x.id, 'monnaies', 'Monnaie');
    this.options = this.unique(s.options, (x) => x.id, 'options', 'Option');
    this.unique(s.textes, (x) => x.id, 'textes', 'Texte');
    this.typesDegats = new Set(
      this.unique(s.typesDegats, (x) => x.id, 'typesDegats', 'Type de dégâts').keys(),
    );
    this.unique(s.creation, (x) => x.entite, 'creation', 'Création');

    // Les marques sont déclarées par leur usage : un effet ou un choix qui les pose
    for (const e of s.catalogue) {
      for (const f of e.effets) if (f.sur === 'marque') this.marques.add(f.marque);
      for (const c of e.choix) if (c.donne.type === 'marque') this.marques.add(c.donne.marque);
    }
    for (const sorte of s.sortes) {
      for (const t of sorte.pour) this.entites.get(t)?.sortes.add(sorte.id);
    }
    this.fusionnerSituation();
  }

  /**
   * Paramètres de la situation (`Systeme.situation`) ajoutés à chaque action à cible, après
   * les siens, rangés `section: situation` : le reste du chargement, le moteur, le front et
   * les services les voient comme des paramètres ordinaires de l'action.
   */
  /** L'action reçoit ce paramètre de situation, sauf si elle déclare déjà le même. */
  private recoitParametre(chemin: string, a: Action, id: string): boolean {
    if (!a.parametres.some((x) => x.id === id)) return true;
    this.erreur(
      `${chemin}/parametres/${id}`,
      'Paramètre déjà déclaré par la situation du système (l’écarter par situation.sauf)',
    );
    return false;
  }

  private fusionnerSituation(): void {
    const situation = this.s.situation;
    const communs = situation?.parametres ?? [];
    if (situation) this.unique(communs, (p) => p.id, 'situation/parametres', 'Paramètre');
    situation?.effets.forEach((f, i) => {
      if (f.cote === 'cible')
        this.erreur(`situation/effets/${i}/cote`, 'Un effet de situation ne vient d’aucun porteur');
      for (const x of f.actions ?? [])
        if (!this.actions.get(x)?.cible)
          this.erreur(`situation/effets/${i}/actions`, `Action à cible inconnue : ${x}`);
    });
    for (const [id, a] of this.actions) {
      const chemin = `actions/${id}`;
      const sauf = typeof a.situation === 'object' ? a.situation.sauf : [];
      for (const x of sauf)
        if (!communs.some((p) => p.id === x))
          this.erreur(`${chemin}/situation`, `Paramètre de situation inconnu : ${x}`);
      if (!a.cible || a.situation === false || !communs.length) continue;
      const recus = communs
        .filter((p) => !sauf.includes(p.id) && this.recoitParametre(chemin, a, p.id))
        .map((p) => ({ ...p, section: 'situation' as const }));
      this.actions.set(id, { ...a, parametres: [...a.parametres, ...recus] });
    }
  }

  // ─── Entités et attributs ──────────────────────────────────────────────────

  private verifierAttribut(
    id: string,
    a: Attribut,
    groupes: ReadonlySet<string>,
    moi: OptionsEnv,
  ): void {
    const ou = `entites/${id}/${a.cle}`;
    const ch = (c: Parameters<typeof chemins.attribut>[2]) => chemins.attribut(id, a.cle, c);
    if (a.groupe && !groupes.has(a.groupe)) this.erreur(ou, `Groupe inconnu : ${a.groupe}`);
    this.verifierOption(ou, a.option);

    this.verifierNature(ou, a, moi, ch);
    if (a.nature === 'base' || a.nature === 'derivee') this.verifierModificateur(ou, a, moi, ch);
    if ('jet' in a && a.jet) this.verifierJet(id, a, a.jet, moi);
  }

  /** Formules propres à la nature d'un attribut (bornes, formule, ressource, défaut d'un choix). */
  private verifierNature(
    ou: string,
    a: Attribut,
    moi: OptionsEnv,
    ch: (c: Parameters<typeof chemins.attribut>[2]) => string,
  ): void {
    switch (a.nature) {
      case 'base':
        if (a.min !== undefined) this.compiler(ch('min'), a.min, moi, 'nombre');
        if (a.max !== undefined) this.compiler(ch('max'), a.max, moi, 'nombre');
        break;
      case 'derivee':
        this.compiler(ch('formule'), a.formule, moi, a.type);
        break;
      case 'ressource':
        this.compiler(ch('max'), a.max, moi, 'nombre');
        this.compiler(ch('min'), a.min, moi, 'nombre');
        if (a.initiale !== 'max' && a.initiale !== 'min')
          this.compiler(ch('initiale'), a.initiale, moi, 'nombre');
        break;
      case 'choix':
        if (a.defaut && !a.options.some((o) => o.valeur === a.defaut))
          this.erreur(ou, `Valeur par défaut hors des options : ${a.defaut}`);
        break;
    }
  }

  /** Modificateur d'un attribut numérique : celui du système (`true`) ou sa propre formule. */
  private verifierModificateur(
    ou: string,
    a: Extract<Attribut, { nature: 'base' | 'derivee' }>,
    moi: OptionsEnv,
    ch: (c: 'modificateur') => string,
  ): void {
    if (a.modificateur === undefined || a.modificateur === false) return;
    if (a.nature === 'derivee' && a.type !== 'nombre')
      return this.erreur(ou, 'Seul un attribut numérique peut avoir un modificateur');
    if (a.modificateur !== true) {
      this.compiler(
        ch('modificateur'),
        a.modificateur,
        { ...moi, variables: { valeur: 'nombre' } },
        'nombre',
      );
      return;
    }
    if (this.s.modificateur === undefined)
      this.erreur(ou, 'modificateur: true sans formule de modificateur dans le système');
  }

  private verifierEntites(): void {
    const s = this.s;
    if (s.modificateur !== undefined) {
      this.compiler(
        chemins.modificateurSysteme(),
        s.modificateur,
        { variables: { valeur: 'nombre' } },
        'nombre',
      );
    }

    for (const [id, e] of this.entites) {
      const groupes = new Set(e.type.groupes.map((g) => g.id));
      const moi = { entite: [e.attributs] };
      for (const a of e.attributs.values()) this.verifierAttribut(id, a, groupes, moi);
      if (e.type.horsCombat !== undefined)
        this.compiler(chemins.horsCombat(id), e.type.horsCombat, moi, 'booleen');
    }
  }

  /**
   * Apport d'un attribut aux jets libres : son modificateur (il doit en avoir un), sa valeur
   * (numérique) ou une formule numérique sans dé qui ne lit que les attributs de l'entité.
   */
  private verifierJet(entite: string, a: Attribut, jet: JetAttribut, moi: OptionsEnv): void {
    const chemin = `entites/${entite}/${a.cle}/jet`;
    const apport = jet.apport;
    if (apport === 'modificateur') {
      if (!infoAttribut(a).modificateur)
        this.erreur(chemin, 'Apport « modificateur » sur un attribut sans modificateur');
    } else if (apport === 'valeur') {
      if (typeAttribut(a) !== 'nombre')
        this.erreur(chemin, 'Apport « valeur » sur un attribut non numérique');
    } else {
      // Le terme est repris tel quel dans les formules du lanceur, que le service de dés
      // évalue avec les seules valeurs et modificateurs : ni possessions, ni agrégats
      const cheminFormule = chemins.attribut(entite, a.cle, 'jet');
      const f = this.compiler(cheminFormule, apport, { ...moi, sansAgregats: true }, 'nombre');
      if (f?.entrees.size)
        this.erreur(cheminFormule, 'rang() et possede() ne sont pas permis dans l’apport d’un jet');
    }
  }

  // ─── Sortes et catalogue ───────────────────────────────────────────────────

  private verifierSorte(sorte: Sorte): void {
    const chemin = `sortes/${sorte.id}`;
    this.verifierTypes(chemin, sorte.pour);
    this.unique(sorte.champs, (c) => c.id, chemin, 'Champ');
    for (const c of sorte.champs) this.verifierChampSorte(`${chemin}/${c.id}`, c);
    // Nom et description propres d'un exemplaire : champs texte de la sorte
    for (const [cle, id] of [
      ['nomExemplaire', sorte.nomExemplaire],
      ['descriptionExemplaire', sorte.descriptionExemplaire],
    ] as const) {
      if (id !== undefined && sorte.champs.find((c) => c.id === id)?.type !== 'texte')
        this.erreur(`${chemin}/${cle}`, `Champ texte attendu : ${id}`);
    }
    if (!sorte.rangs) return;
    if (sorte.exemplaires)
      this.erreur(
        `${chemin}/exemplaires`,
        'Une entrée à rangs ne se possède qu’une fois : ses rangs s’additionnent',
      );
    if (sorte.quantites)
      this.erreur(`${chemin}/quantites`, 'Une entrée à rangs n’a pas de quantité');
    this.compiler(
      chemins.rangsMax(sorte.id),
      sorte.rangs.max,
      { entite: this.attributsDe(sorte.pour) },
      'nombre',
    );
  }

  /** Champ d'une sorte : option, sorte ou entité visée connue, options d'un choix. */
  private verifierChampSorte(ou: string, c: Sorte['champs'][number]): void {
    this.verifierOption(ou, c.option);
    if ((c.type === 'entree' || c.type === 'entrees') && !this.sortes.has(c.sorte))
      this.erreur(ou, `Sorte inconnue : ${c.sorte}`);
    if (c.type === 'attribut' && !this.entites.has(c.entite))
      this.erreur(ou, `Type d’entité inconnu : ${c.entite}`);
    if (c.type !== 'choix') return;
    this.unique(c.options, (o) => o.valeur, ou, 'Option');
    if (c.defaut !== undefined && !c.options.some((o) => o.valeur === c.defaut))
      this.erreur(ou, `Option par défaut inconnue : ${c.defaut}`);
  }

  private verifierSortesEtCatalogue(): void {
    for (const sorte of this.sortes.values()) this.verifierSorte(sorte);

    for (const e of this.entrees.values()) this.verifierEntree(e);

    // Effets de règle des types d'entité : mêmes vérifications, sans variables de source
    for (const [id, e] of this.entites)
      verifierEffets(
        this.contexteEffets(),
        e.type.effets,
        (i, x) => chemins.effetEntite(id, i, x),
        [e.attributs],
        {},
      );
  }

  /** Attributs proposés (liste ou groupe) : numériques et connus de chaque type d'entité. */
  private verifierAttributsProposes(
    ou: string,
    types: readonly string[],
    parmi: { attributs?: string[]; groupe?: string },
  ): void {
    if (!parmi.attributs && !parmi.groupe)
      this.erreur(ou, 'Préciser les attributs ou le groupe proposés');
    for (const t of types) {
      const e = this.entites.get(t);
      if (!e) continue;
      if (parmi.groupe && !e.type.groupes.some((g) => g.id === parmi.groupe)) {
        this.erreur(ou, `Groupe inconnu de ${t} : ${parmi.groupe}`);
      }
      for (const cle of parmi.attributs ?? []) {
        const attr = e.attributs.get(cle);
        if (!attr || typeAttribut(attr) !== 'nombre')
          this.erreur(ou, `Attribut numérique inconnu de ${t} : ${cle}`);
      }
    }
  }

  /** Valeur d'un champ d'une entrée : champ déclaré par la sorte, valeur de son type. */
  private verifierChampEntree(
    e: Entree,
    sorte: Sorte,
    porteurs: Attributs[],
    cle: string,
    v: unknown,
  ): void {
    const c = sorte.champs.find((x) => x.id === cle);
    const ch = `catalogue/${e.id}/champs/${cle}`;
    if (!c) return this.erreur(ch, `Champ inconnu pour la sorte ${sorte.id}`);
    if (c.type === 'formule') {
      if (typeof v !== 'string' && typeof v !== 'number')
        return this.erreur(ch, 'Formule attendue');
      this.compiler(
        chemins.champ(e.id, cle),
        String(v),
        { entite: porteurs, variables: variablesFormuleChamp(sorte), des: c.des === true },
        'nombre',
      );
      return;
    }
    if (c.type === 'entrees') {
      if (!Array.isArray(v)) return this.erreur(ch, 'Liste d’entrées attendue');
      for (const x of v)
        if (this.entrees.get(x)?.sorte !== c.sorte)
          this.erreur(ch, `Entrée de sorte ${c.sorte} attendue : ${x}`);
      return;
    }
    const erreur = this.refusValeurChamp(c, v);
    if (erreur) this.erreur(ch, erreur);
  }

  /** Refus d'une valeur de champ non formule (type, attribut, entrée, option ou liste). */
  private refusValeurChamp(c: Sorte['champs'][number], v: unknown): string | null {
    switch (c.type) {
      case 'nombre':
      case 'texte':
      case 'booleen':
        return typeof v === TYPES_JS[c.type] ? null : `${c.type} attendu`;
      case 'attribut':
        return typeof v === 'string' && this.entites.get(c.entite)?.attributs.has(v)
          ? null
          : `Attribut inconnu de ${c.entite} : ${String(v)}`;
      case 'entree':
        return typeof v === 'string' && this.entrees.get(v)?.sorte === c.sorte
          ? null
          : `Entrée de sorte ${c.sorte} attendue : ${String(v)}`;
      case 'choix':
        return typeof v === 'string' && c.options.some((o) => o.valeur === v)
          ? null
          : `Option attendue (${c.options.map((o) => o.valeur).join(', ')}) : ${String(v)}`;
      default:
        return null;
    }
  }

  /** Choix d'entrées d'une entrée : sorte connue, entrées proposées de cette sorte, rangs. */
  private verifierChoixEntree(
    e: Entree,
    c: Entree['choix'][number],
    ch: string,
    porteurs: Attributs[],
  ): void {
    if (!this.sortes.has(c.parmi.sorte)) this.erreur(ch, `Sorte inconnue : ${c.parmi.sorte}`);
    this.compiler(chemins.choixNombre(e.id, c.id), c.nombre, { entite: porteurs }, 'nombre');
    for (const x of c.parmi.entrees ?? []) {
      if (this.entrees.get(x)?.sorte !== c.parmi.sorte)
        this.erreur(ch, `Entrée de sorte ${c.parmi.sorte} attendue : ${x}`);
    }
    if (c.donne.type !== 'rang') return;
    if (!this.sortes.get(c.parmi.sorte)?.rangs)
      this.erreur(ch, `${c.parmi.sorte} ne se possède pas par rangs`);
    this.compiler(chemins.choix(e.id, c.id), c.donne.valeur, {}, 'nombre');
  }

  private verifierEntree(e: Entree): void {
    const chemin = `catalogue/${e.id}`;
    const sorte = this.sortes.get(e.sorte);
    if (!sorte) return this.erreur(chemin, `Sorte inconnue : ${e.sorte}`);
    const porteurs = this.attributsDe(sorte.pour);

    // Champs : existence et type des valeurs
    for (const [cle, v] of Object.entries(e.champs))
      this.verifierChampEntree(e, sorte, porteurs, cle, v);

    // Entrée générique d'objets hors catalogue : chaque exemplaire se nomme lui-même
    if (e.libre && !sorte.exemplaires)
      this.erreur(`${chemin}/libre`, `La sorte ${sorte.id} n’admet pas d’exemplaires`);
    if (e.libre && !sorte.nomExemplaire)
      this.erreur(`${chemin}/libre`, `La sorte ${sorte.id} ne déclare pas nomExemplaire`);

    // Défaut d'un champ formule de la sorte : compilé pour chaque entrée qui ne le redéfinit pas
    for (const c of sorte.champs) {
      if (c.type !== 'formule' || c.defaut === undefined || c.id in e.champs) continue;
      this.compiler(
        chemins.champ(e.id, c.id),
        c.defaut,
        { entite: porteurs, variables: variablesFormuleChamp(sorte), des: c.des === true },
        'nombre',
      );
    }

    // Effets de l'entrée : même vérification que les effets posés sur un personnage
    verifierEffets(
      this.contexteEffets(),
      e.effets,
      (i, x) => chemins.effet(e.id, i, x),
      porteurs,
      variablesSource(sorte),
    );

    // Les choix d'entrées et d'attributs partagent l'espace `possession.choix`
    this.unique([...e.choix, ...e.choixAttributs], (c) => c.id, `${chemin}/choix`, 'Choix');
    for (const c of e.choixAttributs) {
      const ch = `${chemin}/choixAttributs/${c.id}`;
      this.verifierAttributsProposes(ch, sorte.pour, c.parmi);
      this.compiler(
        chemins.choixAttributNombre(e.id, c.id),
        c.nombre,
        { variables: { rang: 'nombre' } },
        'nombre',
      );
      this.compiler(
        chemins.choixAttribut(e.id, c.id),
        c.valeur,
        { variables: { rang: 'nombre' } },
        'nombre',
      );
    }
    for (const c of e.choix) this.verifierChoixEntree(e, c, `${chemin}/choix/${c.id}`, porteurs);

    if (e.exige !== undefined)
      this.compiler(chemins.exige(e.id), e.exige, { entite: porteurs }, 'booleen');
  }

  private contexteEffets(): ContexteEffets {
    return {
      compiler: (chemin, texte, o, attendu) => this.compiler(chemin, texte, o, attendu),
      erreur: (chemin, message) => this.erreur(chemin, message),
      formule: (chemin) => this.formules.get(chemin),
      entrees: this.entrees,
      sortes: this.sortes,
      actions: this.actions,
      sortesDes: this.sortesDes,
      typesDegats: this.typesDegats,
    };
  }

  // ─── Dés à symboles ────────────────────────────────────────────────────────

  private verifierDe(chemin: string, id: string): void {
    if (!this.sortesDes.has(id)) this.erreur(chemin, `Dé inconnu : ${id}`);
  }

  private verifierDes(): void {
    const d = this.s.des;
    if (!d) return;
    this.symboles = new Set(this.unique(d.symboles, (x) => x.id, 'des/symboles', 'Symbole').keys());
    this.sortesDes = new Set(this.unique(d.sortes, (x) => x.id, 'des/sortes', 'Dé').keys());
    for (const sd of d.sortes) {
      sd.faces.forEach((f, i) => {
        for (const sym of Object.keys(f)) {
          if (!this.symboles.has(sym))
            this.erreur(`des/sortes/${sd.id}/faces/${i}`, `Symbole inconnu : ${sym}`);
        }
      });
    }
    const vars = Object.fromEntries([...this.symboles].map((x) => [x, 'nombre' as const]));
    this.unique(d.resultats, (r) => r.cle, 'des/resultats', 'Résultat');
    for (const r of d.resultats) {
      if (this.symboles.has(r.cle))
        this.erreur(
          chemins.resultat(r.cle),
          `Un résultat ne peut pas porter le nom d’un symbole : ${r.cle}`,
        );
      this.compiler(chemins.resultat(r.cle), r.formule, { variables: vars }, 'nombre');
    }
  }

  // ─── Monnaies, achats, création ────────────────────────────────────────────

  private typesAchat(a: Achat): string[] {
    const o = a.obtient;
    switch (o.type) {
      case 'attribut':
        return [o.entite];
      case 'rang':
      case 'entree':
        return this.sortes.get(o.sorte)?.pour ?? [];
      case 'noeud': {
        const types = new Set<string>();
        for (const arbre of this.arbres.values()) {
          if (o.arbres && !o.arbres.includes(arbre.id)) continue;
          for (const n of arbre.noeuds) {
            const sorte = this.sortes.get(this.entrees.get(n.entree)?.sorte ?? '');
            sorte?.pour.forEach((t) => types.add(t));
          }
        }
        return [...types];
      }
    }
  }

  private verifierProgression(): void {
    for (const m of this.monnaies.values()) {
      this.verifierTypes(`monnaies/${m.id}`, m.pour);
      this.compiler(chemins.monnaie(m.id), m.total, { entite: this.attributsDe(m.pour) }, 'nombre');
    }
    for (const a of this.achats.values()) this.verifierAchat(a);
    for (const c of this.s.creation) this.verifierCreation(c);
  }

  private verifierAchat(a: Achat): void {
    const chemin = `achats/${a.id}`;
    if (!this.monnaies.has(a.monnaie)) this.erreur(chemin, `Monnaie inconnue : ${a.monnaie}`);
    const o = a.obtient;
    this.verifierObtention(chemin, o);

    const variables: Record<string, TypeValeur> = {
      actuel: 'nombre',
      /** Valeur calculée (avec les effets) de l'attribut, ou rang total de l'entrée visée. */
      calcule: 'nombre',
      cible: 'nombre',
      nombre: 'nombre',
      creation: 'booleen',
    };
    // Champs de l'entrée visée (`entree.prix`) pour les achats de rangs ou d'entrées
    const sorte = o.type === 'rang' || o.type === 'entree' ? this.sortes.get(o.sorte) : undefined;
    for (const c of sorte?.champs ?? []) {
      const t = typeChamp(c);
      if (t) variables[`entree.${c.id}`] = t;
    }
    const opts: OptionsEnv = {
      entite: this.attributsDe(this.typesAchat(a)),
      variables,
      fonctions: { marque: { args: ['texte'], retour: 'booleen' } },
    };
    this.compiler(chemins.achat(a.id, 'cout'), a.cout, opts, 'nombre');
    if (a.plafond !== undefined)
      this.compiler(chemins.achat(a.id, 'plafond'), a.plafond, opts, 'nombre');
    if (a.condition !== undefined)
      this.compiler(chemins.achat(a.id, 'condition'), a.condition, opts, 'booleen');
  }

  /** Ce que l'achat obtient : attributs, rangs d'une sorte à rangs, entrée, nœud d'arbre connu. */
  private verifierObtention(chemin: string, o: Achat['obtient']): void {
    if (o.type === 'attribut') this.verifierAchatAttribut(chemin, o);
    if (o.type === 'rang' && !this.sortes.get(o.sorte)?.rangs)
      this.erreur(chemin, `Sorte à rangs attendue : ${o.sorte}`);
    if (o.type === 'entree' && !this.sortes.has(o.sorte))
      this.erreur(chemin, `Sorte inconnue : ${o.sorte}`);
    if (o.type !== 'noeud') return;
    for (const x of o.arbres ?? [])
      if (!this.arbres.has(x)) this.erreur(chemin, `Arbre inconnu : ${x}`);
  }

  /** Achat d'attributs : entité connue, attributs de base, groupe connu, l'un ou l'autre précisé. */
  private verifierAchatAttribut(
    chemin: string,
    o: Extract<Achat['obtient'], { type: 'attribut' }>,
  ): void {
    const e = this.entites.get(o.entite);
    if (!e) this.erreur(chemin, `Type d’entité inconnu : ${o.entite}`);
    for (const cle of o.attributs ?? []) {
      if (e && e.attributs.get(cle)?.nature !== 'base')
        this.erreur(chemin, `Attribut de base attendu : ${cle}`);
    }
    if (o.groupe && e && !e.type.groupes.some((g) => g.id === o.groupe))
      this.erreur(chemin, `Groupe inconnu : ${o.groupe}`);
    if (!o.attributs && !o.groupe)
      this.erreur(chemin, 'Préciser les attributs ou le groupe achetables');
  }

  private verifierCreation(c: Systeme['creation'][number]): void {
    const e = this.entites.get(c.entite);
    const chemin = `creation/${c.entite}`;
    if (!e) {
      this.erreur(chemin, `Type d’entité inconnu : ${c.entite}`);
      return;
    }
    this.unique(c.etapes, (x) => x.id, chemin, 'Étape');
    for (const et of c.etapes) this.verifierEtape(c.entite, e, et);
  }

  /** Attributs et groupe visés par une étape de création : connus de l'entité. */
  private verifierCiblesEtape(
    chemin: string,
    e: EntiteChargee,
    attributs: readonly string[] | undefined,
    groupe: string | undefined,
  ): void {
    for (const cle of attributs ?? []) {
      if (!e.attributs.has(cle)) this.erreur(chemin, `Attribut inconnu : ${cle}`);
    }
    if (groupe && !e.type.groupes.some((g) => g.id === groupe)) {
      this.erreur(chemin, `Groupe inconnu : ${groupe}`);
    }
  }

  private verifierEtape(
    entite: string,
    e: EntiteChargee,
    et: Systeme['creation'][number]['etapes'][number],
  ): void {
    const chemin = `creation/${entite}/${et.id}`;
    const ch = (x: string) => chemins.etape(entite, et.id, x);
    const moi = { entite: [e.attributs] };
    if (et.type === 'repartir' || et.type === 'tirer' || et.type === 'saisir')
      this.verifierCiblesEtape(chemin, e, et.attributs, et.groupe);
    switch (et.type) {
      case 'choisir': {
        const sorte = this.sortes.get(et.sorte);
        if (!sorte) this.erreur(chemin, `Sorte inconnue : ${et.sorte}`);
        else if (!sorte.pour.includes(entite))
          this.erreur(chemin, `${et.sorte} n’est pas possédable par ${entite}`);
        if (et.min > et.max) this.erreur(chemin, 'min supérieur à max');
        break;
      }
      case 'repartir':
        this.compiler(ch('budget'), et.budget, moi, 'nombre');
        this.compiler(ch('cout'), et.cout, { variables: { valeur: 'nombre' } }, 'nombre');
        this.compiler(ch('min'), et.min, moi, 'nombre');
        this.compiler(ch('max'), et.max, moi, 'nombre');
        break;
      case 'tirer':
        this.compiler(ch('formule'), et.formule, { ...moi, des: true }, 'nombre');
        if (et.contrainte !== undefined)
          this.compiler(
            ch('contrainte'),
            et.contrainte,
            { variables: VARIABLES_CONTRAINTE },
            'booleen',
          );
        break;
      case 'acheter':
        for (const x of et.achats)
          if (!this.achats.has(x)) this.erreur(chemin, `Achat inconnu : ${x}`);
        break;
    }
  }

  // ─── Arbres ────────────────────────────────────────────────────────────────

  private verifierArbres(): void {
    for (const a of this.arbres.values()) this.verifierArbre(a);
  }

  private verifierArbre(a: Arbre): void {
    const chemin = `arbres/${a.id}`;
    if (a.ouvertPar && !this.entrees.has(a.ouvertPar))
      this.erreur(chemin, `Entrée inconnue : ${a.ouvertPar}`);
    const noeuds = this.unique(a.noeuds, (n) => n.id, chemin, 'Nœud');
    for (const n of a.noeuds) {
      if (!this.entrees.has(n.entree))
        this.erreur(`${chemin}/${n.id}`, `Entrée inconnue : ${n.entree}`);
      this.compiler(
        chemins.noeud(a.id, n.id),
        n.cout,
        { variables: { x: 'nombre', y: 'nombre' } },
        'nombre',
      );
    }
    for (const l of a.liens) {
      if (!noeuds.has(l.de)) this.erreur(`${chemin}/liens`, `Nœud inconnu : ${l.de}`);
      if (!noeuds.has(l.vers)) this.erreur(`${chemin}/liens`, `Nœud inconnu : ${l.vers}`);
    }
    if (!a.noeuds.some((n) => n.depart)) this.erreur(chemin, 'Aucun nœud de départ');
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Variables d'une action, dans l'ordre où elles deviennent disponibles. */
  private verifierActions(): void {
    for (const a of this.actions.values()) this.verifierAction(a);
    const ini = this.s.initiative;
    if (ini && !this.actions.has(ini.action))
      this.erreur('initiative', `Action inconnue : ${ini.action}`);
  }

  private verifierAction(a: Action): void {
    const chemin = `actions/${a.id}`;
    const ch = (x: string) => chemins.action(a.id, x);
    this.verifierTypes(chemin, a.pour);
    if (a.cible) this.verifierTypes(chemin, a.cible);
    if (a.multicible && !a.cible)
      this.erreur(`${chemin}/multicible`, 'Plusieurs cibles pour une action sans cible');

    const variables: Record<string, TypeValeur> = {};
    /** Options des paramètres `choix` : un texte comparé à l'un d'eux doit en être une. */
    const choix = new Map<string, string[]>();
    const declarer: Declarer = (nom, type, ou) => {
      if (nomReserve(nom)) this.erreur(ou, `Nom réservé : ${nom}`);
      else if (variables[nom]) this.erreur(ou, `Nom déjà utilisé : ${nom}`);
      variables[nom] = type;
    };
    for (const p of a.parametres)
      this.declarerParametre(a, p, `${chemin}/parametres/${p.id}`, declarer, variables, choix);

    const opts = (): OptionsEnv => ({
      entite: this.attributsDe(a.pour),
      externes: a.cible ? { cible: this.attributsDe(a.cible) } : {},
      variables: { ...variables },
      choix,
      combat: true,
      dynamique: true,
      // Possessions de la cible : `cible_possede("mort-vivant")`, `cible_rang("esquive")`
      fonctions: a.cible
        ? {
            cible_possede: { args: ['texte'], retour: 'booleen' },
            cible_rang: { args: ['texte'], retour: 'nombre' },
          }
        : {},
    });

    this.verifierExigences(a);
    if (recoitSituation(a)) this.verifierSituation(a, opts());

    for (const v of a.variables) {
      const f = this.compiler(ch(`variables/${v.cle}`), v.formule, opts());
      declarer(v.cle, f?.type ?? 'nombre', `${chemin}/variables/${v.cle}`);
    }
    a.verifications.forEach((v, i) =>
      this.compiler(ch(`verifications/${i}`), v.condition, opts(), 'booleen'),
    );

    this.verifierJetAction(a, opts, declarer);
    declarer('reussi', 'booleen', ch('jet'));

    for (const v of a.apres) {
      const f = this.compiler(ch(`apres/${v.cle}`), v.formule, { ...opts(), des: true });
      declarer(v.cle, f?.type ?? 'nombre', `${chemin}/apres/${v.cle}`);
    }

    this.verifierTypeDegats(a, opts);
    a.consequences.forEach((c, i) => this.verifierConsequence(a, c, ch(`consequences/${i}`), opts));
    a.tables.forEach((t, i) => {
      const ou = ch(`tables/${i}`);
      if (!this.tables.has(t.table)) this.erreur(ou, `Table inconnue : ${t.table}`);
      this.compiler(`${ou}/condition`, t.condition, opts(), 'booleen');
      if (t.modificateur !== undefined)
        this.compiler(`${ou}/modificateur`, t.modificateur, opts(), 'nombre');
    });
    this.verifierApresJet(a, opts);

    if (this.s.initiative?.action === a.id) {
      this.s.initiative.tri.forEach((t, i) => this.compiler(chemins.tri(i), t, opts(), 'nombre'));
    }
  }

  /** Variables d'un paramètre : sa valeur, et le rang et les champs d'une entrée. */
  private declarerParametre(
    a: Action,
    p: Parametre,
    ou: string,
    declarer: Declarer,
    variables: Record<string, TypeValeur>,
    choix: Map<string, string[]>,
  ): void {
    if (p.type === 'attribut') {
      declarer(p.id, 'texte', ou);
      this.verifierParametreAttribut(a, p, ou);
      return;
    }
    if (p.type === 'choix') {
      declarer(p.id, 'texte', ou);
      this.verifierParametreChoix(a, p, ou);
      choix.set(
        p.id,
        p.options.map((o) => o.valeur),
      );
      return;
    }
    if (p.type !== 'entree') {
      declarer(p.id, p.type, ou);
      return;
    }
    const sorte = this.sortes.get(p.sorte);
    if (!sorte) {
      this.erreur(ou, `Sorte inconnue : ${p.sorte}`);
      return;
    }
    declarer(p.id, 'texte', ou);
    variables[`${p.id}.rang`] = 'nombre';
    for (const c of sorte.champs) {
      const t = typeChamp(c);
      if (t) variables[`${p.id}.${c.id}`] = t;
    }
  }

  /** Attributs proposés : un groupe ou des attributs numériques connus de chaque type d'acteur. */
  private verifierParametreAttribut(
    a: Action,
    p: Extract<Parametre, { type: 'attribut' }>,
    ou: string,
  ): void {
    this.verifierAttributsProposes(ou, a.pour, p);
  }

  /** Options uniques, défaut parmi elles, paramètres qu'elles révèlent déclarés par l'action. */
  private verifierParametreChoix(
    a: Action,
    p: Extract<Parametre, { type: 'choix' }>,
    ou: string,
  ): void {
    this.unique(p.options, (o) => o.valeur, ou, 'Option');
    if (p.defaut !== undefined && !p.options.some((o) => o.valeur === p.defaut))
      this.erreur(ou, `Option par défaut inconnue : ${p.defaut}`);
    for (const o of p.options)
      for (const id of o.parametres ?? [])
        if (!a.parametres.some((x) => x.id === id))
          this.erreur(ou, `Option ${o.valeur} : paramètre inconnu ${id}`);
  }

  /** Conditions d'accès : à l'action entière, et à chaque paramètre réservé. */
  private verifierExigences(a: Action): void {
    const ch = (x: string) => chemins.action(a.id, x);
    for (const p of a.parametres) {
      if (p.par === 'cible' && !a.cible) {
        this.erreur(ch(`parametres/${p.id}`), 'Paramètre de la cible dans une action sans cible');
      }
      if (p.exige !== undefined) {
        this.compiler(
          ch(`parametres/${p.id}/exige`),
          p.exige,
          { entite: this.attributsDe(p.par === 'cible' ? (a.cible ?? []) : a.pour) },
          'booleen',
        );
      }
    }
    if (a.exige !== undefined) {
      this.compiler(ch('exige'), a.exige, { entite: this.attributsDe(a.pour) }, 'booleen');
    }
  }

  /** Jet numérique (formule, réussite, critique, échec critique) ou à symboles (pool, dés). */
  private verifierJetAction(a: Action, opts: () => OptionsEnv, declarer: Declarer): void {
    const ch = (x: string) => chemins.action(a.id, x);
    const jet = a.jet;
    if (jet.type === 'numerique') {
      this.compiler(ch('jet/formule'), jet.formule, { ...opts(), des: true }, 'nombre');
      declarer('total', 'nombre', ch('jet'));
      declarer('naturel', 'nombre', ch('jet'));
      for (const k of ['reussite', 'critique', 'fumble'] as const) {
        if (jet[k] !== undefined) this.compiler(ch(`jet/${k}`), jet[k], opts(), 'booleen');
      }
      if (jet.critique !== undefined) declarer('critique', 'booleen', ch('jet'));
      if (jet.fumble !== undefined) declarer('fumble', 'booleen', ch('jet'));
      return;
    }
    if (!this.s.des) this.erreur(ch('jet'), 'Jet à symboles sans dés à symboles dans le système');
    jet.pool.forEach((p, i) => {
      this.verifierDe(ch(`jet/pool/${i}`), p.de);
      this.compiler(ch(`jet/pool/${i}`), p.nombre, opts(), 'nombre');
    });
    jet.ameliorations.forEach((p, i) => {
      this.verifierDe(ch(`jet/ameliorations/${i}`), p.de);
      this.verifierDe(ch(`jet/ameliorations/${i}`), p.vers);
      this.compiler(ch(`jet/ameliorations/${i}`), p.nombre, opts(), 'nombre');
    });
    for (const r of this.s.des?.resultats ?? []) declarer(r.cle, 'nombre', ch('jet'));
    if (jet.reussite !== undefined)
      this.compiler(ch('jet/reussite'), jet.reussite, opts(), 'booleen');
  }

  /** Type de dégâts de l'action : connu, fixe ou calculé (pas les deux). */
  private verifierTypeDegats(a: Action, opts: () => OptionsEnv): void {
    const ou = chemins.action(a.id, 'typeDegats');
    if (a.typeDegats !== undefined && !this.typesDegats.has(a.typeDegats))
      this.erreur(ou, `Type de dégâts inconnu : ${a.typeDegats}`);
    if (a.typeDegats !== undefined && a.typeDegatsCalcule !== undefined)
      this.erreur(ou, 'typeDegats et typeDegatsCalcule sont exclusifs');
    if (a.typeDegatsCalcule !== undefined) this.compiler(ou, a.typeDegatsCalcule, opts(), 'texte');
  }

  private verifierConsequence(
    a: Action,
    c: Action['consequences'][number],
    ou: string,
    opts: () => OptionsEnv,
  ): void {
    const types = c.entite === 'acteur' ? a.pour : (a.cible ?? []);
    if (c.entite === 'cible' && !a.cible)
      this.erreur(ou, 'Conséquence sur la cible d’une action sans cible');
    if (c.condition !== undefined) this.compiler(`${ou}/condition`, c.condition, opts(), 'booleen');
    if ('attribut' in c) this.verifierConsequenceAttribut(c, ou, types, opts);
    else this.verifierConsequenceEntree(c, ou, types, opts);
  }

  /** Entrée donnée ou retirée : fixe ou calculée (une seule), possédable par les entités visées. */
  private verifierConsequenceEntree(
    c: Exclude<Action['consequences'][number], { attribut: string }>,
    ou: string,
    types: string[],
    opts: () => OptionsEnv,
  ): void {
    if ((c.entree === undefined) === (c.entreeCalculee === undefined))
      this.erreur(ou, 'Préciser entree ou entreeCalculee (un seul des deux)');
    if (c.entreeCalculee !== undefined)
      this.compiler(`${ou}/entree`, c.entreeCalculee, opts(), 'texte');
    const entree = c.entree === undefined ? undefined : this.entrees.get(c.entree);
    const sorte = entree && this.sortes.get(entree.sorte);
    if (c.entree !== undefined && !entree) this.erreur(ou, `Entrée inconnue : ${c.entree}`);
    else if (sorte && types.some((t) => !sorte.pour.includes(t)))
      this.erreur(ou, `${sorte.nom} non possédable par ${types.join(', ')}`);
    this.compiler(`${ou}/rangs`, c.rangs, opts(), 'nombre');
    if (c.duree !== undefined) this.compiler(`${ou}/duree`, c.duree, opts(), 'nombre');
  }

  /** Attribut modifié : de base ou ressource, valeur, type de dégâts et minimum cohérents. */
  private verifierConsequenceAttribut(
    c: Extract<Action['consequences'][number], { attribut: string }>,
    ou: string,
    types: string[],
    opts: () => OptionsEnv,
  ): void {
    if (c.type !== undefined && !this.typesDegats.has(c.type))
      this.erreur(ou, `Type de dégâts inconnu : ${c.type}`);
    for (const t of this.attributsDe(types)) {
      const attr = t.get(c.attribut);
      if (!attr || (attr.nature !== 'base' && attr.nature !== 'ressource')) {
        this.erreur(ou, `Attribut de base ou ressource attendu : ${c.attribut}`);
      }
    }
    this.compiler(`${ou}/valeur`, c.valeur, opts(), 'nombre');
    if (c.type !== undefined && c.typeCalcule !== undefined)
      this.erreur(ou, 'type et typeCalcule sont exclusifs');
    if (c.typeCalcule !== undefined) this.compiler(`${ou}/type`, c.typeCalcule, opts(), 'texte');
    if (c.minimum !== undefined) {
      if (c.type === undefined && c.typeCalcule === undefined && !c.degats)
        this.erreur(ou, 'Un minimum de dégâts demande un type de dégâts');
      this.compiler(`${ou}/minimum`, c.minimum, opts(), 'nombre');
    }
  }

  /** Paramètres choisis après le jet : le jet ne les lit jamais (docs/regles.md). */
  private verifierApresJet(a: Action, opts: () => OptionsEnv): void {
    const ch = (x: string) => chemins.action(a.id, x);
    for (const p of a.parametres)
      if (p.etape === 'apres' && p.par === 'cible')
        this.erreur(ch(`parametres/${p.id}`), 'Une réaction de la cible se choisit avant le jet');
    const situation = recoitSituation(a) ? (this.s.situation?.effets ?? []) : [];
    for (const c of etapesAction(a, (x) => this.formules.get(x), situation).conflits)
      this.erreur(c.chemin, `Le jet ne peut pas lire « ${c.variable} », choisi après le jet`);
    if (a.jet.type === 'numerique' && a.jet.confirmerCritique !== undefined) {
      if (a.jet.critique === undefined)
        this.erreur(ch('jet/confirmerCritique'), 'Critique confirmé sans critique au jet');
      this.compiler(ch('jet/confirmerCritique'), a.jet.confirmerCritique, opts(), 'booleen');
    }
  }

  /**
   * Effets de la situation, compilés pour chaque action qui la reçoit (sauf celles que leur
   * `actions` écarte) : ils lisent les paramètres, l'acteur, la cible (`@cible.X`,
   * `cible_possede`) et le combat (`@combat.*`) de cette action.
   */
  private verifierSituation(a: Action, o: OptionsEnv): void {
    const effets = this.s.situation?.effets ?? [];
    const ctx: ContexteEffets = {
      ...this.contexteEffets(),
      compiler: (chemin, texte, oe, attendu) =>
        this.compiler(
          chemin,
          texte,
          {
            ...oe,
            externes: o.externes ?? {},
            fonctions: { ...oe.fonctions, ...o.fonctions },
            choix: o.choix ?? new Map(),
            combat: true,
          },
          attendu,
        ),
    };
    effets.forEach((f, i) => {
      if (f.actions && !f.actions.includes(a.id)) return;
      verifierEffets(ctx, [f], (_, x) => chemins.situation(a.id, i, x), o.entite ?? [], {});
    });
  }

  // ─── Tables ────────────────────────────────────────────────────────────────

  /** Générateur de rencontres : attributs cités, scénarios cohérents, ids uniques. */
  private verifierRencontres(): void {
    const r = this.s.rencontres;
    if (!r) return;
    const attributs = new Set(this.s.entites.flatMap((e) => e.attributs.map((a) => a.cle)));
    if (!attributs.has(r.niveau))
      this.erreur('rencontres/niveau', `Attribut inconnu : ${r.niveau}`);
    if (!attributs.has(r.puissance))
      this.erreur('rencontres/puissance', `Attribut inconnu : ${r.puissance}`);
    r.filtres.forEach((f, i) => {
      if (!attributs.has(f)) this.erreur(`rencontres/filtres/${i}`, `Attribut inconnu : ${f}`);
    });
    this.unique(r.difficultes, (d) => d.id, 'rencontres/difficultes', 'Difficulté');
    this.unique(r.scenarios, (x) => x.id, 'rencontres/scenarios', 'Scénario');
    r.scenarios.forEach((x, i) => {
      if (x.min > x.max) this.erreur(`rencontres/scenarios/${i}`, `min ${x.min} > max ${x.max}`);
      if (x.chef && x.min < 2)
        this.erreur(`rencontres/scenarios/${i}`, 'Un chef et ses sbires : 2 créatures au moins');
    });
  }

  private verifierTables(): void {
    for (const t of this.tables.values()) {
      const chemin = `tables/${t.id}`;
      this.compiler(
        chemins.table(t.id),
        t.jet,
        { variables: { modificateur: 'nombre' }, des: true },
        'nombre',
      );
      const lignes = [...t.lignes].sort((a, b) => a.min - b.min);
      lignes.forEach((l, i) => {
        if (l.min > l.max) this.erreur(chemin, `Ligne « ${l.nom} » : min supérieur à max`);
        const suivante = lignes[i + 1];
        if (suivante && suivante.min <= l.max)
          this.erreur(chemin, `Lignes qui se chevauchent : « ${l.nom} » et « ${suivante.nom} »`);
        if (l.entree && !this.entrees.has(l.entree))
          this.erreur(chemin, `Entrée inconnue : ${l.entree}`);
      });
    }
  }

  // ─── Graphe de dépendances ─────────────────────────────────────────────────

  private calculerOrdres(): void {
    for (const [id, e] of this.entites) e.ordre = this.ordreDe(id, e, this.dependancesDe(id, e));
  }

  /** Ce dont dépend chaque attribut : ses formules, et les effets qui le visent. */
  private dependancesDe(id: string, e: EntiteChargee): Map<string, Set<string>> {
    const deps = new Map<string, Set<string>>();
    const ajouter = (cle: string, f: FormuleVerifiee | undefined, sauf?: string) => {
      if (!f) return;
      const s = deps.get(cle) ?? new Set<string>();
      for (const d of f.dependances) if (d !== sauf) s.add(d);
      deps.set(cle, s);
    };

    for (const a of e.attributs.values()) {
      deps.set(a.cle, deps.get(a.cle) ?? new Set());
      for (const c of ['formule', 'min', 'max', 'initiale'] as const) {
        ajouter(a.cle, this.formules.get(chemins.attribut(id, a.cle, c)));
      }
      ajouter(a.cle, this.formules.get(chemins.attribut(id, a.cle, 'modificateur')), a.cle);
    }

    // Un effet sur un attribut en fait dépendre la valeur de tout ce que l'effet lit
    const effetSur = (f: { sur: string; attribut?: string }, chemin: (x: string) => string) => {
      if (f.sur !== 'attribut' || !f.attribut || !e.attributs.has(f.attribut)) return;
      ajouter(f.attribut, this.formules.get(chemin('valeur')));
      ajouter(f.attribut, this.formules.get(chemin('condition')));
    };
    for (const entree of this.entrees.values()) {
      if (!e.sortes.has(entree.sorte)) continue;
      entree.effets.forEach((f, i) => effetSur(f, (x) => chemins.effet(entree.id, i, x)));
    }
    e.type.effets.forEach((f, i) => effetSur(f, (x) => chemins.effetEntite(id, i, x)));
    return deps;
  }

  /** Ordre de calcul des attributs (dépendances d'abord) ; un cycle est une erreur. */
  private ordreDe(id: string, e: EntiteChargee, deps: Map<string, Set<string>>): string[] {
    const ordre: string[] = [];
    const etat = new Map<string, 'encours' | 'fait'>();
    const pile: string[] = [];
    const visiter = (cle: string): boolean => {
      const s = etat.get(cle);
      if (s === 'fait') return true;
      if (s === 'encours') {
        const cycle = [...pile.slice(pile.indexOf(cle)), cle];
        this.erreur(`entites/${id}`, `Dépendance circulaire : ${cycle.join(' → ')}`);
        return false;
      }
      etat.set(cle, 'encours');
      pile.push(cle);
      for (const d of deps.get(cle) ?? []) if (!visiter(d)) return false;
      pile.pop();
      etat.set(cle, 'fait');
      ordre.push(cle);
      return true;
    };
    for (const cle of e.attributs.keys()) if (!visiter(cle)) break;
    return ordre;
  }
}
