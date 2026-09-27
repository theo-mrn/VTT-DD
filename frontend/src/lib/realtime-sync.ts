/**
 * Pont temps réel → cache TanStack Query pour les campagnes et les
 * personnages : les événements `campaign.*` et `character.*` du service
 * realtime (docs/api-realtime.md) invalident les requêtes concernées, qui se
 * relisent en REST. Le service fait autorité : on ne rejoue pas les diffs dans
 * le cache, on relit la donnée (déjà masquée comme il faut pour l'appelant).
 *
 * Une écriture du MJ sur la fiche d'un joueur est publiée dans sa campagne,
 * pour les MJ et le propriétaire (docs/api-character.md) : le joueur qui
 * regarde sa fiche la voit changer en direct.
 */
'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { clePersonnagesCampagne, clesCampagnes } from './campagnes';
import { clesPersonnages, type FichePersonnage } from './personnages';
import { useCampaignEvents, type RealtimeEvent } from './realtime';
import { useProfil } from './session';

const TYPES = ['campaign.*', 'character.*'] as const;

/** Listes de personnages (les miens, ceux des campagnes), sans les fiches complètes. */
function invaliderListesPersonnages(client: QueryClient) {
  void client.invalidateQueries({
    queryKey: clesPersonnages.racine,
    predicate: (q) => q.queryKey[1] !== 'un',
  });
}

/** Applique un événement au cache : invalide (ou retire) les requêtes qu'il rend périmées. */
export function appliquerEvenement(client: QueryClient, moi: string, e: RealtimeEvent): void {
  const { type, aggregate, payload, roomId } = e.event;

  if (type.startsWith('campaign.')) {
    const id = roomId ?? aggregate.id;
    // Campagne supprimée, ou j'en suis parti (exclu) : elle disparaît du cache
    if (
      type === 'campaign.deleted' ||
      (type === 'campaign.member_left' && payload.userId === moi)
    ) {
      client.removeQueries({ queryKey: clesCampagnes.une(id) });
      client.removeQueries({ queryKey: clePersonnagesCampagne(id) });
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
      void client.invalidateQueries({ queryKey: clesCampagnes.toutesPubliques });
      invaliderListesPersonnages(client);
      return;
    }
    // La discussion n'a pas d'écran ici
    if (type.startsWith('campaign.message_')) return;
    if (type === 'campaign.session_scheduled' || type === 'campaign.session_cancelled') {
      void client.invalidateQueries({ queryKey: clesCampagnes.sessions(id) });
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
      return;
    }
    void client.invalidateQueries({ queryKey: clesCampagnes.une(id), exact: true });
    void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
    // Engagements, personnage incarné, départs : la table et mes héros changent
    if (
      type.startsWith('campaign.character_') ||
      type === 'campaign.member_left' ||
      type === 'campaign.member_role_changed'
    ) {
      void client.invalidateQueries({ queryKey: clePersonnagesCampagne(id) });
      invaliderListesPersonnages(client);
    }
    return;
  }

  if (type.startsWith('character.')) {
    const id = aggregate.id;
    if (type === 'character.deleted') {
      client.removeQueries({ queryKey: clesPersonnages.un(id) });
      invaliderListesPersonnages(client);
      return;
    }
    if (type === 'character.updated') {
      const connue = client.getQueryData<FichePersonnage>(clesPersonnages.un(id));
      const version = typeof payload.version === 'number' ? payload.version : null;
      // Déjà à jour : c'est mon écriture, appliquée par sa réponse
      if (connue && version !== null && connue.version >= version) return;
      void client.invalidateQueries({ queryKey: clesPersonnages.un(id) });
      invaliderListesPersonnages(client);
      return;
    }
    if (type === 'character.created') invaliderListesPersonnages(client);
  }
}

/**
 * Tient à jour en direct une campagne (détail, sessions, personnages engagés)
 * et, s'il est donné, un personnage affiché. À chaque (ré)abonnement sans rejeu
 * possible, l'état est relu en REST. Sans campagne : rien.
 */
export function useSynchroCampagne(
  campaignId: string | null | undefined,
  options: { personnage?: string | null } = {},
): { live: boolean } {
  const client = useQueryClient();
  const moi = useProfil().id;
  const { live, generation } = useCampaignEvents(
    campaignId ?? null,
    TYPES,
    (e) => appliquerEvenement(client, moi, e),
    { enabled: Boolean(campaignId) },
  );
  const personnage = options.personnage ?? null;

  useEffect(() => {
    if (!campaignId || generation === 0) return;
    void client.invalidateQueries({ queryKey: clesCampagnes.une(campaignId) });
    void client.invalidateQueries({ queryKey: clePersonnagesCampagne(campaignId) });
    if (personnage) void client.invalidateQueries({ queryKey: clesPersonnages.un(personnage) });
  }, [client, campaignId, generation, personnage]);

  return { live };
}
