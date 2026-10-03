/**
 * Pont partagé entre le temps réel et le cache TanStack Query : plusieurs
 * composants (la table, la fiche, le HUD, chaque liste d'attaques…) demandent
 * le même pont pour une campagne et un domaine, mais chaque événement n'est
 * appliqué qu'une fois au cache, et la relecture d'un (ré)abonnement aussi.
 * Sans cela, N abonnés font N invalidations par message, donc N requêtes.
 *
 * Les composants restent abonnés chacun (l'abonnement et `live` les suivent) :
 * une fiche hors de la table reste synchronisée, la dernière à se démonter
 * libère le pont.
 */
'use client';

import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useCampaignEvents, type RealtimeEvent } from './realtime';

/** Événements récents déjà appliqués, par cache et par domaine (borné). */
const MEMOIRE_EVENEMENTS = 256;
const appliques = new WeakMap<QueryClient, Map<string, Set<string>>>();

/** Vrai la première fois que cet événement arrive pour ce domaine sur ce cache. */
export function premiereFois(client: QueryClient, domaine: string, e: RealtimeEvent): boolean {
  let parDomaine = appliques.get(client);
  if (!parDomaine) appliques.set(client, (parDomaine = new Map()));
  let vus = parDomaine.get(domaine);
  if (!vus) parDomaine.set(domaine, (vus = new Set()));
  const id = e.event.id || `${e.seq}`;
  if (vus.has(id)) return false;
  vus.add(id);
  if (vus.size > MEMOIRE_EVENEMENTS) {
    const ancien = vus.values().next().value;
    if (ancien !== undefined) vus.delete(ancien);
  }
  return true;
}

/**
 * Relit une requête annoncée changée en version `version`, sans annuler une lecture déjà
 * en route (`cancelRefetch: false`) ; si la donnée reçue reste plus ancienne (lecture
 * partie avant le changement), relit encore une fois. Résolue une fois la donnée relue.
 * Sans version annoncée, la relecture repart de zéro.
 */
export async function relireVersion<T>(
  client: QueryClient,
  queryKey: QueryKey,
  version: number | null,
  versionDe: (data: T) => number,
): Promise<void> {
  // Sans version, impossible de savoir si une lecture en route suffit : on la relance
  if (version === null) return client.invalidateQueries({ queryKey, exact: true });
  await client.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
  const data = client.getQueryData<T>(queryKey);
  if (data != null && versionDe(data) >= version) return;
  // Personne ne l'affiche plus (rien relu) : elle reste marquée périmée
  if (!client.getQueryCache().find({ queryKey, exact: true })?.getObserversCount()) return;
  await client.invalidateQueries({ queryKey, exact: true });
}

/**
 * Relectures déjà faites, par cache et par clé (domaine, campagne, ressource) :
 * `abonnes` compte les composants montés ; à zéro, l'entrée est oubliée et la
 * prochaine génération vue relit tout, même si son numéro est le même.
 */
interface Relecture {
  abonnes: number;
  generation: number;
}
const relectures = new WeakMap<QueryClient, Map<string, Relecture>>();

/**
 * Lance `relire` une seule fois par génération pour la clé, quel que soit le
 * nombre de composants qui la demandent. `cle` null : rien.
 */
export function useRelectureUnique(cle: string | null, generation: number, relire: () => void) {
  const client = useQueryClient();
  const relireRef = useRef(relire);
  relireRef.current = relire;

  useEffect(() => {
    if (!cle) return;
    let parCle = relectures.get(client);
    if (!parCle) relectures.set(client, (parCle = new Map()));
    const r = parCle.get(cle) ?? { abonnes: 0, generation: 0 };
    r.abonnes += 1;
    parCle.set(cle, r);
    return () => {
      r.abonnes -= 1;
      if (r.abonnes <= 0 && parCle.get(cle) === r) parCle.delete(cle);
    };
  }, [client, cle]);

  useEffect(() => {
    if (!cle || generation === 0) return;
    const r = relectures.get(client)?.get(cle);
    if (r) {
      if (r.generation === generation) return;
      r.generation = generation;
    }
    relireRef.current();
  }, [client, cle, generation]);
}

/**
 * Événements `types` d'une campagne appliqués au cache par `appliquer`, une
 * fois chacun, et `relire` une fois par (ré)abonnement sans rejeu.
 */
export function usePontCampagne(
  domaine: string,
  campaignId: string | null | undefined,
  types: readonly string[],
  appliquer: (client: QueryClient, campaignId: string, e: RealtimeEvent) => void,
  relire: (client: QueryClient, campaignId: string) => void,
  enabled = true,
): { live: boolean; generation: number } {
  const client = useQueryClient();
  const on = Boolean(campaignId) && enabled;
  const { live, generation } = useCampaignEvents(
    campaignId ?? null,
    types,
    (e) => {
      if (campaignId && premiereFois(client, domaine, e)) appliquer(client, campaignId, e);
    },
    { enabled: on },
  );
  useRelectureUnique(on ? `${domaine}|${campaignId}` : null, generation, () =>
    relire(client, campaignId!),
  );
  return { live, generation };
}
