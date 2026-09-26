/**
 * Action d'un personnage (jets tirés par le serveur), partagée par la route
 * publique et la route interne appelée par campaign (initiative). Les droits
 * sont vérifiés par l'appelant avant.
 */
import { HttpError } from '@vtt/platform';
import type { Valeur } from '@vtt/rules';
import type { EventContext } from '../../db/outbox.js';
import type { Deps } from '../../deps.js';
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
}

export interface ActionJouee {
  resultat: unknown;
  /** Clés de tri, pour l'action d'initiative du système. */
  cles?: number[];
  personnage?: Personnage;
  cible?: Personnage;
}

export async function jouerAction(
  deps: Pick<Deps, 'db' | 'catalogue' | 'aleatoire'>,
  ctx: EventContext,
  appelant: Appelant,
  demande: DemandeAction,
): Promise<ActionJouee> {
  const { db, catalogue } = deps;
  const { id, action, parametres, cibleId, appliquer } = demande;
  const memeEntite = cibleId === id;
  const ids = cibleId && !memeEntite ? [id, cibleId] : [id];

  return db.transaction(async (tx) => {
    // En lecture seule, pas de verrou ; pour appliquer, acteur et cible sont
    // verrouillés ensemble jusqu'à la fin de la transaction
    const lignes = appliquer
      ? await verrouiller(tx, ids)
      : await Promise.all(ids.map((i) => lire(tx, i)));
    const acteur = lignes[0]!;
    const cible = cibleId ? (memeEntite ? acteur : lignes[1]!) : undefined;

    const systeme = systemeDe(catalogue, acteur);
    if (cible && cible.systemId !== acteur.systemId)
      throw HttpError.badRequest(
        'La cible appartient à un autre système de jeu',
        'systeme_different',
      );
    const ficheActeur = verifierEtat(systeme, acteur.etat).fiche;
    const ficheCible = cible
      ? memeEntite
        ? ficheActeur
        : verifierEtat(systeme, cible.etat).fiche
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
          )
        : cible;

    await journaliserAction(tx, ctx, appelant, id, {
      action,
      cibleId: cibleId ?? null,
      applique: appliquer,
      resultat: r.resultat,
      ...(r.cles ? { cles: r.cles } : {}),
    });

    const base = { resultat: r.resultat, ...(r.cles ? { cles: r.cles } : {}) };
    if (!appliquer) return base;
    return {
      ...base,
      personnage: versApi(catalogue, acteurFinal),
      ...(cibleFinale ? { cible: versApi(catalogue, memeEntite ? acteurFinal : cibleFinale) } : {}),
    };
  });
}
