/**
 * Action d'un personnage (jets tirés par le serveur), partagée par la route
 * publique et la route interne appelée par campaign (initiative). Les droits
 * sont vérifiés par l'appelant avant.
 *
 * Une fois l'action enregistrée, son jet est transmis au service dice pour
 * l'historique des jets (campagne `campaignId`, sinon jet personnel), sans
 * attendre ni échouer si dice ne répond pas.
 */
import { HttpError } from '@vtt/platform';
import {
  vueActeur,
  type Fiche,
  type ReglagesOptions,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import type { EventContext, Tx } from '../../db/outbox.js';
import type { Deps } from '../../deps.js';
import { jetPourDes, type VisibiliteJet } from '../../des/dice.js';
import { resoudreAction, verifierEtat, type ActionResolue } from '../../regles/operations.js';
import {
  enregistrer,
  journaliserAction,
  lire,
  systemeDe,
  verrouiller,
  versApi,
  type Appelant,
  type Ligne,
  type Personnage,
} from './depot.js';

export interface DemandeAction {
  id: string;
  action: string;
  parametres?: Record<string, Valeur>;
  cibleId?: string;
  appliquer: boolean;
  /** Historique des jets : campagne où le jet apparaît, et sa visibilité. */
  campaignId?: string;
  visibility?: VisibiliteJet;
}

export interface ActionJouee {
  resultat: unknown;
  /** Clés de tri, pour l'action d'initiative du système. */
  cles?: number[];
  personnage?: Personnage;
  cible?: Personnage;
}

/** Ce que partagent les étapes d'une action jouée. */
interface ContexteAction {
  catalogue: Deps['catalogue'];
  ctx: EventContext;
  appelant: Appelant;
  demande: DemandeAction;
  memeEntite: boolean;
  optionsActeur: ReglagesOptions;
  optionsDe: (ligneId: string) => ReglagesOptions | undefined;
}

/** Système et fiches de l'acteur et de la cible, qui doit être du même système. */
function fichesAction(
  c: ContexteAction,
  acteur: Ligne,
  cible: Ligne | undefined,
): { systeme: SystemeCharge; ficheActeur: Fiche; ficheCible: Fiche | undefined } {
  const { catalogue } = c;
  const systeme = systemeDe(catalogue, acteur, c.optionsActeur);
  if (cible && cible.systemId !== acteur.systemId)
    throw HttpError.badRequest(
      'La cible appartient à un autre système de jeu',
      'systeme_different',
    );
  const ficheActeur = verifierEtat(systeme, acteur.etat).fiche;
  let ficheCible: Fiche | undefined;
  if (cible)
    ficheCible = c.memeEntite
      ? ficheActeur
      : verifierEtat(systemeDe(catalogue, cible, c.optionsDe(cible.id)), cible.etat).fiche;
  return { systeme, ficheActeur, ficheCible };
}

/** Nouveaux états enregistrés, acteur puis cible, avec leurs événements. */
async function enregistrerAction(
  c: ContexteAction,
  tx: Tx,
  acteur: Ligne,
  cible: Ligne | undefined,
  r: ActionResolue,
): Promise<{ acteurFinal: Ligne; cibleFinale: Ligne | undefined }> {
  const { catalogue, ctx, appelant, demande } = c;
  const details = { details: { action: demande.action, cibleId: demande.cibleId ?? null } };
  const acteurFinal = r.acteur
    ? await enregistrer(
        tx,
        ctx,
        catalogue,
        appelant,
        acteur,
        { etat: r.acteur },
        { operation: 'action', ...details },
        c.optionsActeur,
      )
    : acteur;
  const cibleFinale =
    r.cible && cible
      ? await enregistrer(
          tx,
          ctx,
          catalogue,
          appelant,
          cible,
          { etat: r.cible },
          { operation: 'action.cible', ...details },
          c.optionsDe(cible.id),
        )
      : cible;
  return { acteurFinal, cibleFinale };
}

/**
 * Jet transmis à dice : auteur, l'utilisateur qui agit (aucun pour un appel du système).
 * Avec une cible, seulement la vue de l'acteur : le déroulé nomme les défenses de la cible.
 */
function jetAction(
  c: ContexteAction,
  systeme: SystemeCharge,
  acteur: Ligne,
  cible: Ligne | undefined,
  r: ActionResolue,
): Parameters<typeof jetPourDes> | undefined {
  const { appelant, demande } = c;
  if (!appelant.userId) return undefined;
  return [
    systeme,
    acteur,
    cible ? vueActeur(systeme, r.resultat) : r.resultat,
    {
      authorId: appelant.userId,
      ...(demande.campaignId ? { campaignId: demande.campaignId } : {}),
      ...(demande.visibility ? { visibility: demande.visibility } : {}),
    },
  ];
}

/** Réponse : le résultat, et les personnages à jour si l'action est appliquée. */
function reponseAction(
  c: ContexteAction,
  r: ActionResolue,
  acteurFinal: Ligne,
  cibleFinale: Ligne | undefined,
): ActionJouee {
  const { catalogue, memeEntite } = c;
  const base = { resultat: r.resultat, ...(r.cles ? { cles: r.cles } : {}) };
  if (!c.demande.appliquer) return base;
  return {
    ...base,
    personnage: versApi(catalogue, acteurFinal, { options: c.optionsActeur }),
    ...(cibleFinale
      ? {
          cible: versApi(catalogue, memeEntite ? acteurFinal : cibleFinale, {
            options: c.optionsDe(cibleFinale.id),
          }),
        }
      : {}),
  };
}

export async function jouerAction(
  deps: Pick<Deps, 'db' | 'catalogue' | 'aleatoire' | 'des' | 'droits'>,
  ctx: EventContext,
  appelant: Appelant,
  demande: DemandeAction,
): Promise<ActionJouee> {
  const { db, catalogue } = deps;
  const { id, action, parametres, cibleId, appliquer } = demande;
  const memeEntite = cibleId === id;
  const ids = cibleId && !memeEntite ? [id, cibleId] : [id];

  // Règles optionnelles de la campagne de chacun (réponses de campaign en cache)
  const [optionsActeur, optionsCible] = await Promise.all([
    deps.droits.options(id),
    cibleId && !memeEntite ? deps.droits.options(cibleId) : undefined,
  ]);
  const optionsDe = (ligneId: string) => (ligneId === id ? optionsActeur : optionsCible);
  const c: ContexteAction = {
    catalogue,
    ctx,
    appelant,
    demande,
    memeEntite,
    optionsActeur,
    optionsDe,
  };

  let jet: Parameters<typeof jetPourDes> | undefined;
  const joue = await db.transaction(async (tx): Promise<ActionJouee> => {
    // En lecture seule, pas de verrou ; pour appliquer, acteur et cible sont
    // verrouillés ensemble jusqu'à la fin de la transaction
    const lignes = appliquer
      ? await verrouiller(tx, ids)
      : await Promise.all(ids.map((i) => lire(tx, i)));
    const acteur = lignes[0]!;
    let cible: typeof acteur | undefined;
    if (cibleId) cible = memeEntite ? acteur : lignes[1]!;

    const { systeme, ficheActeur, ficheCible } = fichesAction(c, acteur, cible);
    const r = resoudreAction(systeme, {
      action,
      acteurId: acteur.id,
      acteur: ficheActeur,
      ...(ficheCible ? { cible: ficheCible } : {}),
      memeEntite,
      ...(parametres ? { parametres } : {}),
      appliquer,
      aleatoire: deps.aleatoire(),
    });

    const { acteurFinal, cibleFinale } = await enregistrerAction(c, tx, acteur, cible, r);
    await journaliserAction(tx, ctx, appelant, id, {
      action,
      cibleId: cibleId ?? null,
      applique: appliquer,
      resultat: r.resultat,
      ...(r.cles ? { cles: r.cles } : {}),
    });
    jet = jetAction(c, systeme, acteur, cible, r);
    return reponseAction(c, r, acteurFinal, cibleFinale);
  });

  // Après validation de la transaction : un jet d'une action annulée n'est jamais transmis
  if (jet) void deps.des.transmettre(jetPourDes(...jet), ctx.correlationId);
  return joue;
}
