/**
 * Achats : ce qu'une entité peut acheter, à quel coût, et pourquoi un achat
 * est bloqué. Tous les coûts, plafonds et conditions sont des formules du
 * système ; le moteur ne connaît aucune règle de progression.
 *
 * Variables des formules `cout`, `plafond` et `condition` d'un achat :
 * - `actuel` : pour un attribut, sa valeur de base enregistrée (sans les effets
 *   d'espèce, d'objet…) ; pour un rang ou un nœud, le rang total de l'entrée
 *   (rangs achetés + rangs gratuits d'effets, de choix ou de nœuds) ; pour une
 *   nouvelle entrée, 0 ;
 * - `cible` : `actuel + 1` ;
 * - `nombre` : nombre d'exemplaires de la sorte visée déjà possédés (0 pour
 *   un attribut) ;
 * - `creation` : vrai tant que la création n'est pas terminée ;
 * - `marque("m")` : vrai si l'entrée visée porte la marque `m`.
 *
 * Le plafond borne `cible` ; pour l'achat d'une nouvelle entrée, il borne le
 * nombre d'entrées de la sorte après achat (`nombre + 1`). Le coût d'un nœud
 * est la formule du nœud (variables `x`, `y`) plus le coût de l'achat.
 *
 * Achat d'une entrée déjà possédée (`obtient: entree`) : une unité de plus sur
 * le dernier exemplaire pour une sorte `quantites`, sinon un nouvel exemplaire
 * pour une sorte `exemplaires` ; sinon l'achat est bloqué (`deja`). Le
 * `maximum` de la sorte compte les exemplaires.
 */
import { systemePour } from '../chargement/entrees-libres.js';
import { calculer, type Fiche, type PossessionEffective } from '../calcul/index.js';
import { donnerEntree, retirerEntree } from '../jets/modifications.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import type { FormuleVerifiee, Valeur } from '../formules/index.js';
import type {
  Achat,
  Arbre,
  Attribut,
  Entree,
  EtatEntite,
  LigneJournal,
  Sorte,
} from '../schema/index.js';
import { arbreOuvert, noeudRelie, noeudsAcquis, noeudsIsoles } from './arbres.js';
import { solde } from './monnaies.js';
import { nouvellePossession } from '../schema/index.js';
import { copier, essayer, valeurBase, variables } from './outils.js';

export type TypeAchat = Achat['obtient']['type'];

export type CodeBlocage =
  | 'deja'
  | 'non-possedable'
  | 'exige'
  | 'maximum'
  | 'rang-max'
  | 'limite-attribut'
  | 'arbre-ferme'
  | 'non-relie'
  | 'condition'
  | 'plafond'
  | 'solde'
  | 'erreur';

export interface Blocage {
  code: CodeBlocage;
  message: string;
}

export interface ObjetAchetable {
  achat: string;
  /** Clé d'attribut, identifiant d'entrée, ou `arbre/noeud`. */
  objet: string;
  nom: string;
  type: TypeAchat;
  actuel: number;
  cible: number;
  nombre: number;
  /** Coût total (pour un nœud : coût du nœud + coût de l'achat). */
  cout: number;
  plafond?: number;
  monnaie: string;
  possible: boolean;
  /** Raisons de blocage, vide si l'achat est possible. */
  blocages: Blocage[];
  /** Entrée obtenue (rang, entrée ou nœud). */
  entree?: string;
  /**
   * Achat d'une entrée : nouvelle possession, nouvel exemplaire d'une entrée
   * déjà possédée (sorte `exemplaires`), ou une unité de plus (sorte `quantites`).
   */
  mode?: ModeAchatEntree;
  arbre?: string;
  noeud?: string;
}

export type ModeAchatEntree = 'nouvelle' | 'exemplaire' | 'quantite';

export interface AchatDisponible {
  achat: Achat;
  /** Reste de la monnaie de l'achat. */
  solde: number;
  objets: ObjetAchetable[];
}

export interface DemandeAchat {
  achat: string;
  objet: string;
  /** Date enregistrée au journal (fournie par l'appelant : le moteur ne lit pas l'horloge). */
  date?: string;
}

export type ResultatAchat =
  | { ok: true; etat: EtatEntite; ligne: LigneJournal; objet: ObjetAchetable }
  | { ok: false; erreur: string; objet?: ObjetAchetable };

export type ResultatRemboursement =
  { ok: true; etat: EtatEntite; ligne: LigneJournal } | { ok: false; erreur: string };

type Noeud = Arbre['noeuds'][number];

/** Ce qu'un achat peut viser, avant examen des coûts et conditions. */
interface Candidat {
  type: TypeAchat;
  objet: string;
  nom: string;
  actuel: number;
  nombre: number;
  /** Déjà possédé (entrée) ou acquis (nœud). */
  deja: boolean;
  mode?: ModeAchatEntree;
  attribut?: Attribut;
  entree?: Entree;
  sorte?: Sorte;
  arbre?: Arbre;
  noeud?: Noeud;
}

/** L'achat est-il ouvert au moment courant (création ou jeu) ? */
export function momentValide(achat: Achat, creation: boolean): boolean {
  return achat.moment === 'toujours' || (achat.moment === 'creation') === creation;
}

function monnaieValide(fiche: Fiche, achat: Achat): boolean {
  return !!fiche.systeme.monnaies.get(achat.monnaie)?.pour.includes(fiche.etat.type);
}

/** Exemplaires possédés d'une sorte (une entrée obtenue par effet compte pour un). */
function compteSorte(fiche: Fiche, sorte: string): number {
  let n = 0;
  for (const p of fiche.possessions.values())
    if (p.sorte.id === sorte) n += Math.max(1, p.exemplaires.length);
  return n;
}

/** Ce que donnerait l'achat d'une entrée, selon ce qui est déjà possédé ; `undefined` : rien. */
function modeEntree(p: PossessionEffective | undefined, sorte: Sorte): ModeAchatEntree | undefined {
  if (!p) return 'nouvelle';
  if (sorte.quantites && p.exemplaires.length) return 'quantite';
  if (sorte.exemplaires || sorte.quantites) return 'exemplaire';
  return undefined;
}

function candidats(fiche: Fiche, achat: Achat): Candidat[] {
  const o = achat.obtient;
  switch (o.type) {
    case 'attribut':
      return candidatsAttributs(fiche, o);
    case 'rang':
    case 'entree':
      return candidatsEntrees(fiche, o);
    case 'noeud':
      return candidatsNoeuds(fiche, o);
  }
}

type Obtient<T extends Achat['obtient']['type']> = Extract<Achat['obtient'], { type: T }>;

/** Attributs de base achetables : listés ou du groupe, d'une règle optionnelle active. */
function candidatsAttributs(fiche: Fiche, o: Obtient<'attribut'>): Candidat[] {
  const { etat } = fiche;
  if (o.entite !== etat.type) return [];
  const cles = new Set(o.attributs ?? []);
  if (o.groupe)
    for (const a of fiche.entite.attributs.values())
      if (a.groupe === o.groupe && a.nature === 'base') cles.add(a.cle);
  const r: Candidat[] = [];
  for (const cle of cles) {
    const a = fiche.entite.attributs.get(cle);
    // Un attribut d'une règle optionnelle éteinte ne s'achète pas
    if (a?.nature !== 'base' || !fiche.attributActif(cle)) continue;
    r.push({
      type: 'attribut',
      objet: cle,
      nom: a.nom,
      actuel: valeurBase(etat, a),
      nombre: 0,
      deja: false,
      attribut: a,
    });
  }
  return r;
}

/** Entrées d'une sorte possédable : un rang de plus, ou l'entrée (ou un exemplaire) à prendre. */
function candidatsEntrees(fiche: Fiche, o: Obtient<'rang' | 'entree'>): Candidat[] {
  const { systeme, etat } = fiche;
  const sorte = systeme.sortes.get(o.sorte);
  if (!sorte?.pour.includes(etat.type)) return [];
  const nombre = compteSorte(fiche, sorte.id);
  return [...systeme.entrees.values()]
    .filter((e) => e.sorte === sorte.id)
    .map((e) => {
      const p = fiche.possessions.get(e.id);
      const mode = o.type === 'entree' ? modeEntree(p, sorte) : undefined;
      return {
        type: o.type,
        objet: e.id,
        nom: e.nom,
        actuel: o.type === 'rang' ? (p?.rang ?? 0) : 0,
        nombre,
        deja: o.type === 'entree' && !mode,
        ...(mode ? { mode } : {}),
        entree: e,
        sorte,
      };
    });
}

/** Nœuds des arbres visés dont l'entrée existe. */
function candidatsNoeuds(fiche: Fiche, o: Obtient<'noeud'>): Candidat[] {
  const { systeme, etat } = fiche;
  const arbres = [...systeme.arbres.values()].filter((a) => !o.arbres || o.arbres.includes(a.id));
  return arbres.flatMap((arbre) => {
    const acquis = noeudsAcquis(etat, arbre.id);
    return arbre.noeuds.flatMap((n): Candidat[] => {
      const entree = systeme.entrees.get(n.entree);
      const sorte = entree && systeme.sortes.get(entree.sorte);
      if (!entree || !sorte) return [];
      return [
        {
          type: 'noeud',
          objet: `${arbre.id}/${n.id}`,
          nom: entree.nom,
          actuel: fiche.possessions.get(entree.id)?.rang ?? 0,
          nombre: compteSorte(fiche, sorte.id),
          deja: acquis.has(n.id),
          entree,
          sorte,
          arbre,
          noeud: n,
        },
      ];
    });
  });
}

/** Valeur calculée du candidat : celle de l'attribut, 0 pour une entrée, sinon l'actuelle. */
function valeurCalculee(fiche: Fiche, c: Candidat): number {
  if (c.attribut) return Number(fiche.valeur(c.attribut.cle));
  return c.type === 'entree' ? 0 : c.actuel;
}

const VIDE_PAR_TYPE: Partial<Record<string, number | boolean>> = { nombre: 0, booleen: false };

/** Ce que les vérifications d'un candidat partagent : fiche, cible, blocages, évaluations. */
interface Examen {
  fiche: Fiche;
  c: Candidat;
  cible: number;
  bloquer(code: CodeBlocage, message: string): void;
  nombreDe(f: FormuleVerifiee, quoi: string): number | undefined;
  vrai(f: FormuleVerifiee, quoi: string): boolean | undefined;
}

/** Entrée visée : prérequis, maximum de la sorte, rang maximal. */
function examinerEntree(
  { fiche, c, cible, bloquer, nombreDe, vrai }: Examen,
  entree: NonNullable<Candidat['entree']>,
  sorte: NonNullable<Candidat['sorte']>,
): void {
  const { systeme } = fiche;
  const exige = systeme.formules.get(chemins.exige(entree.id));
  if (exige && vrai(exige, 'Prérequis') === false)
    bloquer('exige', `Prérequis non rempli pour ${entree.nom} : ${exige.texte}`);
  const maximum = sorte.maximum;
  const nouvelle = !fiche.possessions.has(entree.id) || c.mode === 'exemplaire';
  if (nouvelle && maximum !== undefined && c.nombre >= maximum)
    bloquer(
      'maximum',
      `Maximum de ${maximum} ${sorte.nomPluriel ?? sorte.nom} atteint (${c.nombre})`,
    );
  if ((c.type !== 'rang' && c.type !== 'noeud') || !sorte.rangs) return;
  const max = nombreDe(systeme.formule(chemins.rangsMax(sorte.id)), 'Rang maximal');
  if (max !== undefined && cible > max)
    bloquer('rang-max', `${entree.nom} : rang maximal ${max} atteint`);
}

/** Attribut visé : la cible ne dépasse pas son maximum. */
function examinerAttribut({ fiche, cible, bloquer }: Examen, a: Attribut): void {
  const max = fiche.valeurs.get(a.cle)?.max;
  if (max !== undefined && cible > max)
    bloquer('limite-attribut', `${a.nom} ne peut pas dépasser ${max}`);
}

/** Nœud d'arbre : arbre ouvert, nœud relié à un nœud acquis ; renvoie son coût. */
function examinerNoeud(
  { fiche, c, bloquer }: Examen,
  arbre: NonNullable<Candidat['arbre']>,
  noeud: NonNullable<Candidat['noeud']>,
): number {
  const { systeme, etat } = fiche;
  if (!arbreOuvert(fiche, arbre)) {
    const par = arbre.ouvertPar && systeme.entrees.get(arbre.ouvertPar);
    bloquer('arbre-ferme', `Arbre « ${arbre.nom} » fermé${par ? ` : ${par.nom} requis` : ''}`);
  } else if (!c.deja && !noeudRelie(arbre, noeudsAcquis(etat, arbre.id), noeud.id)) {
    bloquer('non-relie', `${c.nom} n’est relié à aucun nœud acquis`);
  }
  const r = essayer(fiche, systeme.formule(chemins.noeud(arbre.id, noeud.id)), {
    variable: variables({ x: noeud.x, y: noeud.y }),
  });
  if (r.ok) return Number(r.valeur);
  bloquer('erreur', `Coût du nœud : ${r.message}`);
  return 0;
}

/** Plafond de l'achat, s'il en déclare un ; bloque quand la cible le dépasse. */
function examinerPlafond({ fiche, c, cible, bloquer, nombreDe }: Examen, achat: Achat) {
  const fp = fiche.systeme.formules.get(chemins.achat(achat.id, 'plafond'));
  if (!fp) return undefined;
  const plafond = nombreDe(fp, 'Plafond');
  const borne = c.type === 'entree' ? c.nombre + 1 : cible;
  if (plafond !== undefined && borne > plafond) bloquer('plafond', `Plafond atteint (${plafond})`);
  return plafond;
}

function examiner(fiche: Fiche, achat: Achat, c: Candidat, disponible: number): ObjetAchetable {
  const { systeme, etat } = fiche;
  const blocages: Blocage[] = [];
  const bloquer = (code: CodeBlocage, message: string) => blocages.push({ code, message });
  const cible = c.actuel + 1;
  const vise = c.entree?.id ?? c.objet;
  const extra = {
    variable: variables({
      actuel: c.actuel,
      calcule: valeurCalculee(fiche, c),
      cible,
      nombre: c.nombre,
      creation: etat.creation,
      ...champsEntree(fiche, c),
    }),
    fonctions: { marque: (m: unknown) => fiche.marques.get(vise)?.has(String(m)) ?? false },
  };
  const nombreDe = (f: FormuleVerifiee, quoi: string): number | undefined => {
    const r = essayer(fiche, f, extra);
    if (r.ok) return Number(r.valeur);
    bloquer('erreur', `${quoi} : ${r.message}`);
    return undefined;
  };
  const vrai = (f: FormuleVerifiee, quoi: string): boolean | undefined => {
    const r = essayer(fiche, f, extra);
    if (r.ok) return r.valeur === true;
    bloquer('erreur', `${quoi} : ${r.message}`);
    return undefined;
  };

  const ex: Examen = { fiche, c, cible, bloquer, nombreDe, vrai };
  if (c.deja) bloquer('deja', c.type === 'noeud' ? 'Nœud déjà acquis' : `${c.nom} déjà possédé`);
  if (c.sorte && !c.sorte.pour.includes(etat.type))
    bloquer('non-possedable', `${c.sorte.nom} non possédable par ${fiche.entite.type.nom}`);
  if (c.entree && c.sorte) examinerEntree(ex, c.entree, c.sorte);
  if (c.attribut) examinerAttribut(ex, c.attribut);
  const coutNoeud = c.arbre && c.noeud ? examinerNoeud(ex, c.arbre, c.noeud) : 0;

  const condition = systeme.formules.get(chemins.achat(achat.id, 'condition'));
  if (condition && vrai(condition, 'Condition') === false)
    bloquer('condition', `Condition non remplie : ${condition.texte}`);
  const plafond = examinerPlafond(ex, achat);

  const coutAchat = nombreDe(systeme.formule(chemins.achat(achat.id, 'cout')), 'Coût');
  const cout = (coutAchat ?? 0) + coutNoeud;
  if (coutAchat !== undefined && cout > disponible)
    bloquer('solde', `Solde insuffisant : ${cout} requis, ${disponible} disponible`);

  return {
    ...objetDe(c),
    achat: achat.id,
    cible,
    cout,
    ...(plafond !== undefined ? { plafond } : {}),
    monnaie: achat.monnaie,
    possible: blocages.length === 0,
    blocages,
  };
}

/** Ce qu'un candidat désigne : objet, rang actuel, entrée, mode, nœud d'arbre. */
function objetDe(c: Candidat) {
  return {
    objet: c.objet,
    nom: c.nom,
    type: c.type,
    actuel: c.actuel,
    nombre: c.nombre,
    ...(c.entree ? { entree: c.entree.id } : {}),
    ...(c.mode ? { mode: c.mode } : {}),
    ...(c.arbre && c.noeud ? { arbre: c.arbre.id, noeud: c.noeud.id } : {}),
  };
}

/**
 * Achats ouverts au moment courant (création ou jeu), avec tout ce qu'ils
 * permettent d'obtenir. Les entrées déjà possédées et les nœuds déjà acquis
 * ne sont pas listés ; les objets bloqués le sont, avec leurs raisons.
 */
export function achatsPossibles(fiche: Fiche, ids?: string[]): AchatDisponible[] {
  const r: AchatDisponible[] = [];
  for (const achat of fiche.systeme.achats.values()) {
    if (ids && !ids.includes(achat.id)) continue;
    if (!momentValide(achat, fiche.etat.creation) || !monnaieValide(fiche, achat)) continue;
    const liste = candidats(fiche, achat);
    if (!liste.length) continue;
    const reste = solde(fiche, achat.monnaie);
    r.push({
      achat,
      solde: reste,
      objets: liste.filter((c) => !c.deja).map((c) => examiner(fiche, achat, c, reste)),
    });
  }
  return r;
}

/** Examine un seul objet d'un achat, qu'il soit listé ou non par `achatsPossibles`. */
export function examinerAchat(
  fiche: Fiche,
  achatId: string,
  objet: string,
): { ok: true; objet: ObjetAchetable } | { ok: false; erreur: string } {
  const achat = fiche.systeme.achats.get(achatId);
  if (!achat) return { ok: false, erreur: `Achat inconnu : ${achatId}` };
  if (!momentValide(achat, fiche.etat.creation)) {
    return {
      ok: false,
      erreur: `« ${achat.nom} » n’est possible ${achat.moment === 'creation' ? 'qu’à la création' : 'qu’en jeu'}`,
    };
  }
  if (!monnaieValide(fiche, achat))
    return { ok: false, erreur: `« ${achat.nom} » n’est pas ouvert à ${fiche.entite.type.nom}` };
  const c = candidats(fiche, achat).find((x) => x.objet === objet);
  if (!c) return { ok: false, erreur: `« ${objet} » ne s’obtient pas par « ${achat.nom} »` };
  return { ok: true, objet: examiner(fiche, achat, c, solde(fiche, achat.monnaie)) };
}

/** Vérifie puis applique un achat, et l'inscrit au journal. */
export function acheter(
  systeme: SystemeCharge,
  etat: EtatEntite,
  demande: DemandeAchat,
): ResultatAchat {
  systeme = systemePour(systeme, etat);
  const fiche = calculer(systeme, etat);
  const ex = examinerAchat(fiche, demande.achat, demande.objet);
  if (!ex.ok) return ex;
  const o = ex.objet;
  if (!o.possible)
    return { ok: false, erreur: o.blocages.map((b) => b.message).join(' ; '), objet: o };

  const suivant = copier(etat);
  switch (o.type) {
    case 'attribut':
      suivant.valeurs[o.objet] = o.cible;
      break;
    case 'rang': {
      const p = suivant.possessions.find((x) => x.entree === o.objet);
      if (p) p.rang += 1;
      else suivant.possessions.push(nouvellePossession(o.objet, 1));
      break;
    }
    case 'entree':
      // Nouvelle possession, nouvel exemplaire ou une unité de plus
      suivant.possessions = donnerEntree(systeme, suivant.possessions, o.objet, { rangs: 1 });
      break;
    case 'noeud':
      suivant.noeuds[o.arbre!] = [...(suivant.noeuds[o.arbre!] ?? []), o.noeud!];
      break;
  }
  const ligne: LigneJournal = {
    achat: o.achat,
    objet: o.objet,
    cout: o.cout,
    monnaie: o.monnaie,
    creation: etat.creation,
    ...(demande.date !== undefined ? { date: demande.date } : {}),
  };
  suivant.journal.push(ligne);
  return { ok: true, etat: suivant, ligne, objet: o };
}

/** Attribut, entrée (rang ou entrée) ou nœud : deux achats du même genre visent le même objet. */
function genre(achat: Achat): 'attribut' | 'entree' | 'noeud' {
  const t = achat.obtient.type;
  return t === 'rang' ? 'entree' : t;
}

/**
 * Annule un achat du journal et rend son coût. Seul le dernier achat d'un
 * objet s'annule (on retire les rangs dans l'ordre inverse), et un achat de
 * création ne s'annule plus une fois la création terminée.
 */
export function rembourser(
  systeme: SystemeCharge,
  etat: EtatEntite,
  index: number,
): ResultatRemboursement {
  systeme = systemePour(systeme, etat);
  const ligne = etat.journal[index];
  if (!ligne) return { ok: false, erreur: `Aucun achat à la ligne ${index} du journal` };
  const achat = systeme.achats.get(ligne.achat);
  if (!achat) return { ok: false, erreur: `Achat inconnu : ${ligne.achat}` };
  if (ligne.creation && !etat.creation)
    return {
      ok: false,
      erreur: 'Un achat de création ne s’annule plus une fois la création terminée',
    };
  const memeObjet = (i: number) => {
    const l = etat.journal[i]!;
    const a = systeme.achats.get(l.achat);
    return l.objet === ligne.objet && !!a && genre(a) === genre(achat);
  };
  for (let i = index + 1; i < etat.journal.length; i++) {
    if (memeObjet(i))
      return {
        ok: false,
        erreur: `Un achat plus récent de « ${ligne.objet} » doit être annulé d’abord`,
      };
  }

  const suivant = copier(etat);
  suivant.journal.splice(index, 1);
  const erreur = ANNULER[achat.obtient.type](systeme, suivant, ligne.objet);
  return erreur ? { ok: false, erreur } : { ok: true, etat: suivant, ligne };
}

type Annuler = (systeme: SystemeCharge, suivant: EtatEntite, objet: string) => string | null;

/** Annulation d'un achat sur l'état suivant, par genre d'achat ; renvoie le refus éventuel. */
const ANNULER: Record<Achat['obtient']['type'], Annuler> = {
  attribut: (_, suivant, objet) => {
    const v = suivant.valeurs[objet];
    if (typeof v !== 'number') return `Aucune valeur enregistrée pour ${objet}`;
    suivant.valeurs[objet] = v - 1;
    return null;
  },
  rang: (systeme, suivant, objet) => {
    const i = suivant.possessions.findIndex((p) => p.entree === objet && p.rang > 0);
    const p = suivant.possessions[i];
    if (!p) return `Aucun rang acheté dans ${objet}`;
    p.rang -= 1;
    // Possession créée par cet achat : on la retire pour que `possede()` redevienne faux
    const vide = !Object.keys(p.choix).length && !Object.keys(p.champs).length;
    const autres = suivant.journal.some((l) => {
      const a = systeme.achats.get(l.achat);
      return l.objet === objet && !!a && genre(a) === 'entree';
    });
    if (p.rang === 0 && vide && !autres) suivant.possessions.splice(i, 1);
    return null;
  },
  entree: (systeme, suivant, objet) => {
    if (!suivant.possessions.some((p) => p.entree === objet)) return `${objet} n’est pas possédé`;
    // Une unité de moins, ou le dernier exemplaire retiré
    suivant.possessions = retirerEntree(systeme, suivant.possessions, objet, { rangs: 1 });
    if (suivant.possessions.some((p) => p.entree === objet)) return null;
    const arbre = [...systeme.arbres.values()].find(
      (a) => a.ouvertPar === objet && suivant.noeuds[a.id]?.length,
    );
    return arbre ? `Des nœuds de l’arbre « ${arbre.nom} » dépendent de ${objet}` : null;
  },
  noeud: (systeme, suivant, objet) => {
    const [arbreId, noeudId] = objet.split('/') as [string, string];
    const arbre = systeme.arbres.get(arbreId);
    const acquis = noeudsAcquis(suivant, arbreId);
    if (!arbre || !acquis.delete(noeudId)) return `Nœud non acquis : ${objet}`;
    const isoles = noeudsIsoles(arbre, acquis);
    if (isoles.length) return `Nœuds qui ne seraient plus reliés : ${isoles.join(', ')}`;
    suivant.noeuds[arbreId] = (suivant.noeuds[arbreId] ?? []).filter((n) => n !== noeudId);
    return null;
  },
};

/** Champs de l'entrée visée, exposés aux formules d'achat sous la forme `entree.<champ>`. */
function champsEntree(fiche: Fiche, c: Candidat): Record<string, Valeur> {
  const vars: Record<string, Valeur> = {};
  if (!c.entree || !c.sorte) return vars;
  for (const champ of c.sorte.champs) {
    if (champ.type === 'entrees') continue;
    const v = c.entree.champs[champ.id];
    if (champ.type === 'formule') {
      const f = fiche.systeme.formules.get(chemins.champ(c.entree.id, champ.id));
      vars[`entree.${champ.id}`] = f ? fiche.evaluer(f, {}, 0) : 0;
    } else if (v !== undefined && !Array.isArray(v)) {
      vars[`entree.${champ.id}`] = v;
    } else if ('defaut' in champ && champ.defaut !== undefined) {
      vars[`entree.${champ.id}`] = champ.defaut;
    } else {
      vars[`entree.${champ.id}`] = VIDE_PAR_TYPE[champ.type] ?? '';
    }
  }
  return vars;
}
