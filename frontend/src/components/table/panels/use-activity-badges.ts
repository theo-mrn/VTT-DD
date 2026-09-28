'use client';

import { useMemo, useRef } from 'react';
import { useCampaignEvents } from '@/lib/realtime';
import type { TablePanel } from './registry';
import { usePanelStoreApi } from './store';

const correspond = (motif: string, type: string) =>
  motif.endsWith('.*') ? type.startsWith(motif.slice(0, -1)) : motif === type;

/**
 * Pastilles de non-lus : un événement temps réel déclaré par un panneau (`activity` du registre)
 * arrive pendant qu'il est fermé, et n'est pas de mon fait. Seul le type de l'événement est lu
 * ici ; un domaine qui doit écarter ce qui ne me concerne pas fournit son `activityFilter`.
 */
export function useActivityBadges(
  campaignId: string,
  viewer: { userId: string; gm: boolean },
  panels: TablePanel[],
) {
  const store = usePanelStoreApi();
  const suivis = useMemo(() => panels.filter((p) => p.activity?.length), [panels]);
  const types = useMemo(() => [...new Set(suivis.flatMap((p) => p.activity ?? []))], [suivis]);
  const ref = useRef(suivis);
  ref.current = suivis;
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  useCampaignEvents(
    campaignId,
    types,
    (e) => {
      if (e.event.actor.userId === viewerRef.current.userId) return;
      for (const p of ref.current)
        if (
          p.activity?.some((m) => correspond(m, e.event.type)) &&
          (!p.activityFilter || p.activityFilter(e.event, viewerRef.current))
        )
          store.getState().bumpBadge(p.id);
    },
    { enabled: types.length > 0 },
  );
}
