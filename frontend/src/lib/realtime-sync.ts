/**
 * Pont temps réel → cache TanStack Query pour les campagnes et les
 * personnages : les événements `campaign.*` et `character.*` du service
 * realtime (docs/api-realtime.md) invalident les requêtes concernées, qui se
 * relisent en REST. Le service fait autorité : on ne rejoue pas les diffs dans
 * le cache, on relit la donnée (déjà masquée comme il faut pour l'appelant).
 *
 * Une écriture du MJ sur la fiche d'un joueur est publiée dans sa campagne,
 * pour les MJ et le joueur qui l'incarne (docs/api-character.md) : il la voit
 * changer en direct. Un changement d'incarnation relit les fiches concernées
 * (la main sur la fiche suit l'incarnation). Un changement de mise en page
 * (`character.layout_changed`) est publié à toute la table.
 */
'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { campaignSettingsKey } from './campaign-settings';
import { clePersonnagesCampagne, clesCampagnes } from './campagnes';
import {
  clesPersonnages,
  invaliderListesAvec,
  reporterDansListes,
  type FichePersonnage,
} from './personnages';
import type { RealtimeEvent } from './realtime';
import { relireVersion, usePontCampagne, useRelectureUnique } from './realtime-bridge';
import { useProfil } from './session';

const TYPES = ['campaign.*', 'character.*'] as const;

/** Listes de personnages (les miens, ceux des campagnes), sans les fiches complètes. */
function invaliderListesPersonnages(client: QueryClient) {
  void client.invalidateQueries({
    queryKey: clesPersonnages.racine,
    predicate: (q) => q.queryKey[1] !== 'un',
  });
}

/**
 * Fiche changée ailleurs : affichée ici, elle est relue (sans annuler une lecture déjà en
 * route, revérifiée sur la version annoncée) et son résumé reporté dans les listes ; sinon,
 * seules les listes qui la montrent sont relues.
 */
function relireFicheChangee(client: QueryClient, id: string, version: number | null) {
  const cle = clesPersonnages.un(id);
  const affichee =
    (client.getQueryCache().find({ queryKey: cle, exact: true })?.getObserversCount() ?? 0) > 0;
  if (!affichee) {
    void client.invalidateQueries({ queryKey: cle });
    invaliderListesAvec(client, id);
    return;
  }
  void relireVersion<FichePersonnage>(client, cle, version, (f) => f.version).then(() => {
    const f = client.getQueryData<FichePersonnage>(cle);
    if (f) reporterDansListes(client, f);
    else invaliderListesAvec(client, id);
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
    // La discussion se tient à jour elle-même (lib/campaign-chat.ts)
    if (type.startsWith('campaign.message_')) return;
    // Réglages de table (lanceur de dés) : seule leur requête change
    if (type === 'campaign.settings_updated') {
      void client.invalidateQueries({ queryKey: campaignSettingsKey(id) });
      return;
    }
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
      // Qui incarne un personnage a la main sur sa fiche : ses droits (`permissions`) changent
      for (const cle of ['characterId', 'previousCharacterId'] as const) {
        const perso = payload[cle];
        if (typeof perso === 'string')
          void client.invalidateQueries({ queryKey: clesPersonnages.un(perso) });
      }
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
    // Mise en page de la fiche changée par son propriétaire ou le MJ : toute la table la relit
    if (type === 'character.updated' || type === 'character.layout_changed') {
      const connue = client.getQueryData<FichePersonnage>(clesPersonnages.un(id));
      const version = typeof payload.version === 'number' ? payload.version : null;
      // Déjà à jour : c'est mon écriture, appliquée par sa réponse
      if (connue && version !== null && connue.version >= version) return;
      // La mise en page ne change rien aux listes (nom, portrait, résumé)
      if (type === 'character.layout_changed') {
        void client.invalidateQueries({ queryKey: clesPersonnages.un(id) });
        return;
      }
      relireFicheChangee(client, id, version);
      return;
    }
    if (type === 'character.created') invaliderListesPersonnages(client);
  }
}

/**
 * Tient à jour en direct une campagne (détail, sessions, personnages engagés)
 * et, s'il est donné, un personnage affiché. À chaque (ré)abonnement sans rejeu
 * possible, l'état est relu en REST. Sans campagne : rien.
 *
 * Plusieurs composants le demandent (la table, la fiche, le HUD…) : le pont est
 * partagé, chaque événement appliqué une fois (`realtime-bridge.ts`).
 */
export function useSynchroCampagne(
  campaignId: string | null | undefined,
  options: { personnage?: string | null } = {},
): { live: boolean } {
  const client = useQueryClient();
  const moi = useProfil().id;
  const { live, generation } = usePontCampagne(
    'synchro',
    campaignId,
    TYPES,
    (c, _id, e) => appliquerEvenement(c, moi, e),
    (c, id) => {
      void c.invalidateQueries({ queryKey: clesCampagnes.une(id) });
      void c.invalidateQueries({ queryKey: clePersonnagesCampagne(id) });
    },
  );
  const personnage = options.personnage ?? null;
  useRelectureUnique(
    campaignId && personnage ? `synchro|${campaignId}|${personnage}` : null,
    generation,
    () => void client.invalidateQueries({ queryKey: clesPersonnages.un(personnage!) }),
  );

  return { live };
}
