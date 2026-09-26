/**
 * Opérations sur l'état d'un personnage, sans base de données : chacune part
 * d'un état validé, délègue les règles à @vtt/rules et renvoie un nouvel état
 * (jamais l'état reçu modifié). Un refus des règles devient une erreur 422
 * (problem+json) avec le message du moteur.
 */
import { HttpError } from '@vtt/platform';
import {
  acheter,
  acheterEtape,
  BonusLibre,
  compilerEffets,
  Effet,
  estExemplaire,
  nouvellePossession,
  nouvelExemplaire,
  prefixeExemplaire,
  refusSaisie,
  variablesSource,
  appliquerModifications,
  calculer,
  choisirEtape,
  creationDe,
  EtatEntite,
  executerAction,
  initiative,
  recuperer,
  rembourser,
  repartirEtape,
  saisirEtape,
  terminerCreation,
  tirerEtape,
  type Attribut,
  type Fiche,
  type Generateur,
  type Possession,
  type ResultatAction,
  type Saisisseur,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { z } from 'zod';

/** Refus des règles du système : la requête est bien formée mais ne peut pas s'appliquer. */
export function refus(message: string, code = 'regle_non_respectee'): HttpError {
  return new HttpError(422, 'Refusé par les règles du système', code, message);
}

type Resultat = { ok: true; etat: EtatEntite } | { ok: false; erreur: string };

function ouRefus(r: Resultat): EtatEntite {
  if (!r.ok) throw refus(r.erreur);
  return r.etat;
}

/** Corps de requête lu avec un schéma Zod : erreur 400 lisible s'il ne correspond pas. */
export function lireCorps<S extends z.ZodType>(schema: S, corps: unknown): z.output<S> {
  const r = schema.safeParse(corps);
  if (r.success) return r.data;
  const detail = r.error.issues
    .map((i) => `${i.path.length ? i.path.join('.') : 'corps'} : ${i.message}`)
    .join(' ; ');
  throw HttpError.badRequest(detail, 'validation_failed');
}

// ─── État ─────────────────────────────────────────────────────────────────────

/** État de départ d'une entité : vide, en cours de création. */
export function etatInitial(systeme: SystemeCharge, type: string): EtatEntite {
  if (!systeme.entites.has(type)) {
    const types = [...systeme.entites.keys()].join(', ');
    throw refus(
      `Type d’entité inconnu de ${systeme.source.nom} : ${type} (${types})`,
      'type_inconnu',
    );
  }
  return EtatEntite.parse({
    type,
    systeme: { id: systeme.source.id, version: systeme.source.version },
    creation: true,
  });
}

/**
 * Valide un état à enregistrer (schéma EtatEntite, système et type connus) et
 * le recalcule. Toute écriture passe par ici : un état qui ne se calcule pas
 * n'est jamais enregistré.
 */
export function verifierEtat(
  systeme: SystemeCharge,
  brut: unknown,
): { etat: EtatEntite; fiche: Fiche } {
  const r = EtatEntite.safeParse(brut);
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; ');
    throw refus(`État invalide : ${detail}`, 'etat_invalide');
  }
  const etat = r.data;
  if (etat.systeme.id !== systeme.source.id)
    throw refus(`État d’un autre système : ${etat.systeme.id}`, 'etat_invalide');
  if (!systeme.entites.has(etat.type))
    throw refus(`Type d’entité inconnu : ${etat.type}`, 'etat_invalide');
  for (const p of etat.possessions) {
    if (!systeme.entrees.has(p.entree))
      throw refus(`Entrée inconnue du système : ${p.entree}`, 'etat_invalide');
  }
  return { etat, fiche: calculer(systeme, etat) };
}

// ─── Valeurs saisies ──────────────────────────────────────────────────────────

const VALEUR = z.union([z.number().finite(), z.string().max(10_000), z.boolean()]);
export const Valeurs = z.record(z.string().min(1).max(100), VALEUR);

/** Erreur d'une valeur saisie pour un attribut, bornes lues sur la fiche recalculée. */
function erreurValeur(fiche: Fiche, a: Attribut, v: Valeur): string | undefined {
  switch (a.nature) {
    case 'base':
    case 'ressource': {
      if (typeof v !== 'number') return `${a.nom} : nombre attendu`;
      const c = fiche.valeurs.get(a.cle);
      if (c?.min !== undefined && v < c.min) return `${a.nom} : ${v} inférieur au minimum ${c.min}`;
      if (c?.max !== undefined && v > c.max) return `${a.nom} : ${v} supérieur au maximum ${c.max}`;
      return undefined;
    }
    case 'texte':
      return typeof v === 'string' ? undefined : `${a.nom} : texte attendu`;
    case 'choix':
      return typeof v === 'string' && a.options.some((o) => o.valeur === v)
        ? undefined
        : `${a.nom} : option inconnue « ${String(v)} »`;
    case 'booleen':
      return typeof v === 'boolean' ? undefined : `${a.nom} : oui ou non attendu`;
    case 'derivee':
      return `${a.nom} est calculé, il ne se saisit pas`;
  }
}

/**
 * Saisie libre de valeurs : texte, choix, booléen et ressource à tout moment
 * (propriétaire ou MJ). Un attribut de base se saisit pendant la création,
 * puis selon sa `saisie` (voir `refusSaisie` de @vtt/rules) : `jeu` par le
 * propriétaire ou le MJ, `mj` par le MJ seul (refus 403 pour le propriétaire),
 * `creation` plus du tout (refus 422 : il s'achète).
 */
export function modifierValeurs(
  systeme: SystemeCharge,
  etat: EtatEntite,
  valeurs: Record<string, Valeur>,
  qui: Saisisseur = { proprietaire: true, mj: false },
): EtatEntite {
  const entite = systeme.entites.get(etat.type)!;
  const erreurs: string[] = [];
  const reservees: string[] = [];
  const suivant: EtatEntite = { ...etat, valeurs: { ...etat.valeurs } };
  for (const [cle, v] of Object.entries(valeurs)) {
    const a = entite.attributs.get(cle);
    if (!a) {
      erreurs.push(`Attribut inconnu : ${cle}`);
      continue;
    }
    const raison = refusSaisie(a, etat.creation, qui);
    if (!raison) suivant.valeurs[cle] = v;
    else if (a.nature === 'base' && a.saisie === 'mj') reservees.push(raison);
    else erreurs.push(raison);
  }
  if (reservees.length)
    throw new HttpError(403, 'Accès refusé', 'saisie_reservee_mj', reservees.join(' ; '));
  if (erreurs.length) throw refus(erreurs.join(' ; '));
  const fiche = calculer(systeme, suivant);
  for (const [cle, v] of Object.entries(valeurs)) {
    const err = erreurValeur(fiche, entite.attributs.get(cle)!, v);
    if (err) erreurs.push(err);
  }
  if (erreurs.length) throw refus(erreurs.join(' ; '));
  return suivant;
}

/**
 * Vrai si la saisie touche un attribut de base réservé au MJ (`saisie: mj`) :
 * seul ce cas demande de savoir si le propriétaire est aussi MJ de la salle.
 */
export function saisieReserveeMj(
  systeme: SystemeCharge,
  type: string,
  valeurs: Record<string, Valeur>,
): boolean {
  const attributs = systeme.entites.get(type)?.attributs;
  return Object.keys(valeurs).some((cle) => {
    const a = attributs?.get(cle);
    return a?.nature === 'base' && a.saisie === 'mj';
  });
}

// ─── Création par étapes ──────────────────────────────────────────────────────

const Id = z.string().min(1).max(200);

/** Corps attendu par chaque type d'étape (en plus de `version`). */
export const CorpsEtape = {
  choisir: z.object({
    entrees: z
      .array(z.object({ entree: Id, choix: z.record(Id, z.array(Id).max(100)).optional() }))
      .max(100),
  }),
  repartir: z.object({ valeurs: z.record(Id, z.number().finite()) }),
  saisir: z.object({ valeurs: Valeurs }),
  tirer: z.object({ affectation: z.record(Id, z.number().int().nonnegative()).optional() }),
  acheter: z.object({ achat: Id, objet: z.string().min(1).max(400) }),
} as const;

export interface EtapeAppliquee {
  etat: EtatEntite;
  /** Détails pour l'événement (tirage effectué, achat…). */
  details: Record<string, unknown>;
}

/** Applique une étape de création, avec le corps propre à son type. */
export function appliquerEtape(
  systeme: SystemeCharge,
  etat: EtatEntite,
  etapeId: string,
  corps: unknown,
  aleatoire: Generateur,
  date: string,
): EtapeAppliquee {
  if (!etat.creation) throw refus('La création est terminée', 'creation_terminee');
  const etape = creationDe(systeme, etat.type)?.etapes.find((e) => e.id === etapeId);
  if (!etape) throw HttpError.notFound(`Étape de création inconnue : ${etapeId}`);

  switch (etape.type) {
    case 'choisir': {
      const { entrees } = lireCorps(CorpsEtape.choisir, corps);
      return {
        etat: ouRefus(choisirEtape(systeme, etat, etape.id, entrees)),
        details: { entrees },
      };
    }
    case 'repartir': {
      const { valeurs } = lireCorps(CorpsEtape.repartir, corps);
      return {
        etat: ouRefus(repartirEtape(systeme, etat, etape.id, valeurs)),
        details: { valeurs },
      };
    }
    case 'saisir': {
      const { valeurs } = lireCorps(CorpsEtape.saisir, corps);
      return { etat: ouRefus(saisirEtape(systeme, etat, etape.id, valeurs)), details: {} };
    }
    case 'tirer': {
      const { affectation } = lireCorps(CorpsEtape.tirer, corps);
      const r = tirerEtape(systeme, etat, etape.id, aleatoire);
      if (!r.ok) throw refus(r.erreur);
      // Attribution libre d'une seule valeur (dé de vie…) : elle ne peut aller qu'à cet attribut
      const seule =
        !affectation && r.attribution === 'libre' && r.attributs.length === 1
          ? { [r.attributs[0]!]: 0 }
          : affectation;
      return {
        etat: ouRefus(r.attribuer(seule)),
        // Tirage complet (dés compris) : l'historique garde la preuve du jet
        details: { attributs: r.attributs, retenu: r.retenu, essais: r.tirages.length },
      };
    }
    case 'acheter': {
      const { achat, objet } = lireCorps(CorpsEtape.acheter, corps);
      const r = acheterEtape(systeme, etat, etape.id, { achat, objet, date });
      if (!r.ok) throw refus(r.erreur);
      return { etat: r.etat, details: { ligne: r.ligne } };
    }
  }
}

/** Termine la création si toutes les étapes sont faites. */
export function terminer(systeme: SystemeCharge, etat: EtatEntite): EtatEntite {
  return ouRefus(terminerCreation(systeme, etat));
}

// ─── Achats ───────────────────────────────────────────────────────────────────

export function acheterObjet(
  systeme: SystemeCharge,
  etat: EtatEntite,
  demande: { achat: string; objet: string },
  date: string,
): EtapeAppliquee {
  const r = acheter(systeme, etat, { ...demande, date });
  if (!r.ok) throw refus(r.erreur);
  return { etat: r.etat, details: { ligne: r.ligne } };
}

export function rembourserLigne(
  systeme: SystemeCharge,
  etat: EtatEntite,
  index: number,
): EtapeAppliquee {
  const r = rembourser(systeme, etat, index);
  if (!r.ok) throw refus(r.erreur);
  return { etat: r.etat, details: { index, ligne: r.ligne } };
}

// ─── Possessions ──────────────────────────────────────────────────────────────

export const DemandePossession = z.object({
  entree: Id,
  /**
   * Exemplaire visé (sorte `exemplaires`) ; absent : l'exemplaire sans
   * identifiant. Avec `nouveau`, identifiant du nouvel exemplaire.
   */
  exemplaire: Id.optional(),
  /** Ajoute un exemplaire de plus (sorte `exemplaires`), même si l'entrée est déjà possédée. */
  nouveau: z.boolean().optional(),
  /** Nombre d'unités de l'exemplaire (sorte `quantites`) : remplace la précédente. */
  quantite: z.number().int().positive().max(1_000_000).optional(),
  rang: z.number().int().nonnegative().max(1000).optional(),
  actif: z.boolean().optional(),
  choix: z.record(Id, z.array(Id).max(100)).optional(),
  champs: z
    .record(Id, z.union([z.number().finite(), z.string().max(10_000), z.boolean()]))
    .optional(),
  /** Effets propres à l'exemplaire (épée +1, bonus saisi sur un objet) : remplacent les précédents. */
  effets: z.array(Effet).max(20).optional(),
});
export type DemandePossession = z.output<typeof DemandePossession>;

/** Refuse des effets invalides avec le détail de chaque erreur (chemin et message). */
function verifierEffetsPoses(
  systeme: SystemeCharge,
  etat: EtatEntite,
  effets: readonly unknown[],
  prefixe: string,
  variables: Parameters<typeof compilerEffets>[4],
): void {
  const r = compilerEffets(
    systeme,
    etat.type,
    effets,
    (i, x) => `${prefixe}/effets/${i}/${x}`,
    variables,
  );
  if (r.erreurs.length) {
    throw refus(
      `Effets invalides : ${r.erreurs.map((e) => `${e.chemin} : ${e.message}`).join(' ; ')}`,
      'effets_invalides',
    );
  }
}

/** Nom lisible d'un exemplaire, pour les messages. */
function nomExemplaire(nom: string, exemplaire: string | undefined): string {
  return exemplaire === undefined ? nom : `${nom} (exemplaire « ${exemplaire} »)`;
}

/** 404 d'un exemplaire absent, avec la liste de ceux qui existent. */
function exemplaireIntrouvable(
  nom: string,
  exemplaire: string | undefined,
  siens: readonly Possession[],
): HttpError {
  const existants = siens.map((p) => p.exemplaire ?? '(sans identifiant)').join(', ');
  const quoi =
    exemplaire === undefined
      ? `${nom} : aucun exemplaire sans identifiant, précisez l’exemplaire`
      : `${nom} : exemplaire « ${exemplaire} » introuvable`;
  return HttpError.notFound(existants ? `${quoi} (exemplaires : ${existants})` : quoi);
}

/** Possession posée : nouvel état, et exemplaire touché (identifiant, s'il en a un). */
export interface PossessionPosee {
  etat: EtatEntite;
  exemplaire?: string;
  /** Vrai si un exemplaire a été ajouté (sinon, un exemplaire existant a changé). */
  cree: boolean;
}

/**
 * Ajoute une possession (objet, état, capacité…) ou met à jour un exemplaire
 * existant : seuls les champs fournis changent. Exemplaire visé :
 * - `nouveau: true` : un exemplaire de plus (sorte `exemplaires` si l'entrée
 *   est déjà possédée), d'identifiant `exemplaire`, ou généré
 *   (`nouvelExemplaire` : `2`, `3`…) ;
 * - sinon, l'exemplaire `exemplaire` (404 s'il n'existe pas) ou, sans
 *   `exemplaire`, celui sans identifiant, créé s'il n'existe pas.
 * `quantite` demande une sorte `quantites`, `exemplaire` une sorte
 * `exemplaires`. Les choix sont vérifiés contre ceux que l'entrée déclare ;
 * le reste (prérequis, effets) est recalculé.
 */
export function poserPossession(
  systeme: SystemeCharge,
  etat: EtatEntite,
  d: DemandePossession,
): PossessionPosee {
  const entree = systeme.entrees.get(d.entree);
  if (!entree) throw refus(`Entrée inconnue : ${d.entree}`, 'entree_inconnue');
  const sorte = systeme.sortes.get(entree.sorte)!;
  const entite = systeme.entites.get(etat.type)!;
  if (!sorte.pour.includes(etat.type))
    throw refus(`${sorte.nom} non possédable par ${entite.type.nom}`);
  if (d.rang !== undefined && d.rang > 0 && !sorte.rangs)
    throw refus(`${entree.nom} ne se possède pas par rangs`);
  if (d.quantite !== undefined && !sorte.quantites)
    throw refus(`${entree.nom} ne se possède pas en quantité (${sorte.nom})`, 'quantite_refusee');
  if (d.exemplaire !== undefined && !sorte.exemplaires)
    throw refus(
      `${entree.nom} ne se possède pas en plusieurs exemplaires (${sorte.nom})`,
      'exemplaires_refuses',
    );
  for (const k of Object.keys(d.choix ?? {})) {
    if (!entree.choix.some((c) => c.id === k) && !entree.choixAttributs.some((c) => c.id === k))
      throw refus(`${entree.nom} : choix inconnu ${k}`);
  }

  const possessions = etat.possessions.map((p) => ({ ...p }));
  const siens = possessions.filter((p) => p.entree === d.entree);
  let existante: Possession | undefined;
  let exemplaire = d.exemplaire;
  if (d.nouveau) {
    if (siens.length && !sorte.exemplaires)
      throw refus(
        `${entree.nom} est déjà possédé et ne se possède qu’une fois (${sorte.nom})`,
        'exemplaires_refuses',
      );
    if (exemplaire !== undefined && siens.some((p) => estExemplaire(p, d.entree, exemplaire)))
      throw refus(`${nomExemplaire(entree.nom, exemplaire)} existe déjà`, 'exemplaire_existant');
    if (exemplaire === undefined && siens.length)
      exemplaire = nouvelExemplaire(possessions, d.entree);
  } else {
    existante = sorte.exemplaires
      ? siens.find((p) => estExemplaire(p, d.entree, exemplaire))
      : siens[0];
    if (!existante && exemplaire !== undefined)
      throw exemplaireIntrouvable(entree.nom, exemplaire, siens);
    if (existante) exemplaire = existante.exemplaire;
  }

  if (d.effets !== undefined)
    verifierEffetsPoses(
      systeme,
      etat,
      d.effets,
      prefixeExemplaire({ entree: d.entree, ...(exemplaire !== undefined ? { exemplaire } : {}) }),
      variablesSource(sorte),
    );

  if (existante) {
    if (d.effets !== undefined) existante.effets = d.effets;
    if (d.rang !== undefined) existante.rang = d.rang;
    if (d.actif !== undefined) existante.actif = d.actif;
    if (d.choix !== undefined) existante.choix = d.choix;
    if (d.champs !== undefined) existante.champs = { ...existante.champs, ...d.champs };
    if (d.quantite !== undefined) existante.quantite = d.quantite;
    return {
      etat: { ...etat, possessions },
      ...(exemplaire !== undefined ? { exemplaire } : {}),
      cree: false,
    };
  }

  // Chaque exemplaire compte dans le maximum de la sorte
  const nombre = possessions.filter(
    (p) => systeme.entrees.get(p.entree)?.sorte === sorte.id,
  ).length;
  if (sorte.maximum !== undefined && nombre >= sorte.maximum)
    throw refus(`Maximum de ${sorte.maximum} ${sorte.nomPluriel ?? sorte.nom} atteint`);
  possessions.push(
    nouvellePossession(d.entree, d.rang ?? 0, {
      actif: d.actif ?? true,
      choix: d.choix ?? {},
      champs: d.champs ?? {},
      effets: d.effets ?? [],
      ...(exemplaire !== undefined ? { exemplaire } : {}),
      ...(d.quantite !== undefined ? { quantite: d.quantite } : {}),
    }),
  );
  return {
    etat: { ...etat, possessions },
    ...(exemplaire !== undefined ? { exemplaire } : {}),
    cree: true,
  };
}

/**
 * Retire un exemplaire précis d'une possession : celui d'identifiant
 * `exemplaire`, ou, sans identifiant, l'exemplaire sans identifiant (seule
 * possession d'une entrée d'une sorte sans exemplaires). Refusé si c'est le
 * dernier exemplaire d'une entrée qui ouvre un arbre dont des nœuds sont acquis.
 */
export function retirerPossession(
  systeme: SystemeCharge,
  etat: EtatEntite,
  entree: string,
  exemplaire?: string,
): EtatEntite {
  const siens = etat.possessions.filter((p) => p.entree === entree);
  if (!siens.length) throw HttpError.notFound(`Possession introuvable : ${entree}`);
  const nom = systeme.entrees.get(entree)?.nom ?? entree;
  const cible = siens.find((p) => estExemplaire(p, entree, exemplaire));
  if (!cible) throw exemplaireIntrouvable(nom, exemplaire, siens);
  if (siens.length === 1) {
    for (const arbre of systeme.arbres.values()) {
      if (arbre.ouvertPar === entree && etat.noeuds[arbre.id]?.length)
        throw refus(`Des nœuds de l’arbre « ${arbre.nom} » dépendent de ${entree}`);
    }
  }
  return { ...etat, possessions: etat.possessions.filter((p) => p !== cible) };
}

// ─── Bonus libres ─────────────────────────────────────────────────────────────

/** Bonus libre reçu du client : identifiant facultatif (créé à partir du nom). */
export const DemandeBonus = BonusLibre.extend({ id: Id.optional() });
export type DemandeBonus = z.output<typeof DemandeBonus>;

/** Pose un bonus libre, ou remplace celui qui a le même identifiant. */
export function poserBonus(systeme: SystemeCharge, etat: EtatEntite, d: DemandeBonus): EtatEntite {
  const id = d.id ?? identifiantBonus(d.nom, etat);
  verifierEffetsPoses(systeme, etat, d.effets, `bonus/${id}`, { rang: 'nombre', actif: 'booleen' });
  const bonus = { ...d, id };
  const autres = etat.bonus.filter((b) => b.id !== id);
  if (autres.length >= 100) throw refus('100 bonus libres au plus');
  return { ...etat, bonus: [...autres, bonus] };
}

export function retirerBonus(etat: EtatEntite, id: string): EtatEntite {
  if (!etat.bonus.some((b) => b.id === id)) throw HttpError.notFound(`Bonus introuvable : ${id}`);
  return { ...etat, bonus: etat.bonus.filter((b) => b.id !== id) };
}

function identifiantBonus(nom: string, etat: EtatEntite): string {
  const base =
    nom
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'bonus';
  let id = base;
  for (let n = 2; etat.bonus.some((b) => b.id === id); n++) id = `${base}-${n}`;
  return id;
}

// ─── Repos ────────────────────────────────────────────────────────────────────

/** Ramène les ressources (toutes, ou celles listées) à leur borne de récupération. */
export function reposer(fiche: Fiche, attributs?: string[]): EtatEntite {
  for (const cle of attributs ?? []) {
    if (fiche.entite.attributs.get(cle)?.nature !== 'ressource')
      throw refus(`${cle} n’est pas une ressource de ${fiche.entite.type.nom}`);
  }
  return recuperer(fiche, attributs);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export interface ActionResolue {
  resultat: ResultatAction;
  /**
   * Clés de tri de l'initiative (`initiative.tri` du système, dans l'ordre),
   * seulement pour l'action d'initiative du système lancée sans cible.
   */
  cles?: number[];
  /** Nouveaux états, seulement s'ils ont été modifiés (avec `appliquer`). */
  acteur?: EtatEntite;
  cible?: EtatEntite;
}

const messageErreurs = (erreurs: { parametre?: string; message: string }[]) =>
  erreurs.map((e) => (e.parametre ? `${e.parametre} : ${e.message}` : e.message)).join(' ; ');

/**
 * Exécute une action (jets tirés par `aleatoire`) et, avec `appliquer`, calcule
 * les nouveaux états de l'acteur et de la cible. Une cible identique à
 * l'acteur reçoit toutes les modifications sur le même état.
 *
 * L'action d'initiative du système, sans cible, passe par `initiative` de
 * @vtt/rules : le résultat porte en plus les clés de tri (`cles`), que le
 * service campaign utilise pour ordonner les participants d'un combat.
 */
export function resoudreAction(
  systeme: SystemeCharge,
  demande: {
    action: string;
    acteur: Fiche;
    cible?: Fiche;
    memeEntite?: boolean;
    parametres?: Record<string, Valeur>;
    appliquer: boolean;
    aleatoire: Generateur;
  },
): ActionResolue {
  let resultat: ResultatAction;
  let cles: number[] | undefined;
  const ini = systeme.source.initiative;
  if (ini && demande.action === ini.action && !demande.cible) {
    const r = initiative(
      systeme,
      [{ id: 'acteur', fiche: demande.acteur, parametres: demande.parametres ?? {} }],
      demande.aleatoire,
    );
    if (!r.ok) throw refus(messageErreurs(r.erreurs), 'action_refusee');
    resultat = r.ordre[0]!.resultat;
    cles = r.ordre[0]!.cles;
  } else {
    const r = executerAction(systeme, {
      action: demande.action,
      acteur: demande.acteur,
      ...(demande.cible ? { cible: demande.cible } : {}),
      ...(demande.parametres ? { parametres: demande.parametres } : {}),
      aleatoire: demande.aleatoire,
    });
    if (!r.ok) throw refus(messageErreurs(r.erreurs), 'action_refusee');
    resultat = r.resultat;
  }
  const base = { resultat, ...(cles ? { cles } : {}) };
  if (!demande.appliquer) return base;

  const mods = resultat.modifications;
  const touche = (entite: 'acteur' | 'cible') => mods.some((m) => m.entite === entite);
  const appliquer = (fiche: Fiche, entite?: 'acteur' | 'cible') => {
    try {
      return appliquerModifications(fiche, mods, entite);
    } catch (e) {
      throw refus(`Modification impossible : ${(e as Error).message}`, 'modification_invalide');
    }
  };

  if (demande.memeEntite) {
    return mods.length ? { ...base, acteur: appliquer(demande.acteur) } : base;
  }
  return {
    ...base,
    ...(touche('acteur') ? { acteur: appliquer(demande.acteur, 'acteur') } : {}),
    ...(demande.cible && touche('cible') ? { cible: appliquer(demande.cible, 'cible') } : {}),
  };
}

// ─── Durées ───────────────────────────────────────────────────────────────────

/**
 * Fin de round d'un combat : chaque possession à durée (état temporaire) et
 * chaque bonus libre à durée perd un round ; ceux arrivés à 0 sont retirés,
 * exemplaire par exemplaire (`entree`, `entree#exemplaire` pour un exemplaire
 * identifié, `bonus:<id>` pour un bonus). `etat` vaut `undefined` s'il n'y a aucune
 * durée (rien à enregistrer).
 */
export function decompterDurees(etat: EtatEntite): { etat?: EtatEntite; retirees: string[] } {
  const aDuree = (x: { duree?: number | undefined }) => x.duree !== undefined;
  if (!etat.possessions.some(aDuree) && !etat.bonus.some(aDuree)) return { retirees: [] };
  const retirees: string[] = [];
  const decompter = <T extends { duree?: number | undefined }>(x: T, nom: string): T[] => {
    if (x.duree === undefined) return [x];
    if (x.duree - 1 <= 0) {
      retirees.push(nom);
      return [];
    }
    return [{ ...x, duree: x.duree - 1 }];
  };
  const possessions = etat.possessions.flatMap((p) =>
    decompter(p, p.exemplaire === undefined ? p.entree : `${p.entree}#${p.exemplaire}`),
  );
  const bonus = etat.bonus.flatMap((b) => decompter(b, `bonus:${b.id}`));
  return { etat: { ...etat, possessions, bonus }, retirees };
}
