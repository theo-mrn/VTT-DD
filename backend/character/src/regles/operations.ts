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
  appliquerModifications,
  calculer,
  choisirEtape,
  creationDe,
  EtatEntite,
  executerAction,
  recuperer,
  rembourser,
  repartirEtape,
  saisirEtape,
  terminerCreation,
  tirerEtape,
  type Attribut,
  type Fiche,
  type Generateur,
  type ResultatAction,
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
 * Saisie libre de valeurs : texte, choix, booléen et ressource à tout moment,
 * attributs de base seulement pendant la création (ensuite, ils s'achètent).
 */
export function modifierValeurs(
  systeme: SystemeCharge,
  etat: EtatEntite,
  valeurs: Record<string, Valeur>,
): EtatEntite {
  const entite = systeme.entites.get(etat.type)!;
  const erreurs: string[] = [];
  const suivant: EtatEntite = { ...etat, valeurs: { ...etat.valeurs } };
  for (const [cle, v] of Object.entries(valeurs)) {
    const a = entite.attributs.get(cle);
    if (!a) erreurs.push(`Attribut inconnu : ${cle}`);
    else if (a.nature === 'derivee') erreurs.push(`${a.nom} est calculé, il ne se saisit pas`);
    else if (a.nature === 'base' && !etat.creation)
      erreurs.push(`${a.nom} ne se saisit que pendant la création (ensuite, il s’achète)`);
    else suivant.valeurs[cle] = v;
  }
  if (erreurs.length) throw refus(erreurs.join(' ; '));
  const fiche = calculer(systeme, suivant);
  for (const [cle, v] of Object.entries(valeurs)) {
    const err = erreurValeur(fiche, entite.attributs.get(cle)!, v);
    if (err) erreurs.push(err);
  }
  if (erreurs.length) throw refus(erreurs.join(' ; '));
  return suivant;
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
  rang: z.number().int().nonnegative().max(1000).optional(),
  actif: z.boolean().optional(),
  choix: z.record(Id, z.array(Id).max(100)).optional(),
  champs: z
    .record(Id, z.union([z.number().finite(), z.string().max(10_000), z.boolean()]))
    .optional(),
});
export type DemandePossession = z.output<typeof DemandePossession>;

/**
 * Ajoute une possession (objet, état, capacité…) ou met à jour celle qui
 * existe : seuls les champs fournis changent. Les choix sont vérifiés contre
 * ceux que l'entrée déclare ; le reste (prérequis, effets) est recalculé.
 */
export function poserPossession(
  systeme: SystemeCharge,
  etat: EtatEntite,
  d: DemandePossession,
): EtatEntite {
  const entree = systeme.entrees.get(d.entree);
  if (!entree) throw refus(`Entrée inconnue : ${d.entree}`, 'entree_inconnue');
  const sorte = systeme.sortes.get(entree.sorte)!;
  const entite = systeme.entites.get(etat.type)!;
  if (!sorte.pour.includes(etat.type))
    throw refus(`${sorte.nom} non possédable par ${entite.type.nom}`);
  if (d.rang !== undefined && d.rang > 0 && !sorte.rangs)
    throw refus(`${entree.nom} ne se possède pas par rangs`);
  for (const k of Object.keys(d.choix ?? {})) {
    if (!entree.choix.some((c) => c.id === k) && !entree.choixAttributs.some((c) => c.id === k))
      throw refus(`${entree.nom} : choix inconnu ${k}`);
  }

  const possessions = etat.possessions.map((p) => ({ ...p }));
  const existante = possessions.find((p) => p.entree === d.entree);
  if (existante) {
    if (d.rang !== undefined) existante.rang = d.rang;
    if (d.actif !== undefined) existante.actif = d.actif;
    if (d.choix !== undefined) existante.choix = d.choix;
    if (d.champs !== undefined) existante.champs = { ...existante.champs, ...d.champs };
  } else {
    const nombre = possessions.filter(
      (p) => systeme.entrees.get(p.entree)?.sorte === sorte.id,
    ).length;
    if (sorte.maximum !== undefined && nombre >= sorte.maximum)
      throw refus(`Maximum de ${sorte.maximum} ${sorte.nomPluriel ?? sorte.nom} atteint`);
    possessions.push({
      entree: d.entree,
      rang: d.rang ?? 0,
      actif: d.actif ?? true,
      choix: d.choix ?? {},
      champs: d.champs ?? {},
    });
  }
  return { ...etat, possessions };
}

/** Retire une possession, sauf si un arbre qu'elle ouvre a encore des nœuds acquis. */
export function retirerPossession(
  systeme: SystemeCharge,
  etat: EtatEntite,
  entree: string,
): EtatEntite {
  if (!etat.possessions.some((p) => p.entree === entree))
    throw HttpError.notFound(`Possession introuvable : ${entree}`);
  for (const arbre of systeme.arbres.values()) {
    if (arbre.ouvertPar === entree && etat.noeuds[arbre.id]?.length)
      throw refus(`Des nœuds de l’arbre « ${arbre.nom} » dépendent de ${entree}`);
  }
  return { ...etat, possessions: etat.possessions.filter((p) => p.entree !== entree) };
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
  /** Nouveaux états, seulement s'ils ont été modifiés (avec `appliquer`). */
  acteur?: EtatEntite;
  cible?: EtatEntite;
}

/**
 * Exécute une action (jets tirés par `aleatoire`) et, avec `appliquer`, calcule
 * les nouveaux états de l'acteur et de la cible. Une cible identique à
 * l'acteur reçoit toutes les modifications sur le même état.
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
  const r = executerAction(systeme, {
    action: demande.action,
    acteur: demande.acteur,
    ...(demande.cible ? { cible: demande.cible } : {}),
    ...(demande.parametres ? { parametres: demande.parametres } : {}),
    aleatoire: demande.aleatoire,
  });
  if (!r.ok) {
    throw refus(
      r.erreurs.map((e) => (e.parametre ? `${e.parametre} : ${e.message}` : e.message)).join(' ; '),
      'action_refusee',
    );
  }
  const resultat = r.resultat;
  if (!demande.appliquer) return { resultat };

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
    return mods.length ? { resultat, acteur: appliquer(demande.acteur) } : { resultat };
  }
  return {
    resultat,
    ...(touche('acteur') ? { acteur: appliquer(demande.acteur, 'acteur') } : {}),
    ...(demande.cible && touche('cible') ? { cible: appliquer(demande.cible, 'cible') } : {}),
  };
}
