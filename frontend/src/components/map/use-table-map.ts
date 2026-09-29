'use client';

/**
 * Quelle carte afficher à la table (docs/carte.md § 13, intégration) :
 * - un joueur suit la carte où se trouve son personnage (celui qu'il incarne d'abord), sinon
 *   celle du groupe (`partyMapId`) ;
 * - le MJ affiche la scène du groupe par défaut, et peut en ouvrir une autre (panneau Scènes :
 *   `?scene=` dans l'adresse, partageable) ;
 * - aucune : la toile d'attente de la table.
 *
 * Tenu à jour en direct : scènes, dossiers et réglages relus sur leurs événements ; le
 * déplacement d'un de mes personnages (`token.moved`) fait suivre la carte tout de suite.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MapScene, MapSettings } from '@vtt/contracts';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { TABLE_PARAMS } from '@/components/table/panels/registry';
import { mapKeys, mapsApi } from '@/lib/map/api';
import { useCampaignEvents } from '@/lib/realtime';

const EVENTS = ['map.*', 'map_group.*', 'map_settings.*', 'token.moved'] as const;

/** Carte où se trouve un de ces personnages (le premier trouvé dans l'ordre donné), ou null. */
async function findCharacterMap(
  campaignId: string,
  maps: readonly MapScene[],
  characterIds: readonly string[],
  partyMapId: string | null,
): Promise<string | null> {
  if (!characterIds.length || !maps.length) return null;
  // Une carte cachée aux joueurs n'est listée que si l'un de mes personnages s'y trouve
  const hidden = maps.filter((m) => !m.visibleToPlayers);
  const ordered = [
    ...maps.filter((m) => m.id === partyMapId),
    ...hidden.filter((m) => m.id !== partyMapId),
    ...maps.filter((m) => m.visibleToPlayers && m.id !== partyMapId),
  ];
  const hero = characterIds[0]!;
  let other: string | null = null;
  for (const map of ordered) {
    const tokens = await mapsApi.tokens(campaignId, map.id).catch(() => []);
    // Le personnage incarné (premier de la liste) passe avant les autres
    if (tokens.some((t) => t.characterId === hero)) return map.id;
    if (!other && tokens.some((t) => characterIds.includes(t.characterId))) other = map.id;
  }
  return other;
}

export interface TableMap {
  /** Carte à afficher (null : aucune). */
  mapId: string | null;
  /** Scènes connues (MJ : toutes ; joueur : celles qu'il voit). */
  maps: readonly MapScene[];
  settings: MapSettings | null;
  loading: boolean;
}

export function useTableMap(opts: {
  campaignId: string;
  gm: boolean;
  /** Mes personnages, celui que j'incarne d'abord. */
  characterIds: readonly string[];
}): TableMap {
  const { campaignId, gm, characterIds } = opts;
  const qc = useQueryClient();
  const requested = useSearchParams().get(TABLE_PARAMS.scene);

  const maps = useQuery({
    queryKey: mapKeys.list(campaignId),
    queryFn: () => mapsApi.list(campaignId),
  });
  const settings = useQuery({
    queryKey: mapKeys.settings(campaignId),
    queryFn: () => mapsApi.settings(campaignId),
  });
  const partyMapId = settings.data?.partyMapId ?? null;
  const whereKey = mapKeys.whereAmI(campaignId, characterIds);
  const where = useQuery({
    queryKey: whereKey,
    enabled: !gm && !!maps.data && !settings.isLoading && characterIds.length > 0,
    queryFn: () => findCharacterMap(campaignId, maps.data ?? [], characterIds, partyMapId),
  });

  useCampaignEvents(campaignId, EVENTS, (e) => {
    const { type, payload } = e.event;
    if (type.startsWith('map_group.')) {
      void qc.invalidateQueries({ queryKey: mapKeys.groups(campaignId) });
      return;
    }
    if (type.startsWith('map_settings.')) {
      void qc.invalidateQueries({ queryKey: mapKeys.settings(campaignId) });
      return;
    }
    if (type === 'token.moved') {
      const to = payload.to as { mapId?: string } | undefined;
      if (typeof payload.characterId === 'string' && characterIds.includes(payload.characterId)) {
        if (payload.characterId === characterIds[0] && to?.mapId)
          qc.setQueryData(whereKey, to.mapId);
        else void qc.invalidateQueries({ queryKey: whereKey });
        // Une carte cachée aux joueurs apparaît dans ma liste quand j'y arrive
        if (!gm) void qc.invalidateQueries({ queryKey: mapKeys.list(campaignId) });
      }
      return;
    }
    // Scènes créées, modifiées, cachées, supprimées
    void qc.invalidateQueries({ queryKey: mapKeys.list(campaignId) });
  });

  const list = maps.data;
  const mapId = useMemo(() => {
    if (!list?.length) return null;
    const has = (id: string | null | undefined): id is string =>
      !!id && list.some((m) => m.id === id);
    if (gm) {
      if (has(requested)) return requested;
      if (has(partyMapId)) return partyMapId;
      return list.find((m) => m.isDefault)?.id ?? list[0]!.id;
    }
    if (has(where.data)) return where.data;
    if (has(partyMapId)) return partyMapId;
    return list.find((m) => m.isDefault && m.visibleToPlayers)?.id ?? null;
  }, [list, gm, requested, partyMapId, where.data]);

  return {
    mapId,
    maps: list ?? [],
    settings: settings.data ?? null,
    loading:
      maps.isLoading ||
      settings.isLoading ||
      (!gm && where.isLoading && where.fetchStatus !== 'idle'),
  };
}

/** MJ : ouvre une scène à la table (`?scene=`) ; null : revient à celle du groupe. */
export function openScene(mapId: string | null) {
  const url = new URL(window.location.href);
  if (mapId) url.searchParams.set(TABLE_PARAMS.scene, mapId);
  else url.searchParams.delete(TABLE_PARAMS.scene);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
