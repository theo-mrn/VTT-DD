'use client';

/**
 * Relie la table au module `tokens` (surcouche sans rendu) : ce que les tokens affichent de
 * leur personnage vient de React et part dans l'annuaire du module.
 *
 * - Liste des personnages de la campagne (`GET /characters`, filtrée par le service : un
 *   joueur n'y trouve que les PNJ dont un token lui est visible) : nom, portrait, camp.
 * - Fiches complètes, calculées par `@vtt/rules` avec le système de la campagne : ressource
 *   principale. MJ : tous les personnages posés sur la carte ; joueur : les siens.
 * - Un token dont le personnage n'est pas encore dans la liste (PNJ qui vient d'apparaître)
 *   fait relire la liste, une fois par personnage toutes les 10 s au plus.
 * Les fiches partagent le cache de la fiche (`clesPersonnages.un`) : une écriture ou un
 * `character.updated` met la jauge à jour.
 */
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Fiche } from '@vtt/rules';
import { useEffect, useMemo, useRef } from 'react';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { campagnes, clePersonnagesCampagne, useCampagne } from '@/lib/campagnes';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { CharacterInfo, ResourceGauge, TokenData } from '../engine/model';
import { clesPersonnages, personnages, type FichePersonnage } from '@/lib/personnages';
import { calculerMemo } from '@/lib/rules-cache';
import { useMapState } from '@/components/map/engine-context';
import { mainResource } from './resource';
import { useTokens } from './use-tokens';
import { compareCodeUnits } from '@vtt/contracts';

/** Délai avant de relire la liste pour un personnage inconnu, puis entre deux essais. */
const ASK_DELAY_MS = 600;
const ASK_AGAIN_MS = 10_000;

const EMPTY: ReadonlyMap<string, unknown> = new Map();

/** Données des fiches (fonction stable : TanStack ne recombine que si une fiche change). */
const dataOf = (results: readonly { data?: FichePersonnage }[]) => results.map((r) => r.data);

export function TokenCharacterFeed({ engine }: { engine: MapEngine }) {
  const tokens = useTokens(engine);
  const client = useQueryClient();
  const campaignId = engine.store.getState().campaignId;
  const gm = engine.viewer.role === 'gm';
  const mine = engine.viewer.characterIds;

  const list = useQuery({
    queryKey: clePersonnagesCampagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
  });
  const campagne = useCampagne(campaignId);
  const sys = useCampaignSystem(campagne.data?.system, campaignId);

  // Personnages posés sur la carte (brouillons exclus)
  const tokenMap = useMapState((s) => s.collections.tokens ?? EMPTY);
  const characterIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tokenMap.values()) {
      const d = t as TokenData;
      if (!d.draft && typeof d.characterId === 'string') ids.add(d.characterId);
    }
    return [...ids].sort(compareCodeUnits);
  }, [tokenMap]);

  // Fiches à lire : toutes pour le MJ, les siennes pour un joueur
  const sheetIds = useMemo(
    () => (gm ? characterIds : characterIds.filter((id) => mine.includes(id))),
    [gm, characterIds, mine],
  );
  const sheets = useQueries({
    queries: sheetIds.map((id) => ({
      queryKey: clesPersonnages.un(id),
      queryFn: () => personnages.lire(id),
      staleTime: 30_000,
      retry: false,
    })),
    combine: dataOf,
  });

  // Ressource principale de chaque fiche, recalculée seulement quand la fiche change
  const cache = useRef(
    new WeakMap<FichePersonnage, { sys: unknown; gauge: ResourceGauge | null }>(),
  );
  const resources = useMemo(() => {
    const out = new Map<string, ResourceGauge | null>();
    const s = sys.data;
    if (!s) return out;
    for (const fiche of sheets) {
      if (!fiche) continue;
      const known = cache.current.get(fiche);
      if (known && known.sys === s) {
        out.set(fiche.id, known.gauge);
        continue;
      }
      let gauge: ResourceGauge | null = null;
      try {
        const calculee: Fiche = calculerMemo(s.systeme, fiche.state);
        gauge = mainResource({
          systeme: s.systeme,
          presentation: s.presentation,
          fiche: calculee,
          personnage: { id: fiche.id, name: fiche.name, roomId: campaignId },
          mj: gm,
        });
      } catch {
        gauge = null;
      }
      cache.current.set(fiche, { sys: s, gauge });
      out.set(fiche.id, gauge);
    }
    return out;
  }, [sheets, sys.data, campaignId, gm]);

  const infos = useMemo<CharacterInfo[]>(
    () =>
      (list.data ?? []).map((c) => ({
        id: c.characterId,
        name: c.name,
        portraitUrl: c.avatarUrl,
        tokenUrl: c.tokenUrl ?? null,
        side: c.side,
        kind: c.kind,
        ownerId: c.ownerId,
        playedBy: c.playedBy,
        resource: resources.get(c.characterId) ?? null,
      })),
    [list.data, resources],
  );

  useEffect(() => {
    tokens.directory.replace(infos);
  }, [tokens, infos]);

  // Personnage inconnu de la liste (PNJ qui vient d'apparaître) : la liste est relue
  const asked = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!list.data) return;
    const known = new Set(list.data.map((c) => c.characterId));
    const now = Date.now();
    const missing = characterIds.filter(
      (id) => !known.has(id) && now - (asked.current.get(id) ?? 0) > ASK_AGAIN_MS,
    );
    if (!missing.length || timer.current) return;
    for (const id of missing) asked.current.set(id, now);
    timer.current = setTimeout(() => {
      timer.current = null;
      void client.invalidateQueries({ queryKey: clePersonnagesCampagne(campaignId) });
    }, ASK_DELAY_MS);
  }, [client, campaignId, characterIds, list.data]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return null;
}
