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
import { vueActeur, type Valeur } from '@vtt/rules';
import type { EventContext } from '../../db/outbox.js';
import type { Deps } from '../../deps.js';
import { jetPourDes, type VisibiliteJet } from '../../des/dice.js';
import { resoudreAction, verifierEtat } from '../../regles/operations.js';
import {
  enregistrer,
  journaliserAction,
  lire,
  systemeDe,
  verrouiller,
  versApi,
  type Appelant,
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

  let jet: Parameters<typeof jetPourDes> | undefined;
  const joue = await db.transaction(async (tx): Promise<ActionJouee> => {
    // En lecture seule, pas de verrou ; pour appliquer, acteur et cible sont
    // verrouillés ensemble jusqu'à la fin de la transaction
    const lignes = appliquer
      ? await verrouiller(tx, ids)
      : await Promise.all(ids.map((i) => lire(tx, i)));
    const acteur = lignes[0]!;
    const cible = cibleId ? (memeEntite ? acteur : lignes[1]!) : undefined;

    const systeme = systemeDe(catalogue, acteur, optionsActeur);
    if (cible && cible.systemId !== acteur.systemId)
      throw HttpError.badRequest(
        'La cible appartient à un autre système de jeu',
        'systeme_different',
      );
    const ficheActeur = verifierEtat(systeme, acteur.etat).fiche;
    const ficheCible = cible
      ? memeEntite
        ? ficheActeur
        : verifierEtat(systemeDe(catalogue, cible, optionsDe(cible.id)), cible.etat).fiche
      : undefined;

    const r = resoudreAction(systeme, {
      action,
      acteur: ficheActeur,
      ...(ficheCible ? { cible: ficheCible } : {}),
      memeEntite,
      ...(parametres ? { parametres } : {}),
      appliquer,
      aleatoire: deps.aleatoire(),
    });

    const details = { details: { action, cibleId: cibleId ?? null } };
    const acteurFinal = r.acteur
      ? await enregistrer(
          tx,
          ctx,
          catalogue,
          appelant,
          acteur,
          { etat: r.acteur },
          { operation: 'action', ...details },
          optionsActeur,
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
            optionsDe(cible.id),
          )
        : cible;

    await journaliserAction(tx, ctx, appelant, id, {
      action,
      cibleId: cibleId ?? null,
      applique: appliquer,
      resultat: r.resultat,
      ...(r.cles ? { cles: r.cles } : {}),
    });

    // Auteur du jet : l'utilisateur qui agit (pas de jet transmis pour un appel du système).
    // Avec une cible, seulement la vue de l'acteur : le déroulé nomme les défenses de la cible
    if (appelant.userId)
      jet = [
        systeme,
        acteur,
        cible ? vueActeur(systeme, r.resultat) : r.resultat,
        {
          authorId: appelant.userId,
          ...(demande.campaignId ? { campaignId: demande.campaignId } : {}),
          ...(demande.visibility ? { visibility: demande.visibility } : {}),
        },
      ];

    const base = { resultat: r.resultat, ...(r.cles ? { cles: r.cles } : {}) };
    if (!appliquer) return base;
    return {
      ...base,
      personnage: versApi(catalogue, acteurFinal, { options: optionsActeur }),
      ...(cibleFinale
        ? {
            cible: versApi(catalogue, memeEntite ? acteurFinal : cibleFinale, {
              options: optionsDe(cibleFinale.id),
            }),
          }
        : {}),
    };
  });

  // Après validation de la transaction : un jet d'une action annulée n'est jamais transmis
  if (jet) void deps.des.transmettre(jetPourDes(...jet), ctx.correlationId);
  return joue;
}
