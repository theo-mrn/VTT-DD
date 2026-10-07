/**
 * Durées décomptées au nombre de tours (docs/combat.md § 18) : ce que deviennent les
 * possessions et les bonus libres à durée quand le combat avance, sans base ni réseau.
 *
 * Une durée (`duree`) perd un décompte à un **moment** (`decompte.moment`) : chaque fin de
 * round, ou le début ou la fin du tour d'un personnage (`decompte.de`, le porteur par défaut).
 * Le service qui mène le combat traduit chaque passage de tour en événements ; le service des
 * personnages les applique ici, dans l'ordre.
 */
import type { Fiche } from '../calcul/index.js';
import { formuleChamp, variablesObjet, type SystemeCharge } from '../chargement/index.js';
import { ErreurEvaluation, type Generateur, type Valeur } from '../formules/index.js';
import {
  nomPossession,
  type BonusLibre,
  type Decompte,
  type EtatEntite,
  type Possession,
} from '../schema/etat.js';
import type { DecompteDonne, DureeEntree, MomentDecompte } from '../schema/systeme.js';

/** Ce qui arrive à la table pendant un passage de tour, dans l'ordre. */
export type EvenementDuree =
  | { type: 'debut-tour'; personnage: string }
  | { type: 'fin-tour'; personnage: string }
  | { type: 'fin-round' }
  /** Fin du combat : tout ce qui a une durée est retiré. */
  | { type: 'fin-combat' };

/** Durée et décompte d'une possession ou d'un bonus libre. */
export interface Minuterie {
  duree?: number;
  decompte?: Decompte;
}

export interface OptionsDecompte {
  /** Identifiant du porteur (ancre d'un décompte sans `de`). */
  porteur: string;
  /**
   * Participants du combat : une durée dont l'ancre n'en est pas se décompte en fin de round,
   * pour ne jamais rester figée. Absent : toute ancre est valable.
   */
  participants?: Iterable<string>;
  /** Pour nommer les entrées expirées (nom propre d'un exemplaire, sinon de l'entrée). */
  systeme?: SystemeCharge;
}

/** Entrée ou bonus arrivé au bout de sa durée. */
export interface Expiree {
  /** `entree`, `entree#exemplaire` ou `bonus:<id>`. */
  cle: string;
  /** Nom lisible (nom du bonus, de l'exemplaire ou de l'entrée ; l'identifiant à défaut). */
  nom: string;
}

export interface ResultatDecompte {
  /** Nouvel état ; absent : rien n'a changé (rien à enregistrer). */
  etat?: EtatEntite;
  expirees: Expiree[];
}

/** Clé d'une possession dans les durées expirées : `entree` ou `entree#exemplaire`. */
export const cleDureePossession = (p: Pick<Possession, 'entree' | 'exemplaire'>) =>
  p.exemplaire === undefined ? p.entree : `${p.entree}#${p.exemplaire}`;

/** Clé d'un bonus libre dans les durées expirées. */
export const cleDureeBonus = (b: Pick<BonusLibre, 'id'>) => `bonus:${b.id}`;

/** Moment effectif : une ancre absente du combat se rabat sur la fin de round. */
function momentEffectif(d: Decompte | undefined, ancre: string, participants?: Set<string>) {
  const moment: MomentDecompte = d?.moment ?? 'fin-round';
  if (moment !== 'fin-round' && participants && !participants.has(ancre)) return 'fin-round';
  return moment;
}

/**
 * Applique les événements à une durée. Renvoie `null` si elle expire, la même minuterie si rien
 * ne change, sinon une nouvelle.
 */
export function avancerMinuterie<T extends Minuterie>(
  x: T,
  evenements: readonly EvenementDuree[],
  porteur: string,
  participants?: Set<string>,
): T | null {
  if (x.duree === undefined) return x;
  if (evenements.some((e) => e.type === 'fin-combat')) return null;
  const ancre = x.decompte?.de ?? porteur;
  const moment = momentEffectif(x.decompte, ancre, participants);
  let duree = x.duree;
  let attente = x.decompte?.attente === true;
  for (const e of evenements) {
    if (moment === 'fin-round') {
      if (e.type === 'fin-round') duree--;
    } else if ((e.type === 'debut-tour' || e.type === 'fin-tour') && e.personnage === ancre) {
      if (moment === 'debut-tour' && e.type === 'debut-tour') duree--;
      else if (moment === 'fin-tour' && e.type === 'debut-tour') attente = false;
      else if (moment === 'fin-tour' && e.type === 'fin-tour') {
        if (attente) attente = false;
        else duree--;
      }
    }
    if (duree <= 0) return null;
  }
  if (duree === x.duree && attente === (x.decompte?.attente === true)) return x;
  const suite: T = { ...x, duree };
  if (x.decompte) {
    const { attente: _, ...reste } = x.decompte;
    suite.decompte = attente ? { ...reste, attente } : reste;
  }
  return suite;
}

/**
 * Décompte des durées d'une fiche pour un passage de tour : chaque possession et chaque bonus
 * libre à durée avance avec les événements ; ceux arrivés à 0 sont retirés, exemplaire par
 * exemplaire, avec leurs effets (comme un retrait à la main). `fin-combat` retire tout ce qui a
 * une durée.
 */
export function decompterDurees(
  etat: EtatEntite,
  evenements: readonly EvenementDuree[],
  o: OptionsDecompte,
): ResultatDecompte {
  const aDuree = (x: Minuterie) => x.duree !== undefined;
  if (!evenements.length || (!etat.possessions.some(aDuree) && !etat.bonus.some(aDuree)))
    return { expirees: [] };
  const participants = o.participants ? new Set(o.participants) : undefined;
  const expirees: Expiree[] = [];
  let change = false;

  const possessions: Possession[] = [];
  for (const p of etat.possessions) {
    const suite = avancerMinuterie(p, evenements, o.porteur, participants);
    if (suite === p) possessions.push(p);
    else if (suite) {
      possessions.push(suite);
      change = true;
    } else {
      expirees.push({ cle: cleDureePossession(p), nom: nomDePossession(o.systeme, p) });
      // Activation arrivée à son terme : l'entrée s'éteint, elle reste possédée
      if (dureeActivationDe(o.systeme, p.entree)) possessions.push(eteinte(p));
      change = true;
    }
  }
  const bonus: BonusLibre[] = [];
  for (const b of etat.bonus) {
    const suite = avancerMinuterie(b, evenements, o.porteur, participants);
    if (suite === b) bonus.push(b);
    else if (suite) {
      bonus.push(suite);
      change = true;
    } else {
      expirees.push({ cle: cleDureeBonus(b), nom: b.nom });
      change = true;
    }
  }
  // Les effets coupés d'une source disparue sont oubliés par le service à l'enregistrement
  if (!change) return { expirees };
  return { etat: { ...etat, possessions, bonus }, expirees };
}

/** Durée d'activation déclarée par la sorte de l'entrée (`sorte.dureeActivation`). */
function dureeActivationDe(systeme: SystemeCharge | undefined, entree: string) {
  const sorte = systeme?.sortes.get(systeme.entrees.get(entree)?.sorte ?? '');
  return sorte?.activable ? sorte.dureeActivation : undefined;
}

/** Possession éteinte : inactive, sans durée. */
function eteinte(p: Possession): Possession {
  const { duree: _d, decompte: _c, ...reste } = p;
  return { ...reste, actif: false };
}

function nomDePossession(systeme: SystemeCharge | undefined, p: Possession): string {
  const entree = systeme?.entrees.get(p.entree);
  const sorte = entree && systeme?.sortes.get(entree.sorte);
  return entree && sorte ? nomPossession(entree, sorte, p) : p.entree;
}

// ─── Poser une durée ──────────────────────────────────────────────────────────

/**
 * Durée d'une activation (`sorte.dureeActivation`, docs/regles.md « Durées ») : la formule du
 * champ, lue sur le porteur au moment où il active l'entrée (dés tirés par `aleatoire`),
 * arrondie à l'entier inférieur, et son décompte. Absent : la sorte n'en déclare pas, l'entrée
 * n'a pas de formule pour ce champ, la formule ne se calcule pas, ou le résultat est inférieur
 * à 1 ; l'entrée reste alors active jusqu'à ce qu'on la coupe.
 */
export function dureeActivation(
  fiche: Fiche,
  entree: string,
  aleatoire?: Generateur,
): Minuterie | undefined {
  const systeme = fiche.systeme;
  const declaree = dureeActivationDe(systeme, entree);
  const e = systeme.entrees.get(entree);
  const sorte = e && systeme.sortes.get(e.sorte);
  const champ = sorte?.champs.find((c) => c.id === declaree?.champ);
  if (!declaree || !e || !sorte || !champ) return undefined;
  const p = fiche.possessions.get(entree);
  const f = formuleChamp(systeme, e, champ, p?.possession, fiche.etat.type);
  if (!f) return undefined;
  const lire = variablesObjet(
    e,
    sorte,
    { rang: p?.rang ?? 0, actif: true, quantite: p?.quantite ?? 1 },
    p?.possession,
  );
  const variable = (n: string): Valeur => {
    const x = lire(n);
    if (x === undefined) throw new ErreurEvaluation(`Variable inconnue : ${n}`, 0);
    return x;
  };
  const v = fiche.evaluer(f, { variable, ...(aleatoire ? { aleatoire } : {}) }, 0);
  const duree = Math.floor(Number(v));
  if (!Number.isFinite(duree) || duree < 1) return undefined;
  const decompte = poserDecompte(undefined, { moment: declaree.moment });
  return decompte ? { duree, decompte } : { duree };
}

/** Décompte demandé (à la pose) : moment, et ancre déjà résolue en identifiant. */
export interface DecompteSaisi {
  moment: MomentDecompte;
  /** Personnage dont le tour compte ; absent : le porteur. */
  de?: string;
}

/**
 * Décompte à enregistrer quand une durée est posée ou changée : `fin-round` n'a rien à
 * enregistrer (absent) ; `fin-tour` attend le prochain événement du tour de l'ancre, sauf si le
 * décompte ne change pas (l'attente déjà en cours est gardée).
 */
export function poserDecompte(
  ancien: Decompte | undefined,
  nouveau: DecompteSaisi | undefined,
): Decompte | undefined {
  if (!nouveau || nouveau.moment === 'fin-round') return undefined;
  const de = nouveau.de ? { de: nouveau.de } : {};
  if (nouveau.moment === 'debut-tour') return { moment: 'debut-tour', ...de };
  const meme = ancien?.moment === 'fin-tour' && ancien.de === nouveau.de;
  if (meme) return ancien;
  return { moment: 'fin-tour', ...de, attente: true };
}

/**
 * Durée et décompte d'une entrée donnée par une conséquence : la durée calculée de la
 * conséquence, sinon la durée par défaut de l'entrée ; le décompte de la conséquence, sinon
 * celui de l'entrée, sinon la fin de round.
 */
export function dureeDonnee(
  duree: number | undefined,
  decompte: DecompteDonne | undefined,
  parDefaut: DureeEntree | undefined,
): { duree?: number; decompte?: DecompteDonne } {
  const d = duree ?? parDefaut?.valeur;
  if (d === undefined) return {};
  const dc = decompte ?? (parDefaut ? { moment: parDefaut.moment, de: parDefaut.de } : undefined);
  return dc && dc.moment !== 'fin-round' ? { duree: d, decompte: dc } : { duree: d };
}

// ─── Libellés ─────────────────────────────────────────────────────────────────

export interface OptionsLibelle {
  /** Identifiant du porteur : une ancre égale au porteur se dit « son tour ». */
  porteur?: string;
  /** Nom d'un personnage (l'ancre). */
  nomDe?: (id: string) => string | undefined;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Libellé court d'une durée : « 2 rounds », « 1 tour » ; null : jusqu'au retrait. */
export function libelleCourtDuree(x: Minuterie): string | null {
  if (x.duree === undefined) return null;
  const moment = x.decompte?.moment ?? 'fin-round';
  return pluriel(x.duree, moment === 'fin-round' ? 'round' : 'tour');
}

/**
 * Libellé complet d'une durée : « 2 rounds », « jusqu'à la fin de son prochain tour »,
 * « jusqu'au début du prochain tour de Gobelin », « 3 tours, jusqu'à la fin du tour de Kira ».
 */
export function libelleDuree(x: Minuterie, o: OptionsLibelle = {}): string {
  if (x.duree === undefined) return 'jusqu’au retrait';
  const d = x.decompte;
  if (!d || d.moment === 'fin-round') return pluriel(x.duree, 'round');
  const nom = d.de && d.de !== o.porteur ? (o.nomDe?.(d.de) ?? 'un autre personnage') : null;
  const debut = d.moment === 'debut-tour';
  // « prochain » : le tour qui compte n'a pas encore commencé (début, ou fin en attente)
  const prochain = debut || d.attente === true;
  const tour = nom
    ? `du ${prochain ? 'prochain ' : ''}tour de ${nom}`
    : `de son ${prochain ? 'prochain ' : ''}tour`;
  const borne = debut ? `jusqu’au début ${tour}` : `jusqu’à la fin ${tour}`;
  return x.duree === 1 ? borne : `${pluriel(x.duree, 'tour')}, ${borne}`;
}
