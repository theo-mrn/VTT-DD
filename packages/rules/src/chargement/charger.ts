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
  Systeme,
  type Achat,
  type Action,
  type Arbre,
  type Entree,
  type Monnaie,
  type Sorte,
  type Table,
  type TypeEntite,
} from '../schema/index.js';
import { env, typeAttribut, typeChamp, type Attributs, type OptionsEnv } from './environnements.js';

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
    champ: 'formule' | 'min' | 'max' | 'initiale' | 'modificateur',
  ) => `entites/${entite}/${cle}/${champ}`,
  modificateurSysteme: () => 'modificateur',
  effet: (entree: string, i: number, champ: string) => `catalogue/${entree}/effets/${i}/${champ}`,
  exige: (entree: string) => `catalogue/${entree}/exige`,
  champ: (entree: string, champ: string) => `catalogue/${entree}/champs/${champ}`,
  choix: (entree: string, choix: string) => `catalogue/${entree}/choix/${choix}/valeur`,
  choixNombre: (entree: string, choix: string) => `catalogue/${entree}/choix/${choix}/nombre`,
  choixAttribut: (entree: string, choix: string) =>
    `catalogue/${entree}/choixAttributs/${choix}/valeur`,
  achat: (id: string, champ: 'cout' | 'plafond' | 'condition') => `achats/${id}/${champ}`,
  monnaie: (id: string) => `monnaies/${id}/total`,
  etape: (entite: string, etape: string, champ: string) => `creation/${entite}/${etape}/${champ}`,
  rangsMax: (sorte: string) => `sortes/${sorte}/rangs/max`,
  noeud: (arbre: string, noeud: string) => `arbres/${arbre}/${noeud}/cout`,
  resultat: (cle: string) => `des/resultats/${cle}`,
  action: (id: string, champ: string) => `actions/${id}/${champ}`,
  tri: (i: number) => `initiative/tri/${i}`,
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
  private erreurs: ErreurChargement[] = [];
  private formules = new Map<string, FormuleVerifiee>();
  private entites = new Map<string, EntiteChargee>();
  private sortes = new Map<string, Sorte>();
  private entrees = new Map<string, Entree>();
  private achats = new Map<string, Achat>();
  private arbres = new Map<string, Arbre>();
  private actions = new Map<string, Action>();
  private tables = new Map<string, Table>();
  private monnaies = new Map<string, Monnaie>();
  private marques = new Set<string>();
  private symboles = new Set<string>();
  private sortesDes = new Set<string>();

  constructor(private s: Systeme) {}

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
    const r = compiler(texte, env({ entree: (id) => this.entrees.has(id), ...o }), attendu);
    if (!r.ok) {
      for (const e of r.erreurs) this.erreur(chemin, e.message, e.position);
      return null;
    }
    this.verifierLitteraux(chemin, r.formule.noeud);
    this.formules.set(chemin, r.formule);
    return r.formule;
  }

  /** Vérifie les arguments littéraux des fonctions d'agrégat (sorte, champ, marque existants). */
  private verifierLitteraux(chemin: string, n: Noeud): void {
    const visiter = (x: Noeud): void => {
      switch (x.t) {
        case 'appel': {
          const lit = x.args.map((a) => (a.t === 'texte' ? a.v : null));
          if (['compte', 'somme', 'compte_actifs', 'somme_actifs', 'somme_rangs'].includes(x.fn)) {
            const sorte = lit[0] != null ? this.sortes.get(lit[0]) : undefined;
            if (lit[0] != null && !sorte) this.erreur(chemin, `Sorte inconnue : ${lit[0]}`, x.pos);
            if ((x.fn === 'somme' || x.fn === 'somme_actifs') && sorte && lit[1] != null) {
              const champ = sorte.champs.find((c) => c.id === lit[1]);
              if (!champ || champ.type !== 'nombre') {
                this.erreur(chemin, `Champ numérique inconnu sur ${sorte.id} : ${lit[1]}`, x.pos);
              }
            }
          }
          if (x.fn === 'marquee') {
            if (lit[0] != null && !this.entrees.has(lit[0]))
              this.erreur(chemin, `Entrée inconnue : ${lit[0]}`, x.pos);
            if (lit[1] != null && !this.marques.has(lit[1]))
              this.erreur(chemin, `Marque jamais posée : ${lit[1]}`, x.pos);
          }
          if (x.fn === 'marque' && lit[0] != null && !this.marques.has(lit[0])) {
            this.erreur(chemin, `Marque jamais posée : ${lit[0]}`, x.pos);
          }
          x.args.forEach(visiter);
          return;
        }
        case 'unaire':
          return visiter(x.arg);
        case 'binaire':
          visiter(x.g);
          return visiter(x.d);
        case 'si':
          visiter(x.condition);
          visiter(x.alors);
          return visiter(x.sinon);
        case 'des':
          visiter(x.nombre);
          visiter(x.faces);
          if (x.garder) visiter(x.garder.n);
          return;
        default:
          return;
      }
    };
    visiter(n);
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
    this.unique(s.textes, (x) => x.id, 'textes', 'Texte');
    this.unique(s.creation, (x) => x.entite, 'creation', 'Création');

    // Les marques sont déclarées par leur usage : un effet ou un choix qui les pose
    for (const e of s.catalogue) {
      for (const f of e.effets) if (f.sur === 'marque') this.marques.add(f.marque);
      for (const c of e.choix) if (c.donne.type === 'marque') this.marques.add(c.donne.marque);
    }
    for (const sorte of s.sortes) {
      for (const t of sorte.pour) this.entites.get(t)?.sortes.add(sorte.id);
    }
  }

  // ─── Entités et attributs ──────────────────────────────────────────────────

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
      for (const a of e.attributs.values()) {
        const ch = (c: Parameters<typeof chemins.attribut>[2]) => chemins.attribut(id, a.cle, c);
        if (a.groupe && !groupes.has(a.groupe))
          this.erreur(`entites/${id}/${a.cle}`, `Groupe inconnu : ${a.groupe}`);

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
            if (a.defaut && !a.options.some((o) => o.valeur === a.defaut)) {
              this.erreur(
                `entites/${id}/${a.cle}`,
                `Valeur par défaut hors des options : ${a.defaut}`,
              );
            }
            break;
        }

        if (
          (a.nature === 'base' || a.nature === 'derivee') &&
          a.modificateur !== undefined &&
          a.modificateur !== false
        ) {
          if (a.nature === 'derivee' && a.type !== 'nombre') {
            this.erreur(
              `entites/${id}/${a.cle}`,
              'Seul un attribut numérique peut avoir un modificateur',
            );
          } else if (a.modificateur === true) {
            if (s.modificateur === undefined) {
              this.erreur(
                `entites/${id}/${a.cle}`,
                'modificateur: true sans formule de modificateur dans le système',
              );
            }
          } else {
            this.compiler(
              ch('modificateur'),
              a.modificateur,
              { ...moi, variables: { valeur: 'nombre' } },
              'nombre',
            );
          }
        }
      }
    }
  }

  // ─── Sortes et catalogue ───────────────────────────────────────────────────

  private verifierSortesEtCatalogue(): void {
    for (const sorte of this.sortes.values()) {
      const chemin = `sortes/${sorte.id}`;
      this.verifierTypes(chemin, sorte.pour);
      this.unique(sorte.champs, (c) => c.id, chemin, 'Champ');
      for (const c of sorte.champs) {
        if (c.type === 'entree' || c.type === 'entrees') {
          if (!this.sortes.has(c.sorte))
            this.erreur(`${chemin}/${c.id}`, `Sorte inconnue : ${c.sorte}`);
        }
        if (c.type === 'attribut' && !this.entites.has(c.entite)) {
          this.erreur(`${chemin}/${c.id}`, `Type d’entité inconnu : ${c.entite}`);
        }
      }
      if (sorte.rangs)
        this.compiler(
          chemins.rangsMax(sorte.id),
          sorte.rangs.max,
          { entite: this.attributsDe(sorte.pour) },
          'nombre',
        );
    }

    for (const e of this.entrees.values()) this.verifierEntree(e);
  }

  private verifierEntree(e: Entree): void {
    const chemin = `catalogue/${e.id}`;
    const sorte = this.sortes.get(e.sorte);
    if (!sorte) return this.erreur(chemin, `Sorte inconnue : ${e.sorte}`);
    const porteurs = this.attributsDe(sorte.pour);

    // Champs : existence et type des valeurs
    for (const [cle, v] of Object.entries(e.champs)) {
      const c = sorte.champs.find((x) => x.id === cle);
      const ch = `${chemin}/champs/${cle}`;
      if (!c) {
        this.erreur(ch, `Champ inconnu pour la sorte ${sorte.id}`);
        continue;
      }
      const attendu = { nombre: 'number', texte: 'string', booleen: 'boolean' } as const;
      switch (c.type) {
        case 'nombre':
        case 'texte':
        case 'booleen':
          if (typeof v !== attendu[c.type]) this.erreur(ch, `${c.type} attendu`);
          break;
        case 'formule':
          if (typeof v === 'string' || typeof v === 'number') {
            this.compiler(chemins.champ(e.id, cle), String(v), { entite: porteurs }, 'nombre');
          } else this.erreur(ch, 'Formule attendue');
          break;
        case 'attribut':
          if (typeof v !== 'string' || !this.entites.get(c.entite)?.attributs.has(v)) {
            this.erreur(ch, `Attribut inconnu de ${c.entite} : ${String(v)}`);
          }
          break;
        case 'entree':
          if (typeof v !== 'string' || this.entrees.get(v)?.sorte !== c.sorte) {
            this.erreur(ch, `Entrée de sorte ${c.sorte} attendue : ${String(v)}`);
          }
          break;
        case 'entrees':
          if (!Array.isArray(v)) this.erreur(ch, 'Liste d’entrées attendue');
          else
            for (const x of v)
              if (this.entrees.get(x)?.sorte !== c.sorte)
                this.erreur(ch, `Entrée de sorte ${c.sorte} attendue : ${x}`);
          break;
      }
    }

    // Défaut d'un champ formule de la sorte : compilé pour chaque entrée qui ne le redéfinit pas
    for (const c of sorte.champs) {
      if (c.type === 'formule' && c.defaut !== undefined && !(c.id in e.champs)) {
        this.compiler(chemins.champ(e.id, c.id), c.defaut, { entite: porteurs }, 'nombre');
      }
    }

    // Variables disponibles dans les effets : rang et état de la source, ses champs
    const variables: Record<string, TypeValeur> = { rang: 'nombre', actif: 'booleen' };
    for (const c of sorte.champs) {
      const t = typeChamp(c);
      if (t) variables[`source.${c.id}`] = t;
    }
    const oEffet: OptionsEnv = { entite: porteurs, variables };

    e.effets.forEach((f, i) => {
      const ch = (x: string) => chemins.effet(e.id, i, x);
      if (f.condition !== undefined) this.compiler(ch('condition'), f.condition, oEffet, 'booleen');
      switch (f.sur) {
        case 'attribut': {
          const cibles = porteurs.map((p) => p.get(f.attribut));
          if (!cibles.length || cibles.some((a) => !a)) {
            this.erreur(ch('attribut'), `Attribut inconnu du porteur : ${f.attribut}`);
            break;
          }
          const types = new Set(cibles.map((a) => typeAttribut(a!)));
          const numerique = types.size === 1 && types.has('nombre');
          if (!numerique && f.operation !== 'fixer') {
            this.erreur(
              ch('attribut'),
              `Seul « fixer » s’applique à un attribut non numérique (${f.attribut})`,
            );
          }
          const type = numerique ? 'nombre' : [...types][0];
          this.compiler(ch('valeur'), f.valeur, oEffet, types.size === 1 ? type : undefined);
          break;
        }
        case 'rang': {
          const cible = this.entrees.get(f.entree);
          if (!cible) this.erreur(ch('entree'), `Entrée inconnue : ${f.entree}`);
          else if (!this.sortes.get(cible.sorte)?.rangs)
            this.erreur(ch('entree'), `${f.entree} ne se possède pas par rangs`);
          // Les rangs sont calculés avant les attributs : ils ne peuvent pas en dépendre
          this.compiler(ch('valeur'), f.valeur, { variables: { rang: 'nombre' } }, 'nombre');
          if (f.condition !== undefined && this.formules.get(ch('condition'))?.dependances.size) {
            this.erreur(
              ch('condition'),
              'La condition d’un rang gratuit ne peut pas lire d’attribut',
            );
          }
          break;
        }
        case 'marque':
          for (const x of f.entrees)
            if (!this.entrees.has(x)) this.erreur(ch('entrees'), `Entrée inconnue : ${x}`);
          if (f.condition !== undefined && this.formules.get(ch('condition'))?.dependances.size) {
            this.erreur(ch('condition'), 'La condition d’une marque ne peut pas lire d’attribut');
          }
          break;
        case 'jet': {
          for (const a of f.actions ?? [])
            if (!this.actions.has(a)) this.erreur(ch('actions'), `Action inconnue : ${a}`);
          const vars: Record<string, TypeValeur> = { ...variables, action: 'texte' };
          for (const act of this.actions.values()) {
            for (const p of act.parametres) if (p.type === 'entree') vars[p.id] = 'texte';
          }
          if (f.si !== undefined)
            this.compiler(ch('si'), f.si, { ...oEffet, variables: vars }, 'booleen');
          const aj = f.ajout;
          if (aj && 'de' in aj) {
            this.verifierDe(ch('ajout'), aj.de);
            this.compiler(ch('nombre'), aj.nombre, oEffet, 'nombre');
          } else if (aj && 'ameliorer' in aj) {
            this.verifierDe(ch('ajout'), aj.ameliorer);
            this.verifierDe(ch('ajout'), aj.vers);
            this.compiler(ch('nombre'), aj.nombre, oEffet, 'nombre');
          } else if (aj && 'retrograder' in aj) {
            this.verifierDe(ch('ajout'), aj.retrograder);
            this.verifierDe(ch('ajout'), aj.vers);
            this.compiler(ch('nombre'), aj.nombre, oEffet, 'nombre');
          } else if (aj && 'retirer' in aj) {
            this.verifierDe(ch('ajout'), aj.retirer);
            this.compiler(ch('nombre'), aj.nombre, oEffet, 'nombre');
          } else if (aj) {
            this.compiler(ch('bonus'), aj.bonus, oEffet, 'nombre');
          }
          break;
        }
      }
    });

    // Les choix d'entrées et d'attributs partagent l'espace `possession.choix`
    this.unique([...e.choix, ...e.choixAttributs], (c) => c.id, `${chemin}/choix`, 'Choix');
    for (const c of e.choixAttributs) {
      const ch = `${chemin}/choixAttributs/${c.id}`;
      if (!c.parmi.attributs && !c.parmi.groupe)
        this.erreur(ch, 'Préciser les attributs ou le groupe proposés');
      for (const t of sorte.pour) {
        const ent = this.entites.get(t);
        if (!ent) continue;
        if (c.parmi.groupe && !ent.type.groupes.some((g) => g.id === c.parmi.groupe)) {
          this.erreur(ch, `Groupe inconnu de ${t} : ${c.parmi.groupe}`);
        }
        for (const cle of c.parmi.attributs ?? []) {
          const a = ent.attributs.get(cle);
          if (!a || typeAttribut(a) !== 'nombre')
            this.erreur(ch, `Attribut numérique inconnu de ${t} : ${cle}`);
        }
      }
      this.compiler(
        chemins.choixAttribut(e.id, c.id),
        c.valeur,
        { variables: { rang: 'nombre' } },
        'nombre',
      );
    }
    for (const c of e.choix) {
      const ch = `${chemin}/choix/${c.id}`;
      if (!this.sortes.has(c.parmi.sorte)) this.erreur(ch, `Sorte inconnue : ${c.parmi.sorte}`);
      this.compiler(chemins.choixNombre(e.id, c.id), c.nombre, { entite: porteurs }, 'nombre');
      for (const x of c.parmi.entrees ?? []) {
        if (this.entrees.get(x)?.sorte !== c.parmi.sorte)
          this.erreur(ch, `Entrée de sorte ${c.parmi.sorte} attendue : ${x}`);
      }
      if (c.donne.type === 'rang') {
        if (!this.sortes.get(c.parmi.sorte)?.rangs)
          this.erreur(ch, `${c.parmi.sorte} ne se possède pas par rangs`);
        this.compiler(chemins.choix(e.id, c.id), c.donne.valeur, {}, 'nombre');
      }
    }

    if (e.exige !== undefined)
      this.compiler(chemins.exige(e.id), e.exige, { entite: porteurs }, 'booleen');
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

    for (const a of this.achats.values()) {
      const chemin = `achats/${a.id}`;
      const monnaie = this.monnaies.get(a.monnaie);
      if (!monnaie) this.erreur(chemin, `Monnaie inconnue : ${a.monnaie}`);
      const o = a.obtient;
      if (o.type === 'attribut') {
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
      if (o.type === 'rang' && !this.sortes.get(o.sorte)?.rangs)
        this.erreur(chemin, `Sorte à rangs attendue : ${o.sorte}`);
      if (o.type === 'entree' && !this.sortes.has(o.sorte))
        this.erreur(chemin, `Sorte inconnue : ${o.sorte}`);
      if (o.type === 'noeud')
        for (const x of o.arbres ?? [])
          if (!this.arbres.has(x)) this.erreur(chemin, `Arbre inconnu : ${x}`);

      const variables: Record<string, TypeValeur> = {
        actuel: 'nombre',
        /** Valeur calculée (avec les effets) de l'attribut, ou rang total de l'entrée visée. */
        calcule: 'nombre',
        cible: 'nombre',
        nombre: 'nombre',
        creation: 'booleen',
      };
      // Champs de l'entrée visée (`entree.prix`) pour les achats de rangs ou d'entrées
      if (o.type === 'rang' || o.type === 'entree') {
        for (const c of this.sortes.get(o.sorte)?.champs ?? []) {
          const t = typeChamp(c);
          if (t) variables[`entree.${c.id}`] = t;
        }
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

    for (const c of this.s.creation) {
      const e = this.entites.get(c.entite);
      const chemin = `creation/${c.entite}`;
      if (!e) {
        this.erreur(chemin, `Type d’entité inconnu : ${c.entite}`);
        continue;
      }
      this.unique(c.etapes, (x) => x.id, chemin, 'Étape');
      const moi = { entite: [e.attributs] };
      for (const et of c.etapes) {
        const ch = (x: string) => chemins.etape(c.entite, et.id, x);
        if ('attributs' in et || 'groupe' in et) {
          const cibles =
            et.type === 'repartir' || et.type === 'tirer' || et.type === 'saisir' ? et : null;
          if (cibles) {
            for (const cle of cibles.attributs ?? []) {
              if (!e.attributs.has(cle))
                this.erreur(`${chemin}/${et.id}`, `Attribut inconnu : ${cle}`);
            }
            if (cibles.groupe && !e.type.groupes.some((g) => g.id === cibles.groupe)) {
              this.erreur(`${chemin}/${et.id}`, `Groupe inconnu : ${cibles.groupe}`);
            }
          }
        }
        switch (et.type) {
          case 'choisir': {
            const sorte = this.sortes.get(et.sorte);
            if (!sorte) this.erreur(`${chemin}/${et.id}`, `Sorte inconnue : ${et.sorte}`);
            else if (!sorte.pour.includes(c.entite))
              this.erreur(`${chemin}/${et.id}`, `${et.sorte} n’est pas possédable par ${c.entite}`);
            if (et.min > et.max) this.erreur(`${chemin}/${et.id}`, 'min supérieur à max');
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
            if (et.contrainte !== undefined) {
              this.compiler(
                ch('contrainte'),
                et.contrainte,
                {
                  variables: {
                    total: 'nombre',
                    min: 'nombre',
                    max: 'nombre',
                    nombre: 'nombre',
                    pairs: 'nombre',
                    impairs: 'nombre',
                    somme_modificateurs: 'nombre',
                  },
                },
                'booleen',
              );
            }
            break;
          case 'acheter':
            for (const x of et.achats)
              if (!this.achats.has(x)) this.erreur(`${chemin}/${et.id}`, `Achat inconnu : ${x}`);
            break;
        }
      }
    }
  }

  // ─── Arbres ────────────────────────────────────────────────────────────────

  private verifierArbres(): void {
    for (const a of this.arbres.values()) {
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
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Variables d'une action, dans l'ordre où elles deviennent disponibles. */
  private verifierActions(): void {
    const resultats = this.s.des?.resultats ?? [];

    for (const a of this.actions.values()) {
      const chemin = `actions/${a.id}`;
      const ch = (x: string) => chemins.action(a.id, x);
      this.verifierTypes(chemin, a.pour);
      if (a.cible) this.verifierTypes(chemin, a.cible);

      const variables: Record<string, TypeValeur> = {};
      const declarer = (nom: string, type: TypeValeur, ou: string) => {
        if (nomReserve(nom)) this.erreur(ou, `Nom réservé : ${nom}`);
        else if (variables[nom]) this.erreur(ou, `Nom déjà utilisé : ${nom}`);
        variables[nom] = type;
      };

      for (const p of a.parametres) {
        const ou = `${chemin}/parametres/${p.id}`;
        if (p.type === 'attribut') {
          declarer(p.id, 'texte', ou);
          if (!p.attributs && !p.groupe)
            this.erreur(ou, 'Préciser les attributs ou le groupe proposés');
          for (const t of a.pour) {
            const e = this.entites.get(t);
            if (!e) continue;
            if (p.groupe && !e.type.groupes.some((g) => g.id === p.groupe)) {
              this.erreur(ou, `Groupe inconnu de ${t} : ${p.groupe}`);
            }
            for (const cle of p.attributs ?? []) {
              const attr = e.attributs.get(cle);
              if (!attr || typeAttribut(attr) !== 'nombre')
                this.erreur(ou, `Attribut numérique inconnu de ${t} : ${cle}`);
            }
          }
          continue;
        }
        if (p.type !== 'entree') {
          declarer(p.id, p.type, ou);
          continue;
        }
        const sorte = this.sortes.get(p.sorte);
        if (!sorte) {
          this.erreur(ou, `Sorte inconnue : ${p.sorte}`);
          continue;
        }
        declarer(p.id, 'texte', ou);
        variables[`${p.id}.rang`] = 'nombre';
        for (const c of sorte.champs) {
          const t = typeChamp(c);
          if (t) variables[`${p.id}.${c.id}`] = t;
        }
      }

      const opts = (): OptionsEnv => ({
        entite: this.attributsDe(a.pour),
        externes: a.cible ? { cible: this.attributsDe(a.cible) } : {},
        variables: { ...variables },
        dynamique: true,
      });

      if (a.exige !== undefined) {
        this.compiler(ch('exige'), a.exige, { entite: this.attributsDe(a.pour) }, 'booleen');
      }

      for (const v of a.variables) {
        const f = this.compiler(ch(`variables/${v.cle}`), v.formule, opts());
        declarer(v.cle, f?.type ?? 'nombre', `${chemin}/variables/${v.cle}`);
      }

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
      } else {
        if (!this.s.des)
          this.erreur(ch('jet'), 'Jet à symboles sans dés à symboles dans le système');
        jet.pool.forEach((p, i) => {
          this.verifierDe(ch(`jet/pool/${i}`), p.de);
          this.compiler(ch(`jet/pool/${i}`), p.nombre, opts(), 'nombre');
        });
        jet.ameliorations.forEach((p, i) => {
          this.verifierDe(ch(`jet/ameliorations/${i}`), p.de);
          this.verifierDe(ch(`jet/ameliorations/${i}`), p.vers);
          this.compiler(ch(`jet/ameliorations/${i}`), p.nombre, opts(), 'nombre');
        });
        for (const r of resultats) declarer(r.cle, 'nombre', ch('jet'));
        if (jet.reussite !== undefined)
          this.compiler(ch('jet/reussite'), jet.reussite, opts(), 'booleen');
      }
      declarer('reussi', 'booleen', ch('jet'));

      for (const v of a.apres) {
        const f = this.compiler(ch(`apres/${v.cle}`), v.formule, { ...opts(), des: true });
        declarer(v.cle, f?.type ?? 'nombre', `${chemin}/apres/${v.cle}`);
      }

      a.consequences.forEach((c, i) => {
        const ou = ch(`consequences/${i}`);
        const types = c.entite === 'acteur' ? a.pour : (a.cible ?? []);
        if (c.entite === 'cible' && !a.cible)
          this.erreur(ou, 'Conséquence sur la cible d’une action sans cible');
        for (const t of this.attributsDe(types)) {
          const attr = t.get(c.attribut);
          if (!attr || (attr.nature !== 'base' && attr.nature !== 'ressource')) {
            this.erreur(ou, `Attribut de base ou ressource attendu : ${c.attribut}`);
          }
        }
        if (c.condition !== undefined)
          this.compiler(`${ou}/condition`, c.condition, opts(), 'booleen');
        this.compiler(`${ou}/valeur`, c.valeur, opts(), 'nombre');
      });

      a.tables.forEach((t, i) => {
        const ou = ch(`tables/${i}`);
        if (!this.tables.has(t.table)) this.erreur(ou, `Table inconnue : ${t.table}`);
        this.compiler(`${ou}/condition`, t.condition, opts(), 'booleen');
        if (t.modificateur !== undefined)
          this.compiler(`${ou}/modificateur`, t.modificateur, opts(), 'nombre');
      });

      if (this.s.initiative?.action === a.id) {
        this.s.initiative.tri.forEach((t, i) => this.compiler(chemins.tri(i), t, opts(), 'nombre'));
      }
    }

    const ini = this.s.initiative;
    if (ini && !this.actions.has(ini.action))
      this.erreur('initiative', `Action inconnue : ${ini.action}`);
  }

  // ─── Tables ────────────────────────────────────────────────────────────────

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
    for (const [id, e] of this.entites) {
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
      for (const entree of this.entrees.values()) {
        if (!e.sortes.has(entree.sorte)) continue;
        entree.effets.forEach((f, i) => {
          if (f.sur !== 'attribut' || !e.attributs.has(f.attribut)) return;
          ajouter(f.attribut, this.formules.get(chemins.effet(entree.id, i, 'valeur')));
          ajouter(f.attribut, this.formules.get(chemins.effet(entree.id, i, 'condition')));
        });
      }

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
      e.ordre = ordre;
    }
  }
}
